/* uart.h — USART1 driver for STM32F103 (interrupt-driven RX, blocking TX) */
#ifndef UART_H
#define UART_H

#include <stdint.h>
#include "protocol.h"

/*
 * USART1 — PA9 (TX), PA10 (RX)
 * Baud: 115200, 8N1
 * Connected to Raspberry Pi GPIO UART (GPIO14/TX, GPIO15/RX)
 *
 * Pi side: /dev/serial0  or  /dev/ttyAMA0
 * Enable UART on Pi: add "enable_uart=1" to /boot/config.txt
 *                    disable bluetooth: "dtoverlay=disable-bt"
 */

#define UART_BAUD       115200U
#define UART_RX_BUFLEN  64U

/* Parsed frame callback — called from ISR context, keep it short */
typedef void (*uart_frame_cb_t)(uint8_t cmd, const uint8_t *data, uint8_t len);

void uart_init(uart_frame_cb_t cb);
void uart_send(const uint8_t *buf, uint8_t len);
void uart_send_frame(uint8_t cmd, const void *payload, uint8_t plen);

/* Called from USART1_IRQHandler in stm32f1xx_it.c */
void uart_irq_handler(void);

#endif /* UART_H */
