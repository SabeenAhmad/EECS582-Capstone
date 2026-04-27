#!/usr/bin/env python3
"""
Names: Sabeen Ahmad
Description: Processes LiDAR sensor data to detect vehicle entry and exit using two beams, maintains occupancy count, and sends events to the backend.

lidar_counter.py

Raspberry Pi side:
- Reads LiDAR distance measurements (UART or I2C)
- Detects "car present" vs "no car" using thresholds + debounce
- Classifies movement direction (entry vs exit) from a 2-sensor setup
- Maintains a local occupancy count
- Sends structured events to backend over HTTP (e.g., Firebase Cloud Function)

Why 2 sensors?
- With ONE LiDAR at a single point, you can detect "something passed" but direction
  is ambiguous without extra info (2 beams, 2 zones, or another sensor).
- The common simple approach is 2 LiDARs placed a short distance apart across the lane.
"""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum, auto
import time
import json
import requests
from collections import deque
from typing import Optional

# -------------------------
# Distance utilities (your "distance function")
# -------------------------

def mm_to_m(mm: int) -> float:
    """Convert millimeters to meters."""
    return mm / 1000.0

def clamp(x: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, x))

# -------------------------
# Sensor reader interfaces
# -------------------------

class LidarReader:
    """Abstract interface so you can swap UART vs I2C (or a mock)."""
    def read_distance_mm(self) -> Optional[int]:
        raise NotImplementedError

class MockLidar(LidarReader):
    """
    Demo-only sensor to show your TA the pipeline without hardware.
    Feed it a script of distances (mm) over time.
    """
    def __init__(self, script_mm: list[int], loop: bool = True):
        self.script = script_mm
        self.i = 0
        self.loop = loop

    def read_distance_mm(self) -> Optional[int]:
        if not self.script:
            return None
        v = self.script[self.i]
        self.i += 1
        if self.i >= len(self.script):
            self.i = 0 if self.loop else len(self.script) - 1
        return v

# UART example (works for many TFmini/Benewake-style sensors that output frames)
# If your sensor has a different frame format, you just adjust parse_frame().
try:
    import serial
except ImportError:
    serial = None

class UartLidar(LidarReader):
    """
    Minimal UART reader example. Many LiDAR modules stream frames continuously.
    You'll adjust parse_frame() to your device datasheet.
    """
    def __init__(self, port: str = "/dev/ttyS0", baud: int = 115200, timeout: float = 0.05):
        if serial is None:
            raise RuntimeError("pyserial not installed. Run: pip install pyserial")
        self.ser = serial.Serial(port, baudrate=baud, timeout=timeout)

    def read_distance_mm(self) -> Optional[int]:
        # Example: read some bytes and attempt parse
        data = self.ser.read(32)
        dist = self.parse_frame(data)
        return dist

    @staticmethod
    def parse_frame(buf: bytes) -> Optional[int]:
        """
        Placeholder parser.
        For TFmini-S style frames, you'd scan for header bytes and extract distance.
        Here we keep it generic to show structure to TA.
        """
        # NOTE: Replace with your sensor’s real framing protocol.
        return None

# I2C example (device-specific; leaving a clean placeholder)
try:
    from smbus2 import SMBus
except ImportError:
    SMBus = None

class I2cLidar(LidarReader):
    """
    Minimal I2C reader placeholder.
    For I2C LiDARs (e.g., LidarLite variants), you'd read registers per datasheet.
    """
    def __init__(self, bus_id: int = 1, address: int = 0x62):
        if SMBus is None:
            raise RuntimeError("smbus2 not installed. Run: pip install smbus2")
        self.bus = SMBus(bus_id)
        self.addr = address

    def read_distance_mm(self) -> Optional[int]:
        # NOTE: Replace with register reads per your module datasheet
        return None

# -------------------------
# Filtering + detection
# -------------------------

class BeamState(Enum):
    CLEAR = auto()
    BLOCKED = auto()

@dataclass
class BeamConfig:
    name: str
    blocked_threshold_mm: int     # distance <= this means something is close (car)
    clear_threshold_mm: int       # distance >= this means lane is clear
    debounce_samples: int = 3     # consecutive samples required to switch state
    filter_window: int = 5        # moving average window

class DebouncedBeam:
    """
    Turns noisy distance readings into a stable CLEAR/BLOCKED state.
    Uses:
    - Moving average filter
    - Hysteresis (blocked_threshold vs clear_threshold)
    - Debounce (N consecutive samples)
    """
    def __init__(self, reader: LidarReader, cfg: BeamConfig):
        self.reader = reader
        self.cfg = cfg
        self.window = deque(maxlen=cfg.filter_window)
        self.state = BeamState.CLEAR
        self._pending = 0

    def update(self) -> tuple[Optional[int], BeamState]:
        raw = self.reader.read_distance_mm()
        if raw is None:
            return None, self.state

        raw = clamp(raw, 0, 100000)  # sanity clamp
        self.window.append(raw)
        avg = int(sum(self.window) / len(self.window))

        desired = self.state
        if self.state == BeamState.CLEAR and avg <= self.cfg.blocked_threshold_mm:
            desired = BeamState.BLOCKED
        elif self.state == BeamState.BLOCKED and avg >= self.cfg.clear_threshold_mm:
            desired = BeamState.CLEAR

        if desired != self.state:
            self._pending += 1
            if self._pending >= self.cfg.debounce_samples:
                self.state = desired
                self._pending = 0
        else:
            self._pending = 0

        return avg, self.state

