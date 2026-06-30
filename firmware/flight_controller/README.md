# AquaWing — Firmware STM32F103 Flight Controller

Firmware bare-metal pour le controleur de vol du drone AquaWing.
Cible : **STM32F103C8T6** (Blue Pill, Cortex-M3, 72 MHz, 64 KB Flash, 20 KB RAM)

---

## Structure du projet

```
firmware/flight_controller/
|-- Makefile                          Build system (arm-none-eabi-gcc)
|-- linker/
|   `-- STM32F103C8TX_FLASH.ld        Script linker (64 KB Flash / 20 KB RAM)
|-- startup/
|   `-- startup_stm32f103xb.s         Vecteurs d'interruption + Reset_Handler
|-- Core/
|   |-- Inc/
|   |   |-- stm32f1xx.h               Registres STM32F103 (auto-contenu, sans HAL)
|   |   |-- protocol.h                Protocole UART Pi <-> STM32 (frames + structs)
|   |   |-- pid.h                     Controleur PID generique
|   |   |-- pwm.h                     Driver TIM3 -> 4 sorties ESC PWM
|   |   |-- uart.h                    Driver USART1 (RX interrupt, TX bloquant)
|   |   `-- flight_controller.h       Logique de vol + mixing moteurs
|   `-- Src/
|       |-- main.c                    Point d'entree, boucle principale 500 Hz
|       |-- system_stm32f1xx.c        Definition de SystemCoreClock
|       |-- pid.c                     Implementation PID (P + I anti-windup + D)
|       |-- pwm.c                     Init TIM3 + mise a jour CCR en direct
|       |-- uart.c                    Machine a etats RX + builder TX
|       |-- flight_controller.c       Calcul PID + mixing X-frame + arm/disarm
|       `-- protocol.c                CRC8 + construction de frames
`-- build/                            Genere par make
    |-- aquawing_fc.elf               Binaire ELF (debug + size)
    |-- aquawing_fc.hex               Intel HEX (STM32CubeProgrammer)
    `-- aquawing_fc.bin               Binaire brut (st-flash)
```

---

## Materiel requis

| Composant | Detail |
|-----------|--------|
| Microcontroleur | STM32F103C8T6 (Blue Pill) |
| Cristal externe | 8 MHz (HSE) — obligatoire pour PLL 72 MHz |
| Raspberry Pi | Pi 4 — commande via UART |
| ESC x4 | Standard PWM 50 Hz, signal 1000-2000 us |
| Moteurs brushless x4 | Configuration quadrotor X-frame |
| Programmateur | ST-Link V2 ou USB-to-serial (bootloader) |

---

## Brochage (Pinout)

### UART — Communication Raspberry Pi

```
Raspberry Pi         STM32F103 Blue Pill
-----------          ------------------
GPIO14 (TX)  ----->  PA10 (USART1 RX)
GPIO15 (RX)  <-----  PA9  (USART1 TX)
GND          ------  GND
```

> Activer UART sur la Pi :
> Ajouter dans `/boot/config.txt` :
> ```
> enable_uart=1
> dtoverlay=disable-bt
> ```
> Port serie disponible sur : `/dev/serial0` ou `/dev/ttyAMA0`

### PWM — Sorties ESC (TIM3, 50 Hz)

```
Pin STM32   Timer Channel   Moteur          Position (vue du dessus)
---------   -------------   ------          ----------------------
PA6         TIM3_CH1        Moteur 0 (FL)   Avant-Gauche  (CCW)
PA7         TIM3_CH2        Moteur 1 (FR)   Avant-Droit   (CW)
PB0         TIM3_CH3        Moteur 2 (RL)   Arriere-Gauche (CW)
PB1         TIM3_CH4        Moteur 3 (RR)   Arriere-Droit  (CCW)
```

```
Vue du dessus du drone (X-frame) :

        AVANT
   M0(CCW)  M1(CW)
      \        /
       \      /
       /      \
      /        \
   M2(CW)  M3(CCW)
```

### LED de statut

```
PC13 (LED onboard Blue Pill, active LOW) :
  - Clignote lent (1 Hz)  : desarme, en attente
  - Clignote rapide (10 Hz): arme, moteurs actifs
  - Allumee fixe           : boot en cours
