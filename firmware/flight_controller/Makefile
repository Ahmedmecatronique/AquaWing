# AquaWing Flight Controller — STM32F103C8T6
# Compile: make
# Flash:   make flash  (via st-flash)
# Clean:   make clean

TARGET  = aquawing_fc
DEVICE  = STM32F103xB

CC      = arm-none-eabi-gcc
AS      = arm-none-eabi-as
OBJCOPY = arm-none-eabi-objcopy
SIZE    = arm-none-eabi-size
FLASH   = st-flash

CFLAGS  = -mcpu=cortex-m3 -mthumb -O2 -Wall -Wextra \
          -DSTM32F103xB \
          -ICore/Inc \
          -IDrivers/CMSIS/Include \
          -IDrivers/CMSIS/Device/ST/STM32F1xx/Include \
          -ffunction-sections -fdata-sections \
          -fno-exceptions --specs=nano.specs

LDFLAGS = -mcpu=cortex-m3 -mthumb \
          -Tlinker/STM32F103C8TX_FLASH.ld \
          -Wl,--gc-sections \
          -Wl,-Map=$(BUILD)/$(TARGET).map \
          --specs=nano.specs --specs=nosys.specs

BUILD   = build
SRCS    = Core/Src/main.c Core/Src/system_stm32f1xx.c \
          Core/Src/uart.c \
          Core/Src/pwm.c \
          Core/Src/pid.c \
          Core/Src/flight_controller.c \
          Core/Src/protocol.c

ASRCS   = startup/startup_stm32f103xb.s

OBJS    = $(SRCS:Core/Src/%.c=$(BUILD)/%.o) \
          $(BUILD)/startup.o

.PHONY: all flash clean

all: $(BUILD)/$(TARGET).hex
	@$(SIZE) $(BUILD)/$(TARGET).elf

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/%.o: Core/Src/%.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/startup.o: startup/startup_stm32f103xb.s | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/$(TARGET).elf: $(OBJS)
	$(CC) $(LDFLAGS) $^ -o $@ -lm

$(BUILD)/$(TARGET).hex: $(BUILD)/$(TARGET).elf
	$(OBJCOPY) -O ihex $< $@
	$(OBJCOPY) -O binary $< $(BUILD)/$(TARGET).bin

flash: $(BUILD)/$(TARGET).bin
	$(FLASH) write $(BUILD)/$(TARGET).bin 0x08000000

clean:
	rm -rf $(BUILD)
