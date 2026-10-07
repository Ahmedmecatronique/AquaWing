from __future__ import annotations
import time
import threading
from pathlib import Path
from typing import Dict, Optional

import yaml


class PIDController:
    def __init__(
        self,
        kp: float = 1.0,
        ki: float = 0.0,
        kd: float = 0.0,
        output_min: float = -1.0,
        output_max: float = 1.0,
        integral_limit: float = 10.0,
    ) -> None:
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.output_min = output_min
        self.output_max = output_max
        self.integral_limit = integral_limit
        self._integral = 0.0
        self._last_error = 0.0
        self._last_time: Optional[float] = None

    def compute(self, setpoint: float, measurement: float, dt: Optional[float] = None) -> float:
        now = time.monotonic()
        if dt is None:
            dt = (now - self._last_time) if self._last_time else 0.02
        self._last_time = now
        dt = max(dt, 1e-4)

        error = setpoint - measurement
        self._integral += error * dt
        self._integral = max(-self.integral_limit, min(self.integral_limit, self._integral))
        derivative = (error - self._last_error) / dt
        self._last_error = error

        output = self.kp * error + self.ki * self._integral + self.kd * derivative
        return max(self.output_min, min(self.output_max, output))

    def reset(self) -> None:
        self._integral = 0.0
        self._last_error = 0.0
        self._last_time = None

    def set_gains(self, kp: float, ki: float, kd: float) -> None:
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.reset()


