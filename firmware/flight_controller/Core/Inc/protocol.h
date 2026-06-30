/* protocol.h — AquaWing UART protocol STM32 <-> Raspberry Pi */
#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <stdint.h>

/* ── Frame format ──────────────────────────────────────────────
   [0xAA][0x55][CMD][LEN][DATA × LEN][CRC8]
   CRC8 = XOR of CMD + LEN + DATA bytes
   ─────────────────────────────────────────────────────────── */
#define PROTO_SYNC1  0xAA
#define PROTO_SYNC2  0x55
#define PROTO_HDR    4    /* sync1 + sync2 + cmd + len */

/* ── Commands Pi → STM32 ──────────────────────────────────── */
#define CMD_ARM          0x01  /* no data                    */
#define CMD_DISARM       0x02  /* no data                    */
#define CMD_SETPOINT     0x03  /* SetpointPkt                */
#define CMD_SET_PID      0x04  /* PidGainPkt                 */
#define CMD_SET_MODE     0x05  /* 1 byte: 0=STABILIZE 1=ALT  */
#define CMD_PING         0x06  /* no data, replies ACK       */

/* ── Commands STM32 → Pi ──────────────────────────────────── */
#define CMD_ACK          0x10  /* 1 byte: cmd echoed         */
#define CMD_NACK         0x11  /* 1 byte: cmd echoed         */
#define CMD_TELEMETRY    0x12  /* TelemetryPkt               */
#define CMD_STATUS       0x13  /* StatusPkt                  */

/* ── Flight axes ──────────────────────────────────────────── */
#define AXIS_ROLL    0
#define AXIS_PITCH   1
#define AXIS_YAW     2
#define AXIS_ALT     3

/* ── Packed structs (1-byte aligned) ─────────────────────── */
#pragma pack(push, 1)

/* Pi → STM32: setpoints in centidegrees (roll/pitch/yaw) + throttle 0-1000 */
typedef struct {
    int16_t  roll;       /* centidegrees, ±4500  */
    int16_t  pitch;      /* centidegrees, ±4500  */
    int16_t  yaw;        /* centidegrees/s       */
    uint16_t throttle;   /* 0-1000               */
} SetpointPkt;

/* Pi → STM32: PID gains (float32 × 3 for one axis) */
typedef struct {
    uint8_t  axis;       /* AXIS_*               */
    float    kp;
    float    ki;
    float    kd;
} PidGainPkt;

/* STM32 → Pi: full telemetry at ~50 Hz */
typedef struct {
    int16_t  roll_actual;    /* centidegrees         */
    int16_t  pitch_actual;   /* centidegrees         */
    int16_t  yaw_actual;     /* centidegrees         */
    uint16_t motor[4];       /* 1000-2000 µs         */
    uint8_t  armed;          /* 0/1                  */
    uint8_t  mode;           /* 0=STABILIZE 1=ALT    */
    uint16_t loop_time_us;   /* last PID loop time   */
} TelemetryPkt;

/* STM32 → Pi: status word */
typedef struct {
    uint8_t  armed;
    uint8_t  mode;
    uint8_t  errors;         /* bitmask              */
    uint16_t uptime_s;
} StatusPkt;

#pragma pack(pop)

/* ── Error bitmask ────────────────────────────────────────── */
#define ERR_UART_OVERFLOW  (1 << 0)
#define ERR_MOTOR_CLAMP    (1 << 1)
#define ERR_WATCHDOG       (1 << 2)

/* ── Utility ──────────────────────────────────────────────── */
uint8_t proto_crc8(const uint8_t *data, uint8_t len);
void    proto_build(uint8_t *buf, uint8_t cmd, const void *payload, uint8_t plen);

#endif /* PROTOCOL_H */
