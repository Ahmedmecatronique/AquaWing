/* uart.c — USART1 115200 8N1 with frame parser */
#include "uart.h"
#include "stm32f1xx.h"
#include <string.h>

/* ── Internal RX state machine ─────────────────────────────── */
typedef enum {
    RX_WAIT_SYNC1 = 0,
    RX_WAIT_SYNC2,
    RX_CMD,
    RX_LEN,
    RX_DATA,
    RX_CRC,
} RxState;

static uart_frame_cb_t s_cb;

static struct {
    RxState  state;
    uint8_t  cmd;
    uint8_t  len;
    uint8_t  idx;
    uint8_t  buf[UART_RX_BUFLEN];
} s_rx;

/* ── Init ───────────────────────────────────────────────────── */
void uart_init(uart_frame_cb_t cb)
{
    s_cb = cb;
    memset(&s_rx, 0, sizeof(s_rx));

    /* Enable clocks */
    RCC->APB2ENR |= RCC_APB2ENR_IOPAEN | RCC_APB2ENR_USART1EN;

    /* PA9 TX → AF push-pull 50 MHz (CRH bits [7:4]) */
    GPIOA->CRH &= ~(0xFUL << 4);
    GPIOA->CRH |=  (0xBUL << 4);

    /* PA10 RX → input floating (CRH bits [11:8]) */
    GPIOA->CRH &= ~(0xFUL << 8);
    GPIOA->CRH |=  (0x4UL << 8);

    /* Baud rate: USART1 on APB2 = 72 MHz
       BRR = 72 000 000 / 115200 = 625.0  → mantissa=625, fraction=0 */
    USART1->BRR = (625U << 4) | 0U;

    /* 8N1, enable TX, RX, RXNE interrupt, USART */
    USART1->CR1 = USART_CR1_TE | USART_CR1_RE
                | USART_CR1_RXNEIE | USART_CR1_UE;

    /* Enable IRQ in NVIC, priority 1 */
    NVIC_SetPriority(USART1_IRQn, 1);
    NVIC_EnableIRQ(USART1_IRQn);
}

/* ── Blocking TX ────────────────────────────────────────────── */
void uart_send(const uint8_t *buf, uint8_t len)
{
    for (uint8_t i = 0; i < len; i++) {
        while (!(USART1->SR & USART_SR_TXE)) {}
        USART1->DR = buf[i];
    }
    /* Wait for last byte to shift out */
    while (!(USART1->SR & USART_SR_TC)) {}
}

void uart_send_frame(uint8_t cmd, const void *payload, uint8_t plen)
{
    uint8_t frame[4 + UART_RX_BUFLEN + 1];
    proto_build(frame, cmd, payload, plen);
    uart_send(frame, PROTO_HDR + plen + 1U);
}

/* ── RX ISR (called from USART1_IRQHandler) ─────────────────── */
void uart_irq_handler(void)
{
    if (!(USART1->SR & USART_SR_RXNE)) return;

    uint8_t byte = (uint8_t)USART1->DR;

    switch (s_rx.state) {
    case RX_WAIT_SYNC1:
        if (byte == PROTO_SYNC1) s_rx.state = RX_WAIT_SYNC2;
        break;

    case RX_WAIT_SYNC2:
        s_rx.state = (byte == PROTO_SYNC2) ? RX_CMD : RX_WAIT_SYNC1;
        break;

    case RX_CMD:
        s_rx.cmd   = byte;
        s_rx.state = RX_LEN;
        break;

    case RX_LEN:
        s_rx.len   = byte;
        s_rx.idx   = 0;
        s_rx.state = (byte == 0) ? RX_CRC : RX_DATA;
        break;

    case RX_DATA:
        if (s_rx.idx < UART_RX_BUFLEN)
            s_rx.buf[s_rx.idx] = byte;
        if (++s_rx.idx >= s_rx.len)
            s_rx.state = RX_CRC;
        break;

    case RX_CRC: {
        uint8_t expected = proto_crc8(s_rx.buf, s_rx.len);
        /* include cmd+len in CRC */
        expected ^= s_rx.cmd ^ s_rx.len;
        if (byte == expected && s_cb)
            s_cb(s_rx.cmd, s_rx.buf, s_rx.len);
        s_rx.state = RX_WAIT_SYNC1;
        break;
    }

    default:
        s_rx.state = RX_WAIT_SYNC1;
        break;
    }
}
