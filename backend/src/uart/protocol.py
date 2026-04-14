"""
UART Protocol Definition

Defines the wire protocol for communication with drone hardware.
Includes message framing, checksums, and message types.

TODO: Define real protocol based on hardware
"""


import struct


class MessageType:
    """Message type constants."""
    ARM = 0x01
    DISARM = 0x02
    TAKEOFF = 0x03
    LAND = 0x04
    MOVE = 0x05
    STATUS_REQUEST = 0x10
    TELEMETRY_DATA = 0x11
    PID_UPDATE = 0x20
    HEARTBEAT = 0xFF


_AXIS_CODE = {
    'pitch': 0x01,
    'roll': 0x02,
    'yaw': 0x03,
    'altitude': 0x04,
}


def encode_message(msg_type: int, payload: bytes = b'') -> bytes:
    """
    Lightweight encoder for messages used in this project.

    Format (simple, for STM32 prototyping):
      [msg_type:1][payload...]

    Special handling for PID_UPDATE: payload = [axis_code:1][kp:4][ki:4][kd:4] (float32 LE)

    Returns raw bytes suitable for UARTLink.send(). This is NOT a production
    framing protocol (no CRC/ESCaping) — good enough for local prototyping.
    """
    try:
        if msg_type == MessageType.PID_UPDATE and isinstance(payload, dict):
            axis = payload.get('axis')
            kp = float(payload.get('kp', 0.0))
            ki = float(payload.get('ki', 0.0))
            kd = float(payload.get('kd', 0.0))
            axis_code = _AXIS_CODE.get(axis, 0x00)
            # pack: msg_type (B), axis_code (B), kp, ki, kd (3f little-endian)
            return struct.pack('<B B f f f', msg_type, axis_code, kp, ki, kd)
        # default: simple header + raw payload
        if isinstance(payload, (bytes, bytearray)):
            return bytes([msg_type]) + bytes(payload)
        # if payload is str/dict/etc. convert to utf-8
        return bytes([msg_type]) + str(payload).encode('utf-8')
    except Exception as e:
        print(f"protocol.encode_message error: {e}")
        return bytes([msg_type]) + b''


def decode_message(data: bytes) -> tuple:
    """
    Minimal decoder — returns (msg_type, payload_bytes).
    """
    if not data:
        return None, b''
    msg_type = data[0]
    return msg_type, data[1:]



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
