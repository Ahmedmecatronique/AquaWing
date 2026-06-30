/* pwm.h — TIM3 PWM for 4 ESC outputs on STM32F103 */
#ifndef PWM_H
#define PWM_H

#include <stdint.h>

/*
 * Pin mapping (TIM3):
 *   Motor 0 (FL) — PA6  TIM3_CH1
 *   Motor 1 (FR) — PA7  TIM3_CH2
 *   Motor 2 (RL) — PB0  TIM3_CH3
 *   Motor 3 (RR) — PB1  TIM3_CH4
 *
 * PWM frequency: 50 Hz (20 ms period)
 * Pulse range: 1000 – 2000 µs
 * APB1 = 36 MHz → TIM3 pre-scaled to 1 MHz (prescaler = 36-1 = 35)
 * ARR = 20000 − 1  (20 ms at 1 MHz)
 * CCR = pulse_us   (directly in µs ticks)
 */

void     pwm_init(void);
void     pwm_set_us(uint8_t motor, uint16_t pulse_us);
void     pwm_set_all_us(uint16_t pulse_us);

#endif /* PWM_H */
