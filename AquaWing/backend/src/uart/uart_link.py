"""
UART Link - Serial Port Communication

Handles opening, closing, and communication over a serial UART connection.
Provides abstraction for sending and receiving messages.
Le câblage GPS (port, baudrate, GPIO) est lu depuis config/cablage.py.

TODO: Implement real serial communication
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
from config.cablage import GPS

import serial
from typing import Optional


class UARTLink:
    """
    UART serial communication interface.
    Configuration par défaut lue depuis config.cablage.GPS.
    
    TODO: Add connection state management
    TODO: Add automatic reconnection logic
    TODO: Add message queuing and retry logic
    """
    
    def __init__(self, port: str = None, baudrate: int = None, timeout: float = None):
        """
        Initialize UART link (without opening).
        Defaults are read from config/cablage.py GPS config.
        
        Args:
            port: Serial port name (default from cablage.GPS)
            baudrate: Serial transmission speed (default from cablage.GPS)
            timeout: Read timeout in seconds (default from cablage.GPS)
        """
        self.port = port or GPS["port"]
        self.baudrate = baudrate or GPS["baudrate"]
        self.timeout = timeout or GPS["timeout_s"]
        self.serial = None
    
    def open(self) -> bool:
        """
        Open the serial connection.
        
        Returns:
            True if successful, False otherwise
            
        TODO: Implement actual serial port opening
        """
        try:
            print(f"TODO: Implement opening serial port {self.port} at {self.baudrate} baud")
            # self.serial = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            return True
        except Exception as e:
            print(f"Error opening UART: {e}")
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
        
        Args:
            data: Bytes to send
            
        Returns:
            True if successful, False otherwise
            
        TODO: Implement actual serial transmission
        """
        if not self.serial or not self.serial.is_open:
            print("TODO: Serial port not open, cannot send")
            return False
        
        try:
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
