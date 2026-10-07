from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
from config.cablage import FLIGHT_CONTROLLER, GPS

import serial
import threading
import time
from typing import Optional, Dict, Any, Callable


class UARTLink:
    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        port: Optional[str] = None,
        baudrate: Optional[int] = None,
        timeout: Optional[float] = None,
    ):
        cfg = config if config is not None else FLIGHT_CONTROLLER
        self.port = port or cfg["port"]
        self.baudrate = baudrate or cfg["baudrate"]
        self.timeout = timeout if timeout is not None else cfg.get("timeout_s", 1.0)
        self.label = cfg.get("label", "UART")
        self.serial: Optional[serial.Serial] = None
        self._lock = threading.Lock()
        self._rx_callback: Optional[Callable[[bytes], None]] = None
        self._rx_thread: Optional[threading.Thread] = None
        self._running = False

    def open(self) -> bool:
        try:
            with self._lock:
                self.serial = serial.Serial(
                    port=self.port,
                    baudrate=self.baudrate,
                    timeout=self.timeout,
                )
            if self.serial.is_open:
                print(f"[{self.label}] Connected on {self.port} @ {self.baudrate} baud")
                self._running = True
                return True
            self.serial = None
            return False
        except Exception as e:
            print(f"[{self.label}] Cannot open {self.port}: {e} — simulation mode")
            self.serial = None
            return False

    def close(self) -> None:
        self._running = False
        with self._lock:
            if self.serial:
                try:
                    self.serial.close()
                except Exception:
                    pass
                self.serial = None

    def send(self, data: bytes) -> bool:
        with self._lock:
            if not self.serial or not self.serial.is_open:
                print(f"[{self.label}][SIM] TX {len(data)}B: {data.hex()}")
                return True
            try:
                self.serial.write(data)
                self.serial.flush()
                return True
            except Exception as e:
                print(f"[{self.label}] send error: {e}")
                return False

    def receive(self, size: int = 256) -> Optional[bytes]:
        with self._lock:
            if not self.serial or not self.serial.is_open:
                return None
            try:
                if self.serial.in_waiting > 0:
                    return self.serial.read(min(size, self.serial.in_waiting))
                return None
            except Exception as e:
                print(f"[{self.label}] receive error: {e}")
                return None

    def readline(self) -> Optional[bytes]:
        with self._lock:
            if not self.serial or not self.serial.is_open:
                return None
            try:
                return self.serial.readline()
            except Exception as e:
                print(f"[{self.label}] readline error: {e}")
                return None

    def start_rx_thread(self, callback: Callable[[bytes], None]) -> None:
        self._rx_callback = callback
        self._rx_thread = threading.Thread(target=self._rx_loop, daemon=True)
        self._rx_thread.start()

    def _rx_loop(self) -> None:
        while self._running:
            data = self.receive()
            if data and self._rx_callback:
                try:
                    self._rx_callback(data)
                except Exception as e:
                    print(f"[{self.label}] RX callback error: {e}")
            else:
                time.sleep(0.01)

    def is_open(self) -> bool:
        return self.serial is not None and self.serial.is_open
