from __future__ import annotations
import struct


class MessageType:
    ARM        = 0x01
    DISARM     = 0x02
    TAKEOFF    = 0x03
    LAND       = 0x04
    MOVE       = 0x05
    RTL        = 0x06
    HEARTBEAT  = 0x07
    STATUS_REQ = 0x10
    TELEMETRY  = 0x11
    PID_UPDATE = 0x20
    SET_SPEED  = 0x30


_AXIS_CODE = {"pitch": 0x01, "roll": 0x02, "yaw": 0x03, "altitude": 0x04}

_HEADER = 0xAA
_FOOTER = 0x55


def _checksum(data: bytes) -> int:
    cs = 0
    for b in data:
        cs ^= b
    return cs & 0xFF


def encode_message(msg_type: int, payload=b"") -> bytes:
    try:
        if msg_type == MessageType.PID_UPDATE and isinstance(payload, dict):
            axis = payload.get("axis", "")
            kp = float(payload.get("kp", 0.0))
            ki = float(payload.get("ki", 0.0))
            kd = float(payload.get("kd", 0.0))
            axis_code = _AXIS_CODE.get(axis, 0x00)
            body = struct.pack("<BBfff", msg_type, axis_code, kp, ki, kd)
        elif msg_type == MessageType.MOVE and isinstance(payload, dict):
            pitch    = float(payload.get("pitch", 0.0))
            roll     = float(payload.get("roll", 0.0))
            yaw      = float(payload.get("yaw", 0.0))
            throttle = float(payload.get("throttle", 0.0))
            body = struct.pack("<Bffff", msg_type, pitch, roll, yaw, throttle)
        elif msg_type == MessageType.TAKEOFF and isinstance(payload, dict):
            alt = float(payload.get("altitude", 10.0))
            body = struct.pack("<Bf", msg_type, alt)
        elif msg_type == MessageType.SET_SPEED and isinstance(payload, dict):
            spd = float(payload.get("speed", 5.0))
            body = struct.pack("<Bf", msg_type, spd)
        elif isinstance(payload, (bytes, bytearray)):
            body = bytes([msg_type]) + bytes(payload)
        else:
            body = bytes([msg_type])

        length = len(body)
        cs = _checksum(body)
        return struct.pack("<BB", _HEADER, length) + body + struct.pack("<BB", cs, _FOOTER)
    except Exception as e:
        print(f"protocol.encode_message error: {e}")
        return bytes([_HEADER, 1, msg_type, 0x00, _FOOTER])


def decode_message(data: bytes):
    if not data or len(data) < 5:
        return None, b""
    try:
        if data[0] != _HEADER:
            return None, b""
        length = data[1]
        if len(data) < 2 + length + 2:
            return None, b""
        body = data[2 : 2 + length]
        cs_recv = data[2 + length]
        footer  = data[2 + length + 1]
        if footer != _FOOTER or cs_recv != _checksum(body):
            return None, b""
        msg_type = body[0]
        return msg_type, body[1:]
    except Exception:
        return None, b""
