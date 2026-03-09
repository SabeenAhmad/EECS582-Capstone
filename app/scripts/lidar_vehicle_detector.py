#!/usr/bin/env python3
"""
LiDAR-Lite v3 vehicle pass detector skeleton for Raspberry Pi.

This script is intentionally structured so you can:
1) Run in `--mock` mode without hardware to test the detection logic.
2) Switch to the real LiDAR-Lite v3 over I2C on a Raspberry Pi.
3) Replace the `handle_vehicle_pass()` callback with your app integration.

Install (real sensor mode):
    pip install smbus2
    sudo raspi-config  # Enable I2C if not enabled already
"""

from __future__ import annotations

import argparse
import random
import time
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
    enter_consecutive_hits: int = 3
    exit_consecutive_misses: int = 2
    min_presence_time_s: float = 0.25
    max_presence_time_s: float = 15.0
    min_vehicle_signature: float = 90.0
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
        # Median is more robust to noise/spikes than mean.
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
                self.enter_hits += 1
                if self.enter_hits >= self.config.enter_consecutive_hits:
                    self.vehicle_present = True
                    self.present_since = now
                    self.peak_drop_cm = max(0.0, drop_cm)
                    self.exit_misses = 0
                    self.enter_hits = 0
                    self.blocked_warning_emitted = False
            else:
                self.enter_hits = 0
            return None

        # Vehicle is currently marked present.
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


def handle_vehicle_pass(event: dict) -> None:
    """
    Replace this with your integration:
    - increment parking count
    - post to backend/Firebase
    - log to file
    - trigger GPIO output, etc.
    """
    sensor_label = event.get("sensor", "lidar")
    print(
        f"[{event['timestamp']}] [{sensor_label}] CAR PASSED #{event['count']} "
        f"(dwell={event['dwell_s']}s, peak_drop={event['peak_drop_cm']}cm, "
        f"baseline={event['baseline_cm']}cm)"
    )


def handle_detector_event(event: dict) -> None:
    if event["type"] == "vehicle_pass":
        handle_vehicle_pass(event)
    elif event["type"] == "blocked_zone":
        sensor_label = event.get("sensor", "lidar")
        print(
            f"[{event['timestamp']}] [{sensor_label}] WARNING: detection zone blocked "
            f"for {event['dwell_s']}s (peak_drop={event['peak_drop_cm']}cm)"
        )


def parse_args() -> argparse.Namespace:
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
        "--min-vehicle-signature",
        type=float,
        default=90.0,
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
        "--readings-every",
        type=float,
        default=0.25,
        help="How often to print live readings in seconds when --print-readings is used",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

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
        min_vehicle_peak_drop_cm=args.min_vehicle_drop_cm,
        min_vehicle_signature=args.min_vehicle_signature,
    )
    detector = VehiclePassDetector(sensor=sensor, config=config)
    next_reading_log_at = 0.0

    try:
        print("Calibrating baseline... keep the detection area clear.")
        baseline = detector.calibrate()
        print(f"Baseline distance: {baseline:.1f} cm")
        print("Monitoring for vehicles (Ctrl+C to stop)...")

        while True:
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

            if event:
                event["sensor"] = args.sensor_label
                handle_detector_event(event)
            time.sleep(config.sample_interval_s)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if real_sensor is not None:
            real_sensor.close()


if __name__ == "__main__":
    main()
