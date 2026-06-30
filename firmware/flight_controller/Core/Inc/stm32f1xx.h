/* stm32f1xx.h — Minimal CMSIS-style header for STM32F103xB
 * Covers: RCC, GPIO, USART1, TIM3, FLASH, NVIC, SysTick
 * All register addresses for STM32F103C8T6 (medium-density)
 */
#ifndef STM32F1XX_H
#define STM32F1XX_H

#include <stdint.h>

/* ── Core registers ────────────────────────────────────────── */
typedef struct {
    volatile uint32_t CTRL;
    volatile uint32_t LOAD;
    volatile uint32_t VAL;
    volatile uint32_t CALIB;
} SysTick_Type;

typedef struct {
    volatile uint32_t ISER[8];
             uint32_t RESERVED0[24];
    volatile uint32_t ICER[8];
             uint32_t RESERVED1[24];
    volatile uint32_t ISPR[8];
             uint32_t RESERVED2[24];
    volatile uint32_t ICPR[8];
             uint32_t RESERVED3[24];
    volatile uint32_t IABR[8];
             uint32_t RESERVED4[56];
    volatile uint8_t  IP[240];
             uint32_t RESERVED5[644];
    volatile uint32_t STIR;
} NVIC_Type;

#define SysTick_BASE  0xE000E010UL
#define NVIC_BASE     0xE000E100UL
#define SysTick       ((SysTick_Type *)SysTick_BASE)
#define NVIC          ((NVIC_Type    *)NVIC_BASE)

static inline void NVIC_SetPriority(int IRQn, uint32_t priority) {
    NVIC->IP[(uint32_t)IRQn] = (uint8_t)((priority << 4) & 0xFFU);
}
static inline void NVIC_EnableIRQ(int IRQn) {
    NVIC->ISER[(uint32_t)IRQn >> 5] = 1UL << ((uint32_t)IRQn & 0x1FUL);
}
static inline uint32_t SysTick_Config(uint32_t ticks) {
    SysTick->LOAD = ticks - 1UL;
    NVIC_SetPriority(-1, (1UL << 4) - 1UL);
    SysTick->VAL  = 0UL;
    SysTick->CTRL = 7UL; /* ENABLE | TICKINT | CLKSOURCE */
    return 0;
}

extern volatile uint32_t SystemCoreClock;

/* ── IRQ numbers ───────────────────────────────────────────── */
#define USART1_IRQn  37

/* ── Peripheral base addresses ─────────────────────────────── */
#define PERIPH_BASE    0x40000000UL
#define APB1PERIPH_BASE PERIPH_BASE
#define APB2PERIPH_BASE (PERIPH_BASE + 0x00010000UL)
#define AHBPERIPH_BASE  (PERIPH_BASE + 0x00020000UL)

#define TIM3_BASE    (APB1PERIPH_BASE + 0x0400UL)
#define USART1_BASE  (APB2PERIPH_BASE + 0x3800UL)
#define GPIOA_BASE   (APB2PERIPH_BASE + 0x0800UL)
#define GPIOB_BASE   (APB2PERIPH_BASE + 0x0C00UL)
#define GPIOC_BASE   (APB2PERIPH_BASE + 0x1000UL)
#define RCC_BASE     (AHBPERIPH_BASE  + 0x1000UL)
#define FLASH_BASE   (AHBPERIPH_BASE  + 0x2000UL)

/* ── RCC ───────────────────────────────────────────────────── */
typedef struct {
    volatile uint32_t CR;
    volatile uint32_t CFGR;
    volatile uint32_t CIR;
    volatile uint32_t APB2RSTR;
    volatile uint32_t APB1RSTR;
    volatile uint32_t AHBENR;
    volatile uint32_t APB2ENR;
    volatile uint32_t APB1ENR;
    volatile uint32_t BDCR;
    volatile uint32_t CSR;
} RCC_TypeDef;

#define RCC  ((RCC_TypeDef *)RCC_BASE)

#define RCC_CR_HSEON          (1UL << 16)
#define RCC_CR_HSERDY         (1UL << 17)
#define RCC_CR_PLLON          (1UL << 24)
#define RCC_CR_PLLRDY         (1UL << 25)

#define RCC_CFGR_SW_PLL       (2UL << 0)
#define RCC_CFGR_SWS          (3UL << 2)
#define RCC_CFGR_SWS_PLL      (2UL << 2)
#define RCC_CFGR_HPRE_DIV1    (0UL << 4)
#define RCC_CFGR_PPRE1_DIV2   (4UL << 8)
#define RCC_CFGR_PPRE2_DIV1   (0UL << 11)
#define RCC_CFGR_PLLSRC       (1UL << 16)
#define RCC_CFGR_PLLMULL9     (7UL << 18)