# -------------------------
# Direction logic (2-beam)
# -------------------------

class Direction(Enum):
    ENTRY = "entry"
    EXIT = "exit"

class TwoBeamTracker:
    """
    Detect direction using 2 beams:
      Beam A (outside) and Beam B (inside)

    ENTRY pattern: A blocks -> B blocks -> A clears -> B clears
    EXIT  pattern: B blocks -> A blocks -> B clears -> A clears

    This is a classic simple finite-state approach that works well at garage gates.
    """
    def __init__(self, timeout_s: float = 2.5):
        self.timeout_s = timeout_s
        self.reset()

    def reset(self):
        self.t0 = None
        self.seq = []  # list of ("A"/"B", "BLOCK"/"CLEAR") transitions

    def _start_if_needed(self):
        if self.t0 is None:
            self.t0 = time.time()

    def _expired(self) -> bool:
        return self.t0 is not None and (time.time() - self.t0) > self.timeout_s

    def observe(self, a_state: BeamState, b_state: BeamState, a_prev: BeamState, b_prev: BeamState) -> Optional[Direction]:
        # timeout safety
        if self._expired():
            self.reset()

        # track transitions only
        if a_state != a_prev:
            self._start_if_needed()
            self.seq.append(("A", a_state))
        if b_state != b_prev:
            self._start_if_needed()
            self.seq.append(("B", b_state))

        # normalize to compact representation
        compact = [(beam, st) for beam, st in self.seq]

        entry = [("A", BeamState.BLOCKED), ("B", BeamState.BLOCKED),
                 ("A", BeamState.CLEAR),   ("B", BeamState.CLEAR)]
        exit_  = [("B", BeamState.BLOCKED), ("A", BeamState.BLOCKED),
                 ("B", BeamState.CLEAR),   ("A", BeamState.CLEAR)]

        if compact[-4:] == entry:
            self.reset()
            return Direction.ENTRY
        if compact[-4:] == exit_:
            self.reset()
            return Direction.EXIT

        return None

# -------------------------
# Backend posting (Cloud Function)
# -------------------------

@dataclass
class BackendConfig:
    endpoint_url: str            # e.g. https://...cloudfunctions.net/ingestEvent
    lot_id: str                  # "central_garage"
    device_id: str               # "pi-01"
    api_key: Optional[str] = None  # if you secure your endpoint

def post_event(cfg: BackendConfig, direction: Direction) -> bool:
    payload = {
        "lotId": cfg.lot_id,
        "deviceId": cfg.device_id,
        "type": direction.value,            # "entry" or "exit"
        "ts": int(time.time() * 1000),      # client timestamp (server should overwrite)
    }
    headers = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["X-API-Key"] = cfg.api_key

    try:
        r = requests.post(cfg.endpoint_url, data=json.dumps(payload), headers=headers, timeout=2.0)
        return 200 <= r.status_code < 300
    except requests.RequestException:
        return False

# -------------------------
# Main loop
# -------------------------

def run():
    # In your architecture doc: Pi reads raw LiDAR, detects entry/exit, sends events. :contentReference[oaicite:1]{index=1}

    # Example config:
    beamA_cfg = BeamConfig(name="A_outside", blocked_threshold_mm=1200, clear_threshold_mm=1700)
    beamB_cfg = BeamConfig(name="B_inside",  blocked_threshold_mm=1200, clear_threshold_mm=1700)

    # Swap these for UartLidar(...) / I2cLidar(...) on real hardware:
    beamA = DebouncedBeam(reader=MockLidar([2000]*10 + [900]*8 + [2000]*10), cfg=beamA_cfg)
    beamB = DebouncedBeam(reader=MockLidar([2000]*14 + [900]*8 + [2000]*6), cfg=beamB_cfg)

    tracker = TwoBeamTracker(timeout_s=3.0)

    backend = BackendConfig(
        endpoint_url="https://YOUR_CLOUD_FUNCTION_URL/ingestEvent",
        lot_id="central_garage",
        device_id="pi-01",
        api_key=None,
    )

    occupancy = 0
    a_prev, b_prev = BeamState.CLEAR, BeamState.CLEAR

    sample_period_s = 0.1  # 10 Hz sampling (configurable)

    while True:
        a_mm, a_state = beamA.update()
        b_mm, b_state = beamB.update()

        if a_mm is not None and b_mm is not None:
            direction = tracker.observe(a_state, b_state, a_prev, b_prev)
            if direction == Direction.ENTRY:
                occupancy += 1
                ok = post_event(backend, direction)
                print(f"[ENTRY] occupancy={occupancy} post_ok={ok}")
            elif direction == Direction.EXIT:
                occupancy = max(0, occupancy - 1)
                ok = post_event(backend, direction)
                print(f"[EXIT ] occupancy={occupancy} post_ok={ok}")

            # debug line: show filtered distances + states
            print(f"A={a_mm:4d}mm {a_state.name} | B={b_mm:4d}mm {b_state.name}")

        a_prev, b_prev = a_state, b_state
        time.sleep(sample_period_s)

if __name__ == "__main__":
    run()
