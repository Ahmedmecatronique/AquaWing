/* pid.h — Generic PID controller */
#ifndef PID_H
#define PID_H

#include <stdint.h>

typedef struct {
    float kp;
    float ki;
    float kd;

    float integral;
    float prev_error;
    float output_min;
    float output_max;
    float integral_limit;
} PID;

void  pid_init(PID *p, float kp, float ki, float kd,
               float out_min, float out_max, float imax);
float pid_update(PID *p, float setpoint, float measured, float dt);
void  pid_reset(PID *p);
void  pid_set_gains(PID *p, float kp, float ki, float kd);

#endif /* PID_H */
