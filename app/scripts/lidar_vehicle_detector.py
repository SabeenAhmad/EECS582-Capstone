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
    min_drop_from_baseline_cm: float = 60.0
    enter_consecutive_hits: int = 3
    exit_consecutive_misses: int = 3
    min_presence_time_s: float = 0.20
    cooldown_s: float = 0.75


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
        self.vehicle_present = False
        self.enter_hits = 0
        self.exit_misses = 0
        self.present_since: Optional[float] = None
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

    def _is_vehicle_present(self, distance_cm: float) -> bool:
        if self.baseline_cm is None:
            raise RuntimeError("Detector must be calibrated before use.")
        return (self.baseline_cm - distance_cm) >= self.config.min_drop_from_baseline_cm

    def poll(self) -> Optional[dict]:
        """
        Poll once and return an event dict when a vehicle pass is confirmed.
        """
        distance_cm = self.sensor.read_distance_cm()
        now = time.monotonic()
        present_now = self._is_vehicle_present(distance_cm)

        if not self.vehicle_present:
            if present_now:
                self.enter_hits += 1
                if self.enter_hits >= self.config.enter_consecutive_hits:
                    self.vehicle_present = True
                    self.present_since = now
                    self.exit_misses = 0
                    self.enter_hits = 0
            else:
                self.enter_hits = 0
            return None

        # Vehicle is currently marked present.
        if present_now:
            self.exit_misses = 0
            return None

        self.exit_misses += 1
        if self.exit_misses < self.config.exit_consecutive_misses:
            return None

        # Vehicle has left; decide whether it counts as a valid pass.
        dwell = (now - self.present_since) if self.present_since else 0.0
        cooldown_ok = (now - self.last_count_time) >= self.config.cooldown_s
        self.vehicle_present = False
        self.exit_misses = 0
        self.present_since = None

        if dwell >= self.config.min_presence_time_s and cooldown_ok:
            self.total_passes += 1
            self.last_count_time = now
            return {
                "type": "vehicle_pass",
                "count": self.total_passes,
                "distance_cm": round(distance_cm, 1),
                "timestamp": datetime.now().isoformat(timespec="seconds"),
                "dwell_s": round(dwell, 3),
                "baseline_cm": round(self.baseline_cm or 0.0, 1),
            }
        return None


def handle_vehicle_pass(event: dict) -> None:
    """
    Replace this with your integration:
    - increment parking count
    - post to backend/Firebase
    - log to file
    - trigger GPIO output, etc.
    """
    print(
        f"[{event['timestamp']}] PASS #{event['count']} "
        f"(dwell={event['dwell_s']}s, baseline={event['baseline_cm']}cm)"
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
    )
    detector = VehiclePassDetector(sensor=sensor, config=config)

    try:
        print("Calibrating baseline... keep the detection area clear.")
        baseline = detector.calibrate()
        print(f"Baseline distance: {baseline:.1f} cm")
        print("Monitoring for vehicles (Ctrl+C to stop)...")

        while True:
            event = detector.poll()
            if event:
                handle_vehicle_pass(event)
            time.sleep(config.sample_interval_s)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if real_sensor is not None:
            real_sensor.close()


if __name__ == "__main__":
    main()
