# Midnight Eclipse — Pi LED Board

## Hardware Setup

- Raspberry Pi 3B+ or 4
- WS2812B LED strip (24 LEDs minimum)
- 5V power supply (2A+) for LEDs
- 300–500Ω resistor on data line
- GPIO18 → data in (via resistor)
- GND shared between Pi and LED strip
- LED strip 5V → separate 5V supply (NOT Pi 5V pin)

## Wiring
```
Pi GPIO18 ──[330Ω]──► WS2812B Data In
Pi GND    ────────────► WS2812B GND
5V PSU    ────────────► WS2812B 5V
5V PSU GND ──────────► Pi GND (common ground)
```

## LED Layout (24 LEDs, clockwise from top)
```
         IRIS (0,1,2) — N
    ATLAS (21,22,23)    NOVA (3,4,5)
PROMETHEUS (18,19,20)     VEGA (6,7,8)
    AURA (15,16,17)    CORVUS (9,10,11)
         HOSHI (12,13,14) — S
```
Within each group: LED 0 = Polaris node, 1 = mid, 2 = outer

## Installation

```bash
# On Raspberry Pi
sudo apt-get update
sudo apt-get install python3-pip
pip3 install -r requirements.txt

# Enable SPI and disable audio (conflicts with GPIO18/PWM)
sudo nano /boot/config.txt
# Add: dtparam=audio=off
# Reboot
```

## Running

```bash
# Replace with your server's IP
sudo python3 pi_client.py --server http://192.168.1.X:3000 --password claws2025

# Test mode (run on any machine, no Pi needed)
python3 pi_client.py --server http://localhost:3000
```

## Notes

- Must run with `sudo` for GPIO access
- The script works in simulation mode on non-Pi hardware (for testing)
- Server IP must be reachable from the Pi (same WiFi network)
- If LEDs flicker, add a 1000µF capacitor across 5V/GND near the strip