```

### Programmation (ST-Link)

```
ST-Link V2      STM32 Blue Pill
----------      ---------------
SWDIO   ----->  PA13
SWCLK   ----->  PA14
GND     ------  GND
3.3V    ----->  3.3V  (ou alimentation externe)
```

---

## Protocole UART Pi <-> STM32

### Format de trame

```
[ 0xAA ][ 0x55 ][ CMD ][ LEN ][ DATA x LEN ][ CRC8 ]
   ^        ^      ^      ^         ^             ^
 Sync1    Sync2  Commande Longueur  Payload    XOR(CMD+LEN+DATA)
```

- Vitesse : **115200 baud, 8N1**
- CRC8 : XOR de CMD + LEN + tous les octets DATA
- Taille max payload : 64 octets

### Commandes Pi -> STM32

| CMD  | Valeur | Payload | Description |
|------|--------|---------|-------------|
| ARM  | 0x01 | aucun (LEN=0) | Arme les moteurs |
| DISARM | 0x02 | aucun | Desarme, stoppe tout |
| SETPOINT | 0x03 | `SetpointPkt` (8 octets) | Consignes roll/pitch/yaw/throttle |
| SET_PID | 0x04 | `PidGainPkt` (13 octets) | Regle les gains PID d'un axe |
| SET_MODE | 0x05 | 1 octet (0=STABILIZE, 1=ALT_HOLD) | Change le mode de vol |
| PING | 0x06 | aucun | Test de connexion |

### Reponses STM32 -> Pi

| CMD | Valeur | Payload | Description |
|-----|--------|---------|-------------|
| ACK | 0x10 | 1 octet (cmd echo) | Commande acceptee |
| NACK | 0x11 | 1 octet (cmd echo) | Commande refusee / inconnue |
| TELEMETRY | 0x12 | `TelemetryPkt` (15 octets) | Etat temps reel a 50 Hz |
| STATUS | 0x13 | `StatusPkt` (5 octets) | Etat general |

### Structures de donnees

```c
// SetpointPkt — Pi -> STM32 (8 octets)
typedef struct {
    int16_t  roll;       // centidegres, -4500 a +4500 (= -45 a +45 deg)
    int16_t  pitch;      // centidegres, -4500 a +4500
    int16_t  yaw;        // deg/s, -180 a +180
    uint16_t throttle;   // 0 a 1000 (= 0% a 100%)
} SetpointPkt;

// PidGainPkt — Pi -> STM32 (13 octets)
typedef struct {
    uint8_t axis;    // 0=roll, 1=pitch, 2=yaw
    float   kp;
    float   ki;
    float   kd;
} PidGainPkt;

// TelemetryPkt — STM32 -> Pi (15 octets)
typedef struct {
    int16_t  roll_actual;    // centidegres mesures
    int16_t  pitch_actual;   // centidegres mesures
    int16_t  yaw_actual;     // centidegres mesures
    uint16_t motor[4];       // impulsions ESC en us (1000-2000)
    uint8_t  armed;          // 0 = desarme, 1 = arme
    uint8_t  mode;           // 0 = STABILIZE, 1 = ALT_HOLD
    uint16_t loop_time_us;   // duree de la derniere iteration PID
} TelemetryPkt;
```

### Exemple d'envoi depuis Python (Raspberry Pi)

```python
import serial, struct

ser = serial.Serial('/dev/serial0', 115200, timeout=1)

