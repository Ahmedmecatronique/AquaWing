/* startup_stm32f103xb.s — Minimal startup for STM32F103C8T6 */
    .syntax unified
    .cpu cortex-m3
    .thumb

    .global  Reset_Handler
    .global  Default_Handler

/* ── Stack top (defined in linker script) ─────────────────── */
    .word _estack

/* ── Vector table ─────────────────────────────────────────── */
    .section .isr_vector, "a", %progbits
    .type isr_vector, %object
isr_vector:
    .word _estack               /* 0: Stack pointer initial value */
    .word Reset_Handler         /* 1: Reset                       */
    .word Default_Handler       /* 2: NMI                         */
    .word Default_Handler       /* 3: HardFault                   */
    .word Default_Handler       /* 4: MemManage                   */
    .word Default_Handler       /* 5: BusFault                    */
    .word Default_Handler       /* 6: UsageFault                  */
    .word 0                     /* 7-10: Reserved                 */
    .word 0
    .word 0
    .word 0
    .word Default_Handler       /* 11: SVC                        */
    .word Default_Handler       /* 12: DebugMon                   */
    .word 0                     /* 13: Reserved                   */
    .word Default_Handler       /* 14: PendSV                     */
    .word SysTick_Handler       /* 15: SysTick                    */
    /* External interrupts */
    .word Default_Handler       /* 0:  WWDG                       */
    .word Default_Handler       /* 1:  PVD                        */
    .word Default_Handler       /* 2:  TAMPER                     */
    .word Default_Handler       /* 3:  RTC                        */
    .word Default_Handler       /* 4:  FLASH                      */
    .word Default_Handler       /* 5:  RCC                        */
    .word Default_Handler       /* 6:  EXTI0                      */
    .word Default_Handler       /* 7:  EXTI1                      */
    .word Default_Handler       /* 8:  EXTI2                      */
    .word Default_Handler       /* 9:  EXTI3                      */
    .word Default_Handler       /* 10: EXTI4                      */
    .word Default_Handler       /* 11: DMA1_CH1                   */
    .word Default_Handler       /* 12: DMA1_CH2                   */
    .word Default_Handler       /* 13: DMA1_CH3                   */
    .word Default_Handler       /* 14: DMA1_CH4                   */
    .word Default_Handler       /* 15: DMA1_CH5                   */
    .word Default_Handler       /* 16: DMA1_CH6                   */
    .word Default_Handler       /* 17: DMA1_CH7                   */
    .word Default_Handler       /* 18: ADC1_2                     */
    .word Default_Handler       /* 19: USB_HP_CAN_TX              */
    .word Default_Handler       /* 20: USB_LP_CAN_RX0             */
    .word Default_Handler       /* 21: CAN_RX1                    */
    .word Default_Handler       /* 22: CAN_SCE                    */
    .word Default_Handler       /* 23: EXTI9_5                    */
    .word Default_Handler       /* 24: TIM1_BRK                   */
    .word Default_Handler       /* 25: TIM1_UP                    */
    .word Default_Handler       /* 26: TIM1_TRG_COM               */
    .word Default_Handler       /* 27: TIM1_CC                    */
    .word Default_Handler       /* 28: TIM2                       */
    .word Default_Handler       /* 29: TIM3                       */
    .word Default_Handler       /* 30: TIM4                       */
    .word Default_Handler       /* 31: I2C1_EV                    */
    .word Default_Handler       /* 32: I2C1_ER                    */
    .word Default_Handler       /* 33: I2C2_EV                    */
    .word Default_Handler       /* 34: I2C2_ER                    */
    .word Default_Handler       /* 35: SPI1                       */
    .word Default_Handler       /* 36: SPI2                       */
    .word USART1_IRQHandler     /* 37: USART1                     */
    .word Default_Handler       /* 38: USART2                     */
    .word Default_Handler       /* 39: USART3                     */
    .word Default_Handler       /* 40: EXTI15_10                  */
    .word Default_Handler       /* 41: RTC_Alarm                  */
    .word Default_Handler       /* 42: USBWakeUp                  */

/* ── Reset handler ────────────────────────────────────────── */
    .section .text.Reset_Handler, "ax", %progbits
    .type Reset_Handler, %function
Reset_Handler:
    /* Copy .data from Flash to SRAM */
    ldr  r0, =_sdata
    ldr  r1, =_edata
    ldr  r2, =_sidata
copy_data:
    cmp  r0, r1
    bge  zero_bss
    ldr  r3, [r2], #4
    str  r3, [r0], #4
    b    copy_data
zero_bss:
    /* Zero .bss */
    ldr  r0, =_sbss
    ldr  r1, =_ebss
    mov  r2, #0
zero_loop:
    cmp  r0, r1
    bge  call_main
    str  r2, [r0], #4
    b    zero_loop
call_main:
    bl   main
    bx   lr

/* ── Default / weak handlers ──────────────────────────────── */
    .section .text.Default_Handler, "ax", %progbits
    .weak Default_Handler
    .type Default_Handler, %function
Default_Handler:
    b    Default_Handler    /* Infinite loop on unhandled IRQ */

    .weak SysTick_Handler
    .type SysTick_Handler, %function
SysTick_Handler:
    bx   lr

    .weak USART1_IRQHandler
    .type USART1_IRQHandler, %function
USART1_IRQHandler:
    bx   lr
