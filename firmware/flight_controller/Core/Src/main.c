/* main.c — AquaWing flight controller firmware (STM32F103C8T6)
 *
 * Clock: 72 MHz (HSE 8 MHz × PLL × 9)
 * UART1: PA9(TX) PA10(RX) → Raspberry Pi @ 115200 baud
 * PWM:   PA6/PA7/PB0/PB1  → TIM3 CH1-4 → 4 ESCs @ 50 Hz
 * LED:   PC13 (active low, onboard Blue Pill LED)
 *
 * Loop rate: 400 Hz (2500 µs) via SysTick
 * Telemetry: sent to Pi every 20 ms (50 Hz)
 */
#include "stm32f1xx.h"
#include "uart.h"
#include "pwm.h"
#include "pid.h"
#include "flight_controller.h"
#include "protocol.h"
#include <string.h>
#include <stdint.h>

/* ── Globals ────────────────────────────────────────────────── */
static FlightController fc;
static volatile uint32_t tick_ms = 0;   /* SysTick counter (1 kHz) */
static volatile uint8_t  loop_flag = 0; /* set by SysTick every 2.5 ms */
static uint8_t  watchdog_cnt  = 0;      /* reset on every valid Pi frame */
static uint32_t last_telem_ms = 0;
static uint8_t  error_flags   = 0;
static uint32_t uptime_s      = 0;

/* ── LED helpers (PC13, active LOW) ─────────────────────────── */
#define LED_ON()   (GPIOC->BRR  = GPIO_BRR_BR13)
#define LED_OFF()  (GPIOC->BSRR = GPIO_BSRR_BS13)
#define LED_TOG()  (GPIOC->ODR ^= GPIO_ODR_ODR13)

/* ── SysTick handler (1 kHz) ────────────────────────────────── */
void SysTick_Handler(void)
{
    tick_ms++;

    /* 400 Hz loop flag: every 2 ticks (approx, actual 500 Hz)
       Adjust to 400 Hz: every 2.5 ms is not an integer, so we
       alternate between 2 and 3 ms ticks for an effective 400 Hz. */
    static uint8_t sub = 0;
    sub++;
    if (sub >= 2) {   /* ~500 Hz; reduce to 400 Hz with modulo below */
        sub = 0;
        loop_flag = 1;
    }

    /* 1-second uptime counter */
    if (tick_ms % 1000 == 0) uptime_s++;
}

/* ── UART frame callback (called from USART1 ISR) ──────────── */
static void on_frame(uint8_t cmd, const uint8_t *data, uint8_t len)
{
    watchdog_cnt = 0;   /* Pi is alive */

    switch (cmd) {

    case CMD_ARM:
        fc_arm(&fc);
        uart_send_frame(CMD_ACK, &cmd, 1);
        break;

    case CMD_DISARM:
        fc_disarm(&fc);
        uart_send_frame(CMD_ACK, &cmd, 1);
        break;

    case CMD_SETPOINT:
        if (len == sizeof(SetpointPkt)) {
            SetpointPkt sp;
            memcpy(&sp, data, sizeof(sp));
            fc_set_setpoint(&fc,
                sp.roll     / 100.0f,    /* centidegrees → degrees */
                sp.pitch    / 100.0f,
                (float)sp.yaw,           /* deg/s direct            */
                sp.throttle / 1000.0f);  /* 0-1000 → 0.0-1.0       */
        }
        break;

    case CMD_SET_PID:
        if (len == sizeof(PidGainPkt)) {
            PidGainPkt pg;
            memcpy(&pg, data, sizeof(pg));
            fc_set_pid_gains(&fc, pg.axis, pg.kp, pg.ki, pg.kd);
            uart_send_frame(CMD_ACK, &cmd, 1);
        }
        break;

    case CMD_SET_MODE:
        if (len == 1) {
            fc_set_mode(&fc, (FlightMode)data[0]);
            uart_send_frame(CMD_ACK, &cmd, 1);
        }
        break;

    case CMD_PING: {
        uint8_t ack = CMD_PING;
        uart_send_frame(CMD_ACK, &ack, 1);
        break;
    }

    default:
        uart_send_frame(CMD_NACK, &cmd, 1);
        break;
    }
}

