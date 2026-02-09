"""
AquaWing — Configuration Câblage Matériel
==========================================

Câblage Raspberry Pi 5 uniquement.
Le reste (moteurs, servos, ESC, IMU, baro...) est géré par le Flight Controller STM32.

Seuls 2 périphériques sont branchés directement sur le RPi :
  1. Caméra thermique AMG8833 (I2C)
  2. GPS NEO-M8N (UART)

Pour modifier un branchement, change les valeurs ici.

Usage :
    from config.cablage import THERMAL_CAMERA, GPS
"""

# ============================================================================
# CAMÉRA THERMIQUE — AMG8833 (I2C)
# ============================================================================
#
#  AMG8833       │  Raspberry Pi 5
# ───────────────┼──────────────────
#  VCC / VIN     │  3.3V (Pin 1)
#  GND           │  GND  (Pin 9 ou autre GND)
#  SDA           │  GPIO2 (Pin 3)
#  SCL           │  GPIO3 (Pin 5)
#

THERMAL_CAMERA = {
    "name": "AMG8833 Caméra Thermique IR",
    "bus": "i2c",
    "i2c_bus": 1,            # /dev/i2c-1
    "address": 0x69,         # Adresse I2C (0x68 si pont soudé)
    "sda_gpio": 2,           # Pin 3
    "scl_gpio": 3,           # Pin 5
    "vcc_pin": 1,            # Pin physique 3.3V
    "resolution": (8, 8),    # Matrice 8×8 pixels
    "fps": 10,
    "enabled": True,
}

# ============================================================================
# GPS — NEO-M8N (UART)
# ============================================================================
#
#  NEO-M8N       │  Raspberry Pi 5
# ───────────────┼──────────────────
#  TX            │  GPIO15 / RX (Pin 10)
#  RX            │  GPIO14 / TX (Pin 8)
#  GND           │  GND (Pin 6)
#  VCC           │  3.3V ou 5V selon module
#

GPS = {
    "name": "NEO-M8N GPS",
    "bus": "uart",
    "port": "/dev/ttyAMA0",  # UART matériel RPi 5
    "baudrate": 9600,        # Défaut NEO-M8N (configurable 38400, 57600, 115200)
    "tx_gpio": 14,           # Pin 8  (RPi TX → GPS RX)
    "rx_gpio": 15,           # Pin 10 (RPi RX → GPS TX)
    "gnd_pin": 6,            # Pin physique GND
    "timeout_s": 1.0,
    "enabled": True,
}

# ====================================================================
# RÉSUMÉ BRANCHEMENT
# ====================================================================
#
#  GPIO / Pin  │ Fonction
# ─────────────┼─────────────────────────
#  3.3V  Pin 1 │ AMG8833 VCC
#  GPIO2 Pin 3 │ AMG8833 SDA (I2C)
#  GPIO3 Pin 5 │ AMG8833 SCL (I2C)
#  GND   Pin 6 │ GPS GND
#  GPIO14 Pin 8│ GPS TX (RPi → GPS)
#  GPIO15 P.10 │ GPS RX (GPS → RPi)
#  GND   Pin 9 │ AMG8833 GND
#
