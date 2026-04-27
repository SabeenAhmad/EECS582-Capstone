#!/usr/bin/env python3

"""
Code Artifact Name: lidar_vehicle_detector.py
Brief Description:
This script reads LiDAR-Lite v3 distance measurements, filters the readings,
detects vehicle passes using a state machine, and can optionally post confirmed
vehicle events to Firebase endpoints for parking-count updates.

Programmer: sabeen
Preconditions:
- Python 3 is available.
- I2C access to a LiDAR-Lite v3 sensor and the smbus2 package must be installed.
- Firebase URLs, sensor IDs, and lot IDs must be configured if event posting is
  enabled.

Acceptable Input Values or Types and Meanings:
- Command-line arguments
- Timing and threshold arguments: positive float values representing seconds,
  centimeters, or detection thresholds.
- --sensor-label, --sensor-id, --lot-id, --firebase-url, --api-key: strings
  used for logging and optional backend integration.
- Sensor readings are expected to be numeric distance values in centimeters.

Unacceptable Input Values or Types and Meanings:
- Missing smbus2 dependency when running against physical hardware causes
  runtime failure.
- Non-numeric or malformed numeric CLI values are rejected by argparse.
- Negative or unrealistic timing/threshold values may lead to unreliable
  detection behavior.
- Invalid Firebase URLs, inaccessible endpoints, or bad authentication values
  prevent event delivery.
- Calibration with an obstructed detection zone can produce an incorrect
  baseline and inaccurate results.

Postconditions:
- If enabled, confirmed vehicle-pass events are submitted to the configured
  Firebase endpoint.


Error and Exception Conditions That Can Occur:
- RuntimeError: raised when hardware mode is requested without smbus2 or when
  polling occurs before calibration.
- KeyboardInterrupt: stops live monitoring gracefully.

Side Effects:
- Reads from LiDAR hardware over I2C when not in mock mode.
- Writes operational messages and event logs to stdout.
- Sends HTTP POST requests to Firebase when configured to do so.
- Sleeps between sensor polls and calibration samples.

Known Faults:
- Detection accuracy depends heavily on sensor placement and threshold tuning.
- Network delivery failures are logged but not retried.
- This implementation assumes a single monitored lane or detection zone.
"""

from __future__ import annotations

import argparse
import json
import random
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol

try:
    from smbus2 import SMBus  # type: ignore
except ImportError:
    SMBus = None  # Allows mock-mode testing without dependency installed.


class DistanceSensor(Protocol):
    def read_distance_cm(self) -> float:
        """Return distance in centimeters."""


class LidarLiteV3:
    """
    Minimal LiDAR-Lite v3 reader (I2C).

    Notes:
    - Default I2C address is usually 0x62.
    - This is a starter implementation; timing and filtering may need tuning.
    """

    DEFAULT_ADDRESS = 0x62

    # Common LIDAR-Lite v3 register usage.
    REG_ACQ_COMMAND = 0x00
    ACQ_WITH_DC_CORRECTION = 0x04
    REG_STATUS = 0x01
    REG_DISTANCE_HIGH = 0x0F
    REG_DISTANCE_LOW = 0x10

    def __init__(self, bus_num: int = 1, address: int = DEFAULT_ADDRESS) -> None:
        if SMBus is None:
            raise RuntimeError("smbus2 is not installed. Install it or run with --mock.")
        self.address = address
        self.bus = SMBus(bus_num)

    def _start_measurement(self) -> None:
        self.bus.write_byte_data(
            self.address,
            self.REG_ACQ_COMMAND,
            self.ACQ_WITH_DC_CORRECTION,
        )

    def _wait_until_ready(self, timeout_s: float = 0.02) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            status = self.bus.read_byte_data(self.address, self.REG_STATUS)
            if (status & 0x01) == 0:
                return
            time.sleep(0.001)
        # Skeleton behavior: continue and attempt read; you may prefer raising.

    def read_distance_cm(self) -> float:
        self._start_measurement()
        self._wait_until_ready()
        high = self.bus.read_byte_data(self.address, self.REG_DISTANCE_HIGH)
        low = self.bus.read_byte_data(self.address, self.REG_DISTANCE_LOW)
        return float((high << 8) | low)

    def close(self) -> None:
        self.bus.close()