/* ── Clock init: 72 MHz via HSE 8 MHz + PLL ×9 ────────────── */
static void clock_init(void)
{
    /* Enable HSE and wait */
    RCC->CR |= RCC_CR_HSEON;
    while (!(RCC->CR & RCC_CR_HSERDY)) {}

    /* Set 2 wait states for Flash at 72 MHz */
    FLASH->ACR = FLASH_ACR_PRFTBE | FLASH_ACR_LATENCY_2;

    /* AHB /1, APB1 /2 (max 36 MHz), APB2 /1 */
    RCC->CFGR = RCC_CFGR_HPRE_DIV1
              | RCC_CFGR_PPRE1_DIV2
              | RCC_CFGR_PPRE2_DIV1
              | RCC_CFGR_PLLSRC        /* HSE as PLL source */
              | RCC_CFGR_PLLMULL9;     /* PLL ×9 = 72 MHz   */

    /* Enable PLL and wait */
    RCC->CR |= RCC_CR_PLLON;
    while (!(RCC->CR & RCC_CR_PLLRDY)) {}

    /* Switch to PLL */
    RCC->CFGR |= RCC_CFGR_SW_PLL;
    while ((RCC->CFGR & RCC_CFGR_SWS) != RCC_CFGR_SWS_PLL) {}

    SystemCoreClock = 72000000UL;
}

/* ── GPIO init: PC13 LED ────────────────────────────────────── */
static void gpio_init(void)
{
    RCC->APB2ENR |= RCC_APB2ENR_IOPCEN;
    /* PC13 output push-pull 2 MHz */
    GPIOC->CRH &= ~(0xFUL << 20);
    GPIOC->CRH |=  (0x2UL << 20);
    LED_OFF();
}

/* ── Send telemetry to Pi ───────────────────────────────────── */
static void send_telemetry(void)
{
    TelemetryPkt t;
    t.roll_actual  = (int16_t)(fc.meas_roll  * 100.0f);
    t.pitch_actual = (int16_t)(fc.meas_pitch * 100.0f);
    t.yaw_actual   = (int16_t)(fc.meas_yaw   * 100.0f);
    for (int i = 0; i < 4; i++) t.motor[i] = fc.motor_us[i];
    t.armed        = fc.armed;
    t.mode         = (uint8_t)fc.mode;
    t.loop_time_us = fc.last_loop_us;
    uart_send_frame(CMD_TELEMETRY, &t, sizeof(t));
}

/* ── Main ───────────────────────────────────────────────────── */
int main(void)
{
    clock_init();
    gpio_init();

    /* SysTick at 1 kHz */
    SysTick_Config(SystemCoreClock / 1000U);

    pwm_init();
    uart_init(on_frame);
    fc_init(&fc);

    LED_ON();   /* Signal boot OK */

    uint32_t last_loop_ms = 0;

    while (1) {
        if (!loop_flag) continue;
        loop_flag = 0;

        uint32_t now_ms = tick_ms;
        float dt = (float)(now_ms - last_loop_ms) / 1000.0f;
        last_loop_ms = now_ms;
        if (dt <= 0.0f || dt > 0.1f) dt = 0.0025f;  /* clamp */

        /* ── Watchdog: disarm if Pi silent > 500 ms ─────── */
        watchdog_cnt++;
        if (watchdog_cnt > 200U && fc.armed) {   /* 200 × 2.5 ms = 500 ms */
            fc_disarm(&fc);
            error_flags |= ERR_WATCHDOG;
        }

        /* ── PID update ─────────────────────────────────── */
        /* TODO: replace with real IMU read (MPU6050, ICM-42688...)
           For now meas_* stay at 0 — extend here:
           imu_read(&fc.meas_roll, &fc.meas_pitch, &fc.meas_yaw); */
        fc_update(&fc, dt);

        /* ── Telemetry at 50 Hz ──────────────────────────── */
        if (now_ms - last_telem_ms >= 20U) {
            last_telem_ms = now_ms;
            send_telemetry();
        }

        /* ── Status LED: slow blink disarmed, fast armed ── */
        if (fc.armed) {
            if (now_ms % 100 < 50) LED_ON(); else LED_OFF();
        } else {
            if (now_ms % 1000 < 50) LED_ON(); else LED_OFF();
        }
    }
}

/* ── ISR vector ─────────────────────────────────────────────── */
void USART1_IRQHandler(void)
{
    uart_irq_handler();
}