class FlightController:
    def __init__(self) -> None:
        self.armed = False
        self.mode = "STABILIZE"
        self._lock = threading.Lock()

        # Default gains — overridden by system.yaml
        default_gains = {
            "pitch":    {"kp": 3.0, "ki": 0.02, "kd": 0.003},
            "roll":     {"kp": 3.0, "ki": 0.02, "kd": 0.003},
            "yaw":      {"kp": 2.0, "ki": 0.01, "kd": 0.001},
            "altitude": {"kp": 2.5, "ki": 0.05, "kd": 0.01},
        }
        self.pid_gains = default_gains.copy()
        self._load_gains_from_yaml()

        self._pids: Dict[str, PIDController] = {
            axis: PIDController(
                kp=g["kp"], ki=g["ki"], kd=g["kd"],
                output_min=-1.0, output_max=1.0,
            )
            for axis, g in self.pid_gains.items()
        }
        # Separate altitude PID with positive-only output for throttle
        self._pids["altitude"].output_min = 0.0
        self._pids["altitude"].output_max = 1.0

        # Setpoints (filled by GuidanceController or manual commands)
        self.setpoints = {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "altitude": 0.0}
        # Current measurements (filled by IMU/telemetry from STM32)
        self.measurements = {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "altitude": 0.0}
        # Base throttle 0..1
        self.throttle_base = 0.55

        # UART link (lazy init)
        self._uart = None

    def _load_gains_from_yaml(self) -> None:
        try:
            cfg_path = Path(__file__).parents[3] / "config" / "system.yaml"
            if not cfg_path.exists():
                return
            with open(cfg_path) as f:
                cfg = yaml.safe_load(f) or {}
            persisted = cfg.get("control", {}).get("pid_gains", {})
            for axis, gains in persisted.items():
                if axis in self.pid_gains and isinstance(gains, dict):
                    for k in ("kp", "ki", "kd"):
                        if k in gains:
                            self.pid_gains[axis][k] = float(gains[k])
        except Exception as e:
            print(f"[FC] Failed to load PID gains: {e}")

    def _get_uart(self):
        if self._uart is None:
            try:
                from backend.src.uart.uart_link import UARTLink
                self._uart = UARTLink()
                self._uart.open()
            except Exception as e:
                print(f"[FC] UART init error: {e}")
        return self._uart

    def _send(self, msg_type: int, payload=b"") -> bool:
        try:
            from backend.src.uart.protocol import encode_message
            data = encode_message(msg_type, payload)
            uart = self._get_uart()
            if uart:
                return uart.send(data)
        except Exception as e:
            print(f"[FC] send error: {e}")
        return False

    def arm(self) -> bool:
        from backend.src.uart.protocol import MessageType
        ok = self._send(MessageType.ARM)
        if ok:
            self.armed = True
            print("[FC] Armed")
        return ok

    def disarm(self) -> bool:
        from backend.src.uart.protocol import MessageType
        for pid in self._pids.values():
            pid.reset()
        ok = self._send(MessageType.DISARM)
        self.armed = False
        print("[FC] Disarmed")
        return ok

    def takeoff(self, altitude: float = 10.0) -> bool:
        from backend.src.uart.protocol import MessageType
        self.setpoints["altitude"] = altitude
        ok = self._send(MessageType.TAKEOFF, {"altitude": altitude})
        if ok:
            self.mode = "GUIDED"
            print(f"[FC] Takeoff → {altitude}m")
        return ok

    def land(self) -> bool:
        from backend.src.uart.protocol import MessageType
        self.setpoints["altitude"] = 0.0
        ok = self._send(MessageType.LAND)
        if ok:
            self.mode = "LAND"
        return ok

    def rtl(self) -> bool:
        from backend.src.uart.protocol import MessageType
        ok = self._send(MessageType.RTL)
        if ok:
            self.mode = "RTL"
        return ok

    def set_speed(self, speed_mps: float) -> bool:
        from backend.src.uart.protocol import MessageType
        return self._send(MessageType.SET_SPEED, {"speed": speed_mps})

    def update_imu(self, pitch: float, roll: float, yaw: float, altitude: float) -> None:
        with self._lock:
            self.measurements["pitch"] = pitch
            self.measurements["roll"] = roll
            self.measurements["yaw"] = yaw
            self.measurements["altitude"] = altitude

    def compute_motor_outputs(self, imu_data: Optional[dict] = None) -> dict:
        if imu_data:
            self.update_imu(
                imu_data.get("pitch", 0.0),
                imu_data.get("roll", 0.0),
                imu_data.get("yaw", 0.0),
                imu_data.get("altitude", 0.0),
            )

        with self._lock:
            sp = self.setpoints.copy()
            ms = self.measurements.copy()

        pitch_out = self._pids["pitch"].compute(sp["pitch"], ms["pitch"])
        roll_out  = self._pids["roll"].compute(sp["roll"], ms["roll"])
        yaw_out   = self._pids["yaw"].compute(sp["yaw"], ms["yaw"])
        alt_out   = self._pids["altitude"].compute(sp["altitude"], ms["altitude"])
        throttle  = self.throttle_base + (alt_out - 0.5) * 0.4

        # X-frame motor mixing (0..1)
        def _clamp(v):
            return max(0.0, min(1.0, v))

        m1 = _clamp(throttle + pitch_out + roll_out - yaw_out)  # front-right CW
        m2 = _clamp(throttle - pitch_out - roll_out - yaw_out)  # rear-left  CW
        m3 = _clamp(throttle + pitch_out - roll_out + yaw_out)  # front-left CCW
        m4 = _clamp(throttle - pitch_out + roll_out + yaw_out)  # rear-right CCW

        outputs = {"m1": round(m1, 4), "m2": round(m2, 4), "m3": round(m3, 4), "m4": round(m4, 4)}

        # Send MOVE command to STM32
        from backend.src.uart.protocol import MessageType
        self._send(MessageType.MOVE, {
            "pitch": pitch_out, "roll": roll_out,
            "yaw": yaw_out, "throttle": throttle,
        })
        return outputs

    def send_heartbeat(self) -> None:
        from backend.src.uart.protocol import MessageType
        self._send(MessageType.HEARTBEAT)

    def set_pid_gains(self, axis: str, kp: float, ki: float, kd: float) -> bool:
        if axis not in self._pids:
            return False
        self._pids[axis].set_gains(kp, ki, kd)
        self.pid_gains[axis] = {"kp": kp, "ki": ki, "kd": kd}
        self._persist_gains()
        return True

    def _persist_gains(self) -> None:
        try:
            cfg_path = Path(__file__).parents[3] / "config" / "system.yaml"
            cfg = {}
            if cfg_path.exists():
                with open(cfg_path) as f:
                    cfg = yaml.safe_load(f) or {}
            cfg.setdefault("control", {})["pid_gains"] = self.pid_gains
            with open(cfg_path, "w") as f:
                yaml.safe_dump(cfg, f)
        except Exception as e:
            print(f"[FC] Failed to persist PID gains: {e}")


flight_controller = FlightController()
