"""
UART Link - Serial Port Communication

Handles opening, closing, and communication over a serial UART connection.
Configuration from config/cablage.py:
  - FLIGHT_CONTROLLER (default): PID and flight commands → /dev/ttyAMA0 (PL011)
  - GPS: GPS-related communication only → /dev/ttyS0 (miniUART)

Serial instances are separate; no shared UART between GPS and STM32.

TODO: Implement real serial communication
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
from config.cablage import FLIGHT_CONTROLLER, GPS

import serial
from typing import Optional, Dict, Any


class UARTLink:
    """
    UART serial communication interface.
    Default config: FLIGHT_CONTROLLER (PID, commands). For GPS use config=GPS.
    
    TODO: Add connection state management
    TODO: Add automatic reconnection logic
    TODO: Add message queuing and retry logic
    """
    
    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        port: Optional[str] = None,
        baudrate: Optional[int] = None,
        timeout: Optional[float] = None,
    ):
        """
        Initialize UART link (without opening).
        Default: FLIGHT_CONTROLLER (ttyAMA0). For GPS use config=GPS.
        
        Args:
            config: Cabling config dict (FLIGHT_CONTROLLER or GPS). None => FLIGHT_CONTROLLER.
            port: Override port (optional)
            baudrate: Override baudrate (optional)
            timeout: Override timeout in seconds (optional)
        """
        cfg = config if config is not None else FLIGHT_CONTROLLER
        self.port = port or cfg["port"]
        self.baudrate = baudrate or cfg["baudrate"]
        self.timeout = timeout if timeout is not None else cfg.get("timeout_s", 1.0)
        self.label = cfg.get("label", "UART")
        self.serial = None
    
    def open(self) -> bool:
        """
        Open the serial connection.

        Attempts to open the configured serial port. If the port cannot be
        opened this returns False (caller can fallback to simulated mode).
        """
        try:
            self.serial = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            if getattr(self.serial, 'is_open', False):
                print(f"{self.label} connected on {self.port}")
                return True
            # unexpected state
            print(f"UART could not be opened (unknown state)")
            self.serial = None
            return False
        except Exception as e:
            print(f"Error opening {self.port} ({self.label}): {e}")
            self.serial = None
            return False
    
    def close(self):
        """Close the serial connection."""
        if self.serial:
            try:
                self.serial.close()
            except Exception as e:
                print(f"Error closing UART: {e}")
        self.serial = None
    
    def send(self, data: bytes) -> bool:
        """
        Send data over UART.

        If the serial device is not available this method will *simulate*
        sending (log the encoded message) so higher layers can be tested on
        the Raspberry Pi without hardware connected.
        """
        if not self.serial or not getattr(self.serial, 'is_open', False):
            # Simulated send for development / unit tests
            try:
                print(f"[UART SIM] send {len(data)} bytes: {data.hex()}")
                return True
            except Exception as e:
                print(f"UART simulated send failed: {e}")
                return False

        try:
            # real serial write (not yet implemented in this repo)
            print(f"TODO: Send {len(data)} bytes over UART: {data.hex()}")
            # self.serial.write(data)
            return True
        except Exception as e:
            print(f"Error sending over UART: {e}")
            return False
    
    def receive(self, size: int = 1024) -> Optional[bytes]:
        """
        Receive data from UART.
        
        Args:
            size: Maximum number of bytes to read
            
        Returns:
            Bytes received, or None if timeout/error
            
        TODO: Implement actual serial reception
        """
        if not self.serial or not self.serial.is_open:
            print("TODO: Serial port not open, cannot receive")
            return None
        
        try:
            print(f"TODO: Receive up to {size} bytes from UART")
            # data = self.serial.read(size)
            # return data if data else None
            return None
        except Exception as e:
            print(f"Error receiving from UART: {e}")
            return None
    
    def is_open(self) -> bool:
        """Check if connection is open."""
        return self.serial is not None and self.serial.is_open