class MockLidarLiteV3:
    """
    Simulates a mostly stable background with occasional "car passes".
    """

    def __init__(self, baseline_cm: float = 350.0) -> None:
        self.baseline_cm = baseline_cm
        self._in_car_window = False
        self._car_end_time = 0.0
        self._next_car_time = time.monotonic() + random.uniform(3, 8)

    def read_distance_cm(self) -> float:
        now = time.monotonic()

        if not self._in_car_window and now >= self._next_car_time:
            self._in_car_window = True
            self._car_end_time = now + random.uniform(0.8, 2.2)

        if self._in_car_window and now >= self._car_end_time:
            self._in_car_window = False
            self._next_car_time = now + random.uniform(4, 9)

        noise = random.uniform(-3, 3)
        if self._in_car_window:
            # Car appears closer than the empty background.
            return max(20.0, self.baseline_cm - random.uniform(120, 220) + noise)
        return self.baseline_cm + noise


@dataclass
class DetectorConfig:
    sample_interval_s: float = 0.05
    calibration_samples: int = 30
    filter_window_size: int = 5
    min_drop_from_baseline_cm: float = 60.0
    enter_consecutive_hits: int = 4
    exit_consecutive_misses: int = 2
    min_presence_time_s: float = 0.55
    max_presence_time_s: float = 15.0
    min_vehicle_signature: float = 220.0
    min_vehicle_peak_drop_cm: float = 85.0
    pedestrian_max_presence_s: float = 1.2
    pedestrian_max_peak_drop_cm: float = 75.0
    min_inter_event_gap_s: float = 0.12
    stalled_vehicle_warning_s: float = 4.0