#define RCC_APB2ENR_IOPAEN    (1UL << 2)
#define RCC_APB2ENR_IOPBEN    (1UL << 3)
#define RCC_APB2ENR_IOPCEN    (1UL << 4)
#define RCC_APB2ENR_USART1EN  (1UL << 14)

#define RCC_APB1ENR_TIM3EN    (1UL << 1)

/* ── FLASH ─────────────────────────────────────────────────── */
typedef struct {
    volatile uint32_t ACR;
    volatile uint32_t KEYR;
    volatile uint32_t OPTKEYR;
    volatile uint32_t SR;
    volatile uint32_t CR;
    volatile uint32_t AR;
             uint32_t RESERVED;
    volatile uint32_t OBR;
    volatile uint32_t WRPR;
} FLASH_TypeDef;

#define FLASH ((FLASH_TypeDef *)FLASH_BASE)
#define FLASH_ACR_LATENCY_2   (2UL << 0)
#define FLASH_ACR_PRFTBE      (1UL << 4)

/* ── GPIO ──────────────────────────────────────────────────── */
typedef struct {
    volatile uint32_t CRL;
    volatile uint32_t CRH;
    volatile uint32_t IDR;
    volatile uint32_t ODR;
    volatile uint32_t BSRR;
    volatile uint32_t BRR;
    volatile uint32_t LCKR;
} GPIO_TypeDef;

#define GPIOA ((GPIO_TypeDef *)GPIOA_BASE)
#define GPIOB ((GPIO_TypeDef *)GPIOB_BASE)
#define GPIOC ((GPIO_TypeDef *)GPIOC_BASE)

#define GPIO_BRR_BR13   (1UL << 13)
#define GPIO_BSRR_BS13  (1UL << 13)
#define GPIO_ODR_ODR13  (1UL << 13)

/* ── USART ─────────────────────────────────────────────────── */
typedef struct {
    volatile uint32_t SR;
    volatile uint32_t DR;
    volatile uint32_t BRR;
    volatile uint32_t CR1;
    volatile uint32_t CR2;
    volatile uint32_t CR3;
    volatile uint32_t GTPR;
} USART_TypeDef;

#define USART1 ((USART_TypeDef *)USART1_BASE)

#define USART_SR_RXNE    (1UL << 5)
#define USART_SR_TXE     (1UL << 7)
#define USART_SR_TC      (1UL << 6)

#define USART_CR1_UE     (1UL << 13)
#define USART_CR1_TE     (1UL << 3)
#define USART_CR1_RE     (1UL << 2)
#define USART_CR1_RXNEIE (1UL << 5)

/* ── TIM3 ──────────────────────────────────────────────────── */
typedef struct {
    volatile uint32_t CR1;
    volatile uint32_t CR2;
    volatile uint32_t SMCR;
    volatile uint32_t DIER;
    volatile uint32_t SR;
    volatile uint32_t EGR;
    volatile uint32_t CCMR1;
    volatile uint32_t CCMR2;
    volatile uint32_t CCER;
    volatile uint32_t CNT;
    volatile uint32_t PSC;
    volatile uint32_t ARR;
             uint32_t RESERVED1;
    volatile uint32_t CCR1;
    volatile uint32_t CCR2;
    volatile uint32_t CCR3;
    volatile uint32_t CCR4;
             uint32_t RESERVED2;
    volatile uint32_t DCR;
    volatile uint32_t DMAR;
} TIM_TypeDef;

#define TIM3 ((TIM_TypeDef *)TIM3_BASE)

#define TIM_CR1_CEN     (1UL << 0)
#define TIM_CR1_ARPE    (1UL << 7)
#define TIM_EGR_UG      (1UL << 0)
#define TIM_CCMR1_OC1PE (1UL << 3)
#define TIM_CCMR1_OC2PE (1UL << 11)
#define TIM_CCMR2_OC3PE (1UL << 3)
#define TIM_CCMR2_OC4PE (1UL << 11)
#define TIM_CCER_CC1E   (1UL << 0)
#define TIM_CCER_CC2E   (1UL << 4)
#define TIM_CCER_CC3E   (1UL << 8)
#define TIM_CCER_CC4E   (1UL << 12)

#endif /* STM32F1XX_H */