def crc8(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b
    return crc

def send_frame(cmd: int, payload: bytes = b''):
    length = len(payload)
    crc = crc8(bytes([cmd, length]) + payload)
    frame = bytes([0xAA, 0x55, cmd, length]) + payload + bytes([crc])
    ser.write(frame)

# Armer
send_frame(0x01)

# Envoyer des consignes (roll=5deg, pitch=0, yaw=0, throttle=40%)
payload = struct.pack('<hhhH', 500, 0, 0, 400)
send_frame(0x03, payload)

# Changer les gains PID du roll
payload = struct.pack('<Bfff', 0, 0.8, 0.05, 0.15)  # axis, kp, ki, kd
send_frame(0x04, payload)

# Desarmer
send_frame(0x02)
```

---

## Controleur PID

### Architecture

```
Consigne (Pi)        Mesure (IMU)
     |                    |
     v                    v
  [Erreur] -----> [P]---+
                  [I]---+----> [Saturation] --> Commande moteurs
                  [D]---+
```

### Parametres par defaut

| Axe | Kp | Ki | Kd | Sortie max |
|-----|----|----|----|------------|
| Roll | 0.80 | 0.05 | 0.15 | +/-300 |
| Pitch | 0.80 | 0.05 | 0.15 | +/-300 |
| Yaw | 2.00 | 0.02 | 0.10 | +/-300 |

> Ces valeurs sont des points de depart. A affiner lors du premier vol.

### Anti-windup

L'integrale est saturee a +/-100 pour eviter le debordement lors des phases bloquees (moteurs au minimum, drone au sol).

---

## Mixing moteurs (X-frame)

```
M_FL = throttle_us + pitch_out + roll_out - yaw_out
M_FR = throttle_us + pitch_out - roll_out + yaw_out
M_RL = throttle_us - pitch_out + roll_out + yaw_out
M_RR = throttle_us - pitch_out - roll_out - yaw_out

Clamp final : [1050, 2000] us
```

| Signal | Effet |
|--------|-------|
| Pitch+ | Incline vers l'avant (avant monte, arriere descend) |
| Roll+ | Incline a droite (gauche monte, droite descend) |
| Yaw+ | Rotation horaire vue du dessus |
| Throttle | Puissance globale des 4 moteurs |

---

## Timings et frequences

| Parametre | Valeur |
|-----------|--------|
| Frequence CPU | 72 MHz (HSE 8 MHz x PLL x9) |
| SysTick | 1 kHz (1 ms) |
| Boucle PID | ~500 Hz (toutes les 2 ms) |
| Frequence PWM ESC | 50 Hz (periode 20 ms) |
| Telemetrie vers Pi | 50 Hz (toutes les 20 ms) |
| Watchdog Pi (timeout) | 500 ms (100 iterations) |

---

## Watchdog de securite

Si aucune trame valide n'est recue de la Pi pendant **500 ms**, le STM32 **desarme automatiquement** tous les moteurs et positionne le flag `ERR_WATCHDOG`.

---

## Compilation

### Prerequis (sur Raspberry Pi ou Linux)

```bash
sudo apt install gcc-arm-none-eabi binutils-arm-none-eabi libnewlib-arm-none-eabi
```

### Compiler

```bash
cd firmware/flight_controller
make
```

Sortie :
```
   text    data     bss     dec     hex filename
   4964       4     240    5208    1458 build/aquawing_fc.elf
```

### Flasher via st-flash (ST-Link V2)

```bash
sudo apt install stlink-tools
make flash
```

### Flasher via STM32CubeProgrammer (GUI)

1. Ouvrir `build/aquawing_fc.hex`
2. Connecter ST-Link V2
3. Cliquer "Connect" puis "Download"

### Flasher via bootloader USB (sans ST-Link)

```bash
sudo apt install stm32flash
# Mettre BOOT0=1, reset, puis :
stm32flash -w build/aquawing_fc.bin -v -g 0x08000000 /dev/ttyUSB0
```

---

## Extension : ajouter un IMU

Le code actuel suppose `meas_roll = meas_pitch = meas_yaw = 0`.
Pour connecter un vrai IMU (ex: MPU6050 via I2C) :

```c
// Dans main.c, dans la boucle principale :

// TODO : implementer imu_read()
// imu_read(&fc.meas_roll, &fc.meas_pitch, &fc.meas_yaw);

// Brochage I2C1 :
// PB6 = SCL
// PB7 = SDA
// Adresse MPU6050 : 0x68 (AD0=GND) ou 0x69 (AD0=3.3V)
```

---

## Flags d'erreur

| Flag | Valeur | Description |
|------|--------|-------------|
| ERR_UART_OVERFLOW | 0x01 | Buffer RX depasse |
| ERR_MOTOR_CLAMP | 0x02 | Sortie moteur saturee |
| ERR_WATCHDOG | 0x04 | Pi silencieuse > 500 ms |

---

## Consommation Flash / RAM

| Section | Taille |
|---------|--------|
| .text (code + constantes) | 4964 octets / 64 KB |
| .data (variables init) | 4 octets |
| .bss (variables zero) | 240 octets |
| **Total Flash utilise** | **~8%** |
| **Total RAM utilise** | **~1.2%** |
