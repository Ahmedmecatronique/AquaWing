/* pwm.c — TIM3 PWM init + update for STM32F103 (register-level) */
#include "pwm.h"
#include "stm32f1xx.h"

/* ─────────────────────────────────────────────────────────────
   APB1 bus clock = 36 MHz (assuming 72 MHz SYSCLK, AHB/2)
   TIM3 prescaler = 35  →  timer clock = 36 MHz / 36 = 1 MHz
   ARR = 19999           →  period = 20 000 µs = 50 Hz
   CCR = pulse_us        →  directly in µs
   ───────────────────────────────────────────────────────────── */
#define TIM3_PSC   35U
#define TIM3_ARR   19999U

void pwm_init(void)
{
    /* ── Enable clocks ────────────────────────────────────── */
    RCC->APB2ENR |= RCC_APB2ENR_IOPAEN | RCC_APB2ENR_IOPBEN;
    RCC->APB1ENR |= RCC_APB1ENR_TIM3EN;

    /* ── GPIO alternate function (push-pull, 50 MHz) ─────── */
    /* PA6 (CH1), PA7 (CH2) — GPIOA CRL bits [27:24],[31:28] */
    GPIOA->CRL &= ~(0xFFUL << 24);
    GPIOA->CRL |=  (0xBBUL << 24);   /* AF push-pull 50 MHz */

    /* PB0 (CH3), PB1 (CH4) — GPIOB CRL bits [3:0],[7:4] */
    GPIOB->CRL &= ~(0xFFUL << 0);
    GPIOB->CRL |=  (0xBBUL << 0);    /* AF push-pull 50 MHz */

    /* ── TIM3 base config ─────────────────────────────────── */
    TIM3->PSC  = TIM3_PSC;
    TIM3->ARR  = TIM3_ARR;

    /* PWM mode 1 on all channels, preload enable */
    TIM3->CCMR1 = (6U << 4)  | TIM_CCMR1_OC1PE   /* CH1 */
                | (6U << 12) | TIM_CCMR1_OC2PE;  /* CH2 */
    TIM3->CCMR2 = (6U << 4)  | TIM_CCMR2_OC3PE   /* CH3 */
                | (6U << 12) | TIM_CCMR2_OC4PE;  /* CH4 */

    /* Enable all channels, active high */
    TIM3->CCER = TIM_CCER_CC1E | TIM_CCER_CC2E
               | TIM_CCER_CC3E | TIM_CCER_CC4E;

    /* Init all ESCs at minimum pulse */
    TIM3->CCR1 = 1000U;
    TIM3->CCR2 = 1000U;
    TIM3->CCR3 = 1000U;
    TIM3->CCR4 = 1000U;

    /* Auto-reload preload + counter enable */
    TIM3->CR1 = TIM_CR1_ARPE | TIM_CR1_CEN;

    /* Force update to load PSC/ARR */
    TIM3->EGR = TIM_EGR_UG;
}

void pwm_set_us(uint8_t motor, uint16_t pulse_us)
{
    /* Clamp to safe ESC range */
    if (pulse_us < 1000U) pulse_us = 1000U;
    if (pulse_us > 2000U) pulse_us = 2000U;

    switch (motor) {
    case 0: TIM3->CCR1 = pulse_us; break;
    case 1: TIM3->CCR2 = pulse_us; break;
    case 2: TIM3->CCR3 = pulse_us; break;
    case 3: TIM3->CCR4 = pulse_us; break;
    }
}

void pwm_set_all_us(uint16_t pulse_us)
{
    if (pulse_us < 1000U) pulse_us = 1000U;
    if (pulse_us > 2000U) pulse_us = 2000U;
    TIM3->CCR1 = pulse_us;
    TIM3->CCR2 = pulse_us;
    TIM3->CCR3 = pulse_us;
    TIM3->CCR4 = pulse_us;
}
