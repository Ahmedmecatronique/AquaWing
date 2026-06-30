/* flight_controller.c — Quadrotor X-frame PID + motor mixing */
#include "flight_controller.h"
#include "pwm.h"
#include <stddef.h>

/* ── Clamp helpers ─────────────────────────────────────────── */
static float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}
static uint16_t clampu16(float v, uint16_t lo, uint16_t hi) {
    if (v < (float)lo) return lo;
    if (v > (float)hi) return hi;
    return (uint16_t)v;
}

/* ── Init ───────────────────────────────────────────────────── */
void fc_init(FlightController *fc)
{
    fc->armed      = 0;
    fc->mode       = MODE_STABILIZE;
    fc->sp_roll    = 0.0f;
    fc->sp_pitch   = 0.0f;
    fc->sp_yaw_rate = 0.0f;
    fc->sp_throttle = 0.0f;
    fc->meas_roll  = 0.0f;
    fc->meas_pitch = 0.0f;
    fc->meas_yaw   = 0.0f;
    fc->loop_count = 0;
    fc->last_loop_us = 0;

    /* Default PID gains — tune after maiden flight
       kp,   ki,   kd,   out_min, out_max, imax */
    pid_init(&fc->pid_roll,  0.8f, 0.05f, 0.15f, -300.0f, 300.0f, 100.0f);
    pid_init(&fc->pid_pitch, 0.8f, 0.05f, 0.15f, -300.0f, 300.0f, 100.0f);
    pid_init(&fc->pid_yaw,   2.0f, 0.02f, 0.10f, -300.0f, 300.0f, 100.0f);

    for (int i = 0; i < NUM_MOTORS; i++)
        fc->motor_us[i] = ESC_MIN;
}

/* ── Arm / Disarm ───────────────────────────────────────────── */
void fc_arm(FlightController *fc)
{
    pid_reset(&fc->pid_roll);
    pid_reset(&fc->pid_pitch);
    pid_reset(&fc->pid_yaw);
    fc->armed = 1;
    /* Send arm pulse to all ESCs */
    for (int i = 0; i < NUM_MOTORS; i++) {
        fc->motor_us[i] = ESC_ARM_PULSE;
        pwm_set_us(i, ESC_ARM_PULSE);
    }
}

void fc_disarm(FlightController *fc)
{
    fc->armed = 0;
    fc->sp_throttle = 0.0f;
    for (int i = 0; i < NUM_MOTORS; i++) {
        fc->motor_us[i] = ESC_MIN;
        pwm_set_us(i, ESC_MIN);
    }
    pid_reset(&fc->pid_roll);
    pid_reset(&fc->pid_pitch);
    pid_reset(&fc->pid_yaw);
}

/* ── Setpoints ──────────────────────────────────────────────── */
void fc_set_setpoint(FlightController *fc,
                     float roll_deg, float pitch_deg,
                     float yaw_rate, float throttle_0_1)
{
    fc->sp_roll      = clampf(roll_deg,    -45.0f, 45.0f);
    fc->sp_pitch     = clampf(pitch_deg,   -45.0f, 45.0f);
    fc->sp_yaw_rate  = clampf(yaw_rate,   -180.0f, 180.0f);
    fc->sp_throttle  = clampf(throttle_0_1, 0.0f,   1.0f);
}

void fc_set_mode(FlightController *fc, FlightMode mode)
{
    fc->mode = mode;
}

void fc_set_pid_gains(FlightController *fc, uint8_t axis,
                      float kp, float ki, float kd)
{
    switch (axis) {
    case 0: pid_set_gains(&fc->pid_roll,  kp, ki, kd); break;
    case 1: pid_set_gains(&fc->pid_pitch, kp, ki, kd); break;
    case 2: pid_set_gains(&fc->pid_yaw,   kp, ki, kd); break;
    }
}

/* ── Main PID loop (call at fixed rate, e.g. 400 Hz) ────────── */
void fc_update(FlightController *fc, float dt_s)
{
    fc->loop_count++;

    if (!fc->armed) {
        for (int i = 0; i < NUM_MOTORS; i++) {
            fc->motor_us[i] = ESC_MIN;
            pwm_set_us(i, ESC_MIN);
        }
        return;
    }

    /* ── PID computations ─────────────────────────────────── */
    float out_roll  = pid_update(&fc->pid_roll,  fc->sp_roll,      fc->meas_roll,  dt_s);
    float out_pitch = pid_update(&fc->pid_pitch, fc->sp_pitch,     fc->meas_pitch, dt_s);
    float out_yaw   = pid_update(&fc->pid_yaw,   fc->sp_yaw_rate,  0.0f,           dt_s);
    /* Note: for yaw in STABILIZE we control yaw RATE not angle */

    /* Base throttle in µs range [ESC_IDLE, ESC_MAX] */
    float base = ESC_IDLE + fc->sp_throttle * (ESC_MAX - ESC_IDLE);

    /* ── Motor mixing — X-frame ───────────────────────────────
       Motor layout (top view):
            Front
       FL(CCW)  FR(CW)
           \   /
           /   \
       RL(CW)  RR(CCW)

       M_FL = base + pitch + roll - yaw
       M_FR = base + pitch - roll + yaw
       M_RL = base - pitch + roll + yaw
       M_RR = base - pitch - roll - yaw
       ────────────────────────────────────────────────────── */
    float m[NUM_MOTORS];
    m[MOTOR_FL] = base + out_pitch + out_roll - out_yaw;
    m[MOTOR_FR] = base + out_pitch - out_roll + out_yaw;
    m[MOTOR_RL] = base - out_pitch + out_roll + out_yaw;
    m[MOTOR_RR] = base - out_pitch - out_roll - out_yaw;

    /* Clamp and apply */
    for (int i = 0; i < NUM_MOTORS; i++) {
        fc->motor_us[i] = clampu16(m[i], ESC_IDLE, ESC_MAX);
        pwm_set_us(i, fc->motor_us[i]);
    }
}
