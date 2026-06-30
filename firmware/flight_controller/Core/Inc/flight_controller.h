/* flight_controller.h — Quadrotor flight controller (STM32F103) */
#ifndef FLIGHT_CONTROLLER_H
#define FLIGHT_CONTROLLER_H

#include <stdint.h>
#include "pid.h"

/* ── Motor indices (X-frame) ──────────────────────────────────
       Front
   M0(CCW)  M1(CW)
      +         +
   M2(CW)   M3(CCW)
   ─────────────────────────────────────────────────────────── */
#define MOTOR_FL  0   /* PA6  TIM3_CH1 */
#define MOTOR_FR  1   /* PA7  TIM3_CH2 */
#define MOTOR_RL  2   /* PB0  TIM3_CH3 */
#define MOTOR_RR  3   /* PB1  TIM3_CH4 */

#define NUM_MOTORS 4

/* ESC pulse range (µs) */
#define ESC_MIN   1000
#define ESC_MAX   2000
#define ESC_IDLE   1050
#define ESC_ARM_PULSE 1000

/* Flight modes */
typedef enum {
    MODE_STABILIZE = 0,
    MODE_ALT_HOLD  = 1,
} FlightMode;

/* Controller state */
typedef struct {
    uint8_t    armed;
    FlightMode mode;

    /* Setpoints from Pi */
    float sp_roll;       /* degrees      */
    float sp_pitch;      /* degrees      */
    float sp_yaw_rate;   /* degrees/s    */
    float sp_throttle;   /* 0.0 – 1.0    */

    /* Measured angles (from IMU stub — extend with real IMU) */
    float meas_roll;
    float meas_pitch;
    float meas_yaw;

    /* PID controllers */
    PID   pid_roll;
    PID   pid_pitch;
    PID   pid_yaw;

    /* Motor outputs [ESC_MIN .. ESC_MAX] µs */
    uint16_t motor_us[NUM_MOTORS];

    /* Stats */
    uint32_t loop_count;
    uint16_t last_loop_us;
} FlightController;

/* ── API ────────────────────────────────────────────────────── */
void fc_init(FlightController *fc);
void fc_update(FlightController *fc, float dt_s);
void fc_arm(FlightController *fc);
void fc_disarm(FlightController *fc);
void fc_set_setpoint(FlightController *fc,
                     float roll_deg, float pitch_deg,
                     float yaw_rate, float throttle_0_1);
void fc_set_mode(FlightController *fc, FlightMode mode);
void fc_set_pid_gains(FlightController *fc, uint8_t axis,
                      float kp, float ki, float kd);

#endif /* FLIGHT_CONTROLLER_H */
