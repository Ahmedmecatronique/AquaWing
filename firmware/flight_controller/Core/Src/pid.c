/* pid.c — Generic PID controller implementation */
#include "pid.h"

static float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

void pid_init(PID *p, float kp, float ki, float kd,
              float out_min, float out_max, float imax)
{
    p->kp           = kp;
    p->ki           = ki;
    p->kd           = kd;
    p->output_min   = out_min;
    p->output_max   = out_max;
    p->integral_limit = imax;
    pid_reset(p);
}

float pid_update(PID *p, float setpoint, float measured, float dt)
{
    if (dt <= 0.0f) return 0.0f;

    float error = setpoint - measured;

    /* Proportional */
    float out_p = p->kp * error;

    /* Integral with anti-windup clamp */
    p->integral += error * dt;
    p->integral  = clampf(p->integral, -p->integral_limit, p->integral_limit);
    float out_i  = p->ki * p->integral;

    /* Derivative (on measurement to avoid derivative kick on setpoint changes) */
    float deriv  = (error - p->prev_error) / dt;
    float out_d  = p->kd * deriv;
    p->prev_error = error;

    return clampf(out_p + out_i + out_d, p->output_min, p->output_max);
}

void pid_reset(PID *p)
{
    p->integral   = 0.0f;
    p->prev_error = 0.0f;
}

void pid_set_gains(PID *p, float kp, float ki, float kd)
{
    p->kp = kp;
    p->ki = ki;
    p->kd = kd;
    pid_reset(p);
}