class VehiclePassDetector:
    """
    Simple state machine:
    - Calibrates baseline (empty-road distance)
    - Detects when distance drops significantly (vehicle present)
    - Counts one pass when vehicle leaves after a valid dwell time
    """

    def __init__(self, sensor: DistanceSensor, config: DetectorConfig) -> None:
        self.sensor = sensor
        self.config = config
        self.baseline_cm: Optional[float] = None
        self.recent_distances: deque[float] = deque(maxlen=config.filter_window_size)
        self.vehicle_present = False
        self.enter_hits = 0
        self.exit_misses = 0
        self.candidate_since: Optional[float] = None
        self.candidate_peak_drop_cm = 0.0
        self.present_since: Optional[float] = None
        self.peak_drop_cm = 0.0
        self.blocked_warning_emitted = False
        self.last_count_time = 0.0
        self.total_passes = 0

    def calibrate(self) -> float:
        readings = []
        for _ in range(self.config.calibration_samples):
            readings.append(self.sensor.read_distance_cm())
            time.sleep(self.config.sample_interval_s)
        # Use the median baseline so one noisy sample does not skew calibration.
        readings.sort()
        self.baseline_cm = readings[len(readings) // 2]
        return self.baseline_cm

    def _filtered_distance_cm(self) -> float:
        raw = self.sensor.read_distance_cm()
        self.recent_distances.append(raw)
        sorted_window = sorted(self.recent_distances)
        return sorted_window[len(sorted_window) // 2]

    def _is_vehicle_present(self, distance_cm: float) -> bool:
        if self.baseline_cm is None:
            raise RuntimeError("Detector must be calibrated before use.")
        return (self.baseline_cm - distance_cm) >= self.config.min_drop_from_baseline_cm

    def poll(self) -> Optional[dict]:
        """
        Poll once and return an event dict when a vehicle pass is confirmed.
        """
        distance_cm = self._filtered_distance_cm()
        now = time.monotonic()
        present_now = self._is_vehicle_present(distance_cm)
        drop_cm = (self.baseline_cm - distance_cm) if self.baseline_cm else 0.0

        if not self.vehicle_present:
            if present_now:
                # Build confidence across several consecutive hits before
                # switching into the "vehicle present" state.
                if self.enter_hits == 0:
                    self.candidate_since = now
                    self.candidate_peak_drop_cm = max(0.0, drop_cm)
                else:
                    self.candidate_peak_drop_cm = max(
                        self.candidate_peak_drop_cm,
                        drop_cm,
                    )
                self.enter_hits += 1
                if self.enter_hits >= self.config.enter_consecutive_hits:
                    self.vehicle_present = True
                    self.present_since = self.candidate_since or now
                    self.peak_drop_cm = max(self.candidate_peak_drop_cm, drop_cm)
                    self.exit_misses = 0
                    self.enter_hits = 0
                    self.candidate_since = None
                    self.candidate_peak_drop_cm = 0.0
                    self.blocked_warning_emitted = False
            else:
                self.enter_hits = 0
                self.candidate_since = None
                self.candidate_peak_drop_cm = 0.0
            return None

        # Once a vehicle is present, track its strongest signature and emit a
        # warning if the lane appears blocked for too long.
        if present_now:
            self.peak_drop_cm = max(self.peak_drop_cm, drop_cm)
            self.exit_misses = 0
            dwell = (now - self.present_since) if self.present_since else 0.0
            if (
                dwell >= self.config.stalled_vehicle_warning_s
                and not self.blocked_warning_emitted
            ):
                self.blocked_warning_emitted = True
                return {
                    "type": "blocked_zone",
                    "timestamp": datetime.now().isoformat(timespec="seconds"),
                    "dwell_s": round(dwell, 3),
                    "peak_drop_cm": round(self.peak_drop_cm, 1),
                }
            return None

        self.exit_misses += 1
        if self.exit_misses < self.config.exit_consecutive_misses:
            return None

        # Object has left; classify whether it was a vehicle pass.
        dwell = (now - self.present_since) if self.present_since else 0.0
        signature = self.peak_drop_cm * dwell
        cooldown_ok = (now - self.last_count_time) >= self.config.min_inter_event_gap_s
        self.vehicle_present = False
        self.exit_misses = 0
        self.present_since = None

        is_pedestrian_like = (
            dwell <= self.config.pedestrian_max_presence_s
            and self.peak_drop_cm <= self.config.pedestrian_max_peak_drop_cm
        )
        is_vehicle_like = (
            dwell >= self.config.min_presence_time_s
            and dwell <= self.config.max_presence_time_s
            and self.peak_drop_cm >= self.config.min_vehicle_peak_drop_cm
            and signature >= self.config.min_vehicle_signature
            and not is_pedestrian_like
        )

        # Only confirmed vehicle-like signatures become countable events; all
        # other motion patterns are intentionally ignored.
        event_type = "ignored_non_vehicle"
        if dwell > self.config.max_presence_time_s:
            event_type = "ignored_too_long"
        elif is_pedestrian_like:
            event_type = "ignored_pedestrian_like"
        elif is_vehicle_like and cooldown_ok:
            self.total_passes += 1
            self.last_count_time = now
            event_type = "vehicle_pass"

        event = {
            "type": event_type,
            "count": self.total_passes,
            "distance_cm": round(distance_cm, 1),
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "dwell_s": round(dwell, 3),
            "baseline_cm": round(self.baseline_cm or 0.0, 1),
            "peak_drop_cm": round(self.peak_drop_cm, 1),
            "signature": round(signature, 1),
        }
        self.peak_drop_cm = 0.0
        return event if event["type"] == "vehicle_pass" else None


DEFAULT_EVENT_ENTRY_URL = (
    "https://us-central1-parking-capstone-9778c.cloudfunctions.net/eventEntry"
)
DEFAULT_EVENT_EXIT_URL = (
    "https://us-central1-parking-capstone-9778c.cloudfunctions.net/eventExit"
)


def post_vehicle_event_to_firebase(
    *,
    event: dict,
    url: str,
    lot_id: str,
    sensor_id: str,
    api_key: Optional[str],
    timeout_s: float,
) -> None:
    # Keep the outbound payload minimal because the Cloud Function determines
    # how the lot count should be updated from the endpoint being called.
    payload = json.dumps({"lotId": lot_id, "sensorId": sensor_id}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key

    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            response_body = response.read().decode("utf-8")
        print(
            f"[{event['timestamp']}] [{sensor_id}] Firebase update OK "
            f"for {lot_id}: {response_body}"
        )
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        print(
            f"[{event['timestamp']}] [{sensor_id}] Firebase update failed "
            f"HTTP {exc.code}: {error_body}"
        )
    except urllib.error.URLError as exc:
        print(
            f"[{event['timestamp']}] [{sensor_id}] Firebase update failed: "
            f"{exc.reason}"
        )


def handle_vehicle_pass(event: dict, args: argparse.Namespace) -> None:
    """
    Replace this with your integration:
    - increment parking count
    - post to backend/Firebase
    - log to file
    - trigger GPIO output, etc.
    """
    # Centralize what happens after a confirmed pass so hardware detection and
    # backend integration stay loosely coupled.
    sensor_label = event.get("sensor", "lidar")
    print(
        f"[{event['timestamp']}] [{sensor_label}] CAR PASSED #{event['count']} "
        f"(dwell={event['dwell_s']}s, peak_drop={event['peak_drop_cm']}cm, "
        f"baseline={event['baseline_cm']}cm)"
    )
    if args.firebase_url:
        post_vehicle_event_to_firebase(
            event=event,
            url=args.firebase_url,
            lot_id=args.lot_id,
            sensor_id=args.sensor_id,
            api_key=args.api_key,
            timeout_s=args.firebase_timeout,
        )


def handle_detector_event(event: dict, args: argparse.Namespace) -> None:
    if event["type"] == "vehicle_pass":
        handle_vehicle_pass(event, args)
    elif event["type"] == "blocked_zone":
        sensor_label = event.get("sensor", "lidar")
        print(
            f"[{event['timestamp']}] [{sensor_label}] WARNING: detection zone blocked "
            f"for {event['dwell_s']}s (peak_drop={event['peak_drop_cm']}cm)"
        )


def print_motion_event(
    sensor_label: str,
    state: str,
    distance_cm: float,
    baseline_cm: float,
) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    drop_cm = baseline_cm - distance_cm
    print(
        f"[{timestamp}] [{sensor_label}] MOTION {state} "
        f"(distance={distance_cm:.1f}cm, drop={drop_cm:.1f}cm, baseline={baseline_cm:.1f}cm)"
    )


def parse_args() -> argparse.Namespace:
    # CLI flags make it easy to tune thresholds and switch between mock and
    # hardware-backed runs without changing the source code.
    parser = argparse.ArgumentParser(description="LiDAR-Lite v3 vehicle pass detector")
    parser.add_argument("--mock", action="store_true", help="Use simulated sensor readings")
    parser.add_argument("--bus", type=int, default=1, help="Raspberry Pi I2C bus number")
    parser.add_argument(
        "--address",
        type=lambda x: int(x, 0),
        default=LidarLiteV3.DEFAULT_ADDRESS,
        help="LiDAR I2C address (default: 0x62)",
    )
    parser.add_argument(
        "--threshold-drop-cm",
        type=float,
        default=60.0,
        help="Distance drop from baseline required to treat object as vehicle",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.05,
        help="Polling interval in seconds",
    )
    parser.add_argument(
        "--min-vehicle-drop-cm",
        type=float,
        default=85.0,
        help="Minimum peak distance drop required to classify as vehicle",
    )
    parser.add_argument(
        "--min-presence-time",
        type=float,
        default=0.55,
        help="Minimum seconds an object must stay present before counting as a vehicle",
    )
    parser.add_argument(
        "--min-vehicle-signature",
        type=float,
        default=220.0,
        help="Minimum (peak_drop_cm * dwell_s) required to classify as vehicle",
    )
    parser.add_argument(
        "--sensor-label",
        type=str,
        default="lidar",
        help="Label shown in terminal logs (example: entrance, exit)",
    )
    parser.add_argument(
        "--print-readings",
        action="store_true",
        help="Print live distance readings to terminal for local testing",
    )
    parser.add_argument(
        "--print-motion",
        action="store_true",
        help="Print when motion starts and stops without changing existing vehicle-pass behavior",
    )
    parser.add_argument(
        "--readings-every",
        type=float,
        default=0.25,
        help="How often to print live readings in seconds when --print-readings is used",
    )
    parser.add_argument(
        "--send-to-firebase",
        action="store_true",
        help="POST confirmed vehicle-pass events to the configured Firebase Cloud Function",
    )
    parser.add_argument(
        "--firebase-event",
        choices=["entry", "exit"],
        default="entry",
        help="Which Firebase event endpoint to use when --send-to-firebase is set",
    )
    parser.add_argument(
        "--firebase-url",
        type=str,
        default=None,
        help="Override the Firebase Cloud Function URL used for vehicle-pass events",
    )
    parser.add_argument(
        "--lot-id",
        type=str,
        default="lot-3",
        help="Firestore lot document id to update when posting to Firebase",
    )
    parser.add_argument(
        "--sensor-id",
        type=str,
        default=None,
        help="Sensor id sent to Firebase; defaults to --sensor-label",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=None,
        help="Optional x-api-key header value if the Cloud Function requires one",
    )
    parser.add_argument(
        "--firebase-timeout",
        type=float,
        default=5.0,
        help="Seconds to wait for the Firebase event POST before logging an error",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.sensor_id = args.sensor_id or args.sensor_label
    if args.send_to_firebase and args.firebase_url is None:
        args.firebase_url = (
            DEFAULT_EVENT_ENTRY_URL
            if args.firebase_event == "entry"
            else DEFAULT_EVENT_EXIT_URL
        )

    sensor: DistanceSensor
    real_sensor: Optional[LidarLiteV3] = None

    if args.mock:
        sensor = MockLidarLiteV3()
        print("Running in MOCK mode (no hardware required).")
    else:
        real_sensor = LidarLiteV3(bus_num=args.bus, address=args.address)
        sensor = real_sensor
        print(f"Running with LIDAR-Lite v3 on I2C bus {args.bus}, address {hex(args.address)}.")

    config = DetectorConfig(
        sample_interval_s=args.interval,
        min_drop_from_baseline_cm=args.threshold_drop_cm,
        min_presence_time_s=args.min_presence_time,
        min_vehicle_peak_drop_cm=args.min_vehicle_drop_cm,
        min_vehicle_signature=args.min_vehicle_signature,
    )
    detector = VehiclePassDetector(sensor=sensor, config=config)
    next_reading_log_at = 0.0
    last_motion_state: Optional[bool] = None

    try:
        # Establish the empty-lane baseline before starting the live monitoring loop.
        print("Calibrating baseline... keep the detection area clear.")
        baseline = detector.calibrate()
        print(f"Baseline distance: {baseline:.1f} cm")
        print("Monitoring for vehicles (Ctrl+C to stop)...")

        while True:
            # Each loop iteration polls once, optionally prints diagnostics, and
            # handles any event returned by the detector state machine.
            event = detector.poll()
            now = time.monotonic()

            if (
                args.print_readings
                and detector.baseline_cm is not None
                and detector.recent_distances
                and now >= next_reading_log_at
            ):
                current_distance = sorted(detector.recent_distances)[
                    len(detector.recent_distances) // 2
                ]
                drop = detector.baseline_cm - current_distance
                presence = "PRESENT" if detector.vehicle_present else "CLEAR"
                print(
                    f"[{args.sensor_label}] d={current_distance:.1f}cm "
                    f"drop={drop:.1f}cm state={presence}"
                )
                next_reading_log_at = now + max(0.05, args.readings_every)

            if args.print_motion and detector.baseline_cm is not None and detector.recent_distances:
                current_distance = sorted(detector.recent_distances)[
                    len(detector.recent_distances) // 2
                ]
                motion_now = detector._is_vehicle_present(current_distance)
                if last_motion_state is None:
                    last_motion_state = motion_now
                elif motion_now != last_motion_state:
                    print_motion_event(
                        sensor_label=args.sensor_label,
                        state="START" if motion_now else "END",
                        distance_cm=current_distance,
                        baseline_cm=detector.baseline_cm,
                    )
                    last_motion_state = motion_now

            if event:
                event["sensor"] = args.sensor_label
                handle_detector_event(event, args)
            time.sleep(config.sample_interval_s)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if real_sensor is not None:
            real_sensor.close()


if __name__ == "__main__":
    main()
