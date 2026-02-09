"""
UART Protocol Definition

Defines the wire protocol for communication with drone hardware.
Includes message framing, checksums, and message types.

TODO: Define real protocol based on hardware
"""


class MessageType:
    """Message type constants."""
    ARM = 0x01
    DISARM = 0x02
    TAKEOFF = 0x03
    LAND = 0x04
    MOVE = 0x05
    STATUS_REQUEST = 0x10
    TELEMETRY_DATA = 0x11
    HEARTBEAT = 0xFF


def encode_message(msg_type: int, payload: bytes = b'') -> bytes:
    """
    Encode a message for transmission.
    
    Args:
        msg_type: Message type identifier
        payload: Optional payload data
        
    Returns:
        Encoded message bytes
        
    TODO: Implement real protocol encoding (framing, CRC, etc.)
    """
    print(f"TODO: Implement protocol encoding for message type {msg_type}")
    return b'\x00' * (1 + len(payload))


def decode_message(data: bytes) -> tuple:
    """
    Decode a received message.
    
    Args:
        data: Raw message bytes
        
    Returns:
        Tuple of (message_type, payload)
        
    TODO: Implement real protocol decoding
    """
    print(f"TODO: Implement protocol decoding for data: {data.hex()}")
    return None, b''
