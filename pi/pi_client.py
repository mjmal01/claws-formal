#!/usr/bin/env python3
"""
Midnight Eclipse — Raspberry Pi LED Matrix Controller
8x panels of WS2812B 16x16 (2048 LEDs total), arranged 4 wide x 2 tall.
Each panel = one constellation / subteam.

Panel layout:
  ┌──────────┬──────────┬──────────┬──────────┐
  │  IRIS    │  NOVA    │  VEGA    │  CORVUS  │  (panels 0-3, LEDs 0-1023)
  ├──────────┼──────────┼──────────┼──────────┤
  │  HOSHI   │  AURA    │ PROMETH. │  ATLAS   │  (panels 4-7, LEDs 1024-2047)
  └──────────┴──────────┴──────────┴──────────┘

Wiring: Pi GPIO18 → Panel0 DIN → Panel0 DOUT → Panel1 DIN → ... → Panel7 DOUT

Hardware: Pi Zero 2 W
Install:  pip install -r requirements.txt
Run:      sudo python3 pi_client.py --server http://SERVER_IP:3000
"""

import argparse
import time
import threading
import math
import colorsys
import socketio
import json
import sys
import os

# ─── Hardware detection ────────────────────────────────────────────────────────

try:
    from rpi_ws281x import PixelStrip, Color
    HARDWARE_MODE = True
    print("[LED] Hardware mode — rpi_ws281x detected")
except ImportError:
    HARDWARE_MODE = False
    print("[LED] Simulation mode — install rpi_ws281x on Pi for real LEDs")

# ─── Config ───────────────────────────────────────────────────────────────────

PANEL_W     = 16
PANEL_H     = 16
PANEL_SIZE  = PANEL_W * PANEL_H   # 256 per panel
PANEL_COUNT = 8
LED_COUNT   = PANEL_SIZE * PANEL_COUNT   # 2048 total
LED_PIN     = 18
LED_FREQ_HZ = 800000
LED_DMA     = 10
LED_INVERT  = False
LED_CHANNEL = 0
SERPENTINE  = True

# Panel → constellation mapping (matches led_map.json)
PANEL_CONSTELLATIONS = [
    'IRIS', 'NOVA', 'VEGA', 'CORVUS',       # row 0
    'HOSHI', 'AURA', 'PROMETHEUS', 'ATLAS',  # row 1
]

# ─── Addressing helpers ───────────────────────────────────────────────────────

def panel_xy(panel, x, y):
    """
    Convert (panel_index, local_x, local_y) → global LED strip index.
    Each panel is 16x16 with serpentine row wiring.
    """
    x = max(0, min(PANEL_W - 1, x))
    y = max(0, min(PANEL_H - 1, y))
    base = panel * PANEL_SIZE
    if SERPENTINE and (y % 2 == 1):
        return base + y * PANEL_W + (PANEL_W - 1 - x)
    return base + y * PANEL_W + x

def global_xy(gx, gy):
    """
    Convert global grid coords (0-63 x, 0-31 y) across the full 4x2 panel array
    → global LED strip index.
    """
    panel_col = gx // PANEL_W
    panel_row = gy // PANEL_H
    panel = panel_row * 4 + panel_col
    local_x = gx % PANEL_W
    local_y = gy % PANEL_H
    return panel_xy(panel, local_x, local_y)

def constellation_panel(name):
    """Return panel index for a constellation name."""
    try:
        return PANEL_CONSTELLATIONS.index(name)
    except ValueError:
        return None

# ─── Bresenham line drawing ───────────────────────────────────────────────────

def line_pixels(x0, y0, x1, y1):
    pixels = []
    dx = abs(x1-x0); dy = abs(y1-y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    while True:
        pixels.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy: err -= dy; x0 += sx
        if e2 < dx:  err += dx; y0 += sy
    return pixels

# ─── LED Matrix Controller ────────────────────────────────────────────────────

class MatrixController:
    def __init__(self, brightness=100):
        self._pixels   = [(0,0,0)] * LED_COUNT
        self._base     = [(0,0,0)] * LED_COUNT
        self._lock     = threading.Lock()
        self._anim     = None
        self._stop_evt = threading.Event()
        self.brightness = brightness
        self._sim_tick  = 0

        if HARDWARE_MODE:
            self.strip = PixelStrip(
                LED_COUNT, LED_PIN, LED_FREQ_HZ,
                LED_DMA, LED_INVERT, brightness, LED_CHANNEL
            )
            self.strip.begin()
            print(f"[LED] {LED_COUNT} LEDs on GPIO{LED_PIN} ({PANEL_COUNT} panels)")

    # ─── Show ────────────────────────────────────────────────────────────────

    def _show(self):
        if HARDWARE_MODE:
            for i, (r, g, b) in enumerate(self._pixels):
                self.strip.setPixelColor(i, Color(r, g, b))
            self.strip.show()
        else:
            self._sim_tick += 1
            if self._sim_tick % 40 == 0:
                print(f"\n[SIM] 8 panels (4x2) — {LED_COUNT} LEDs")
                for row in range(2):
                    for prow in range(PANEL_H):
                        line = ' '
                        for col in range(4):
                            panel = row * 4 + col
                            for pcol in range(PANEL_W):
                                idx = panel_xy(panel, pcol, prow)
                                r, g, b = self._pixels[idx]
                                line += '■' if max(r,g,b) > 20 else '·'
                            line += '  '
                        print(line)
                    print()

    def set_panel_xy(self, panel, x, y, r, g, b):
        self._pixels[panel_xy(panel, x, y)] = (r, g, b)

    def set_base_panel_xy(self, panel, x, y, r, g, b):
        i = panel_xy(panel, x, y)
        self._base[i] = (r, g, b)
        self._pixels[i] = (r, g, b)

    def fill_panel(self, panel, r, g, b):
        base = panel * PANEL_SIZE
        for i in range(PANEL_SIZE):
            self._pixels[base + i] = (r, g, b)

    def fill_panel_base(self, panel, r, g, b):
        base = panel * PANEL_SIZE
        for i in range(PANEL_SIZE):
            self._pixels[base + i] = (r, g, b)
            self._base[base + i] = (r, g, b)

    def show(self):
        with self._lock:
            self._show()

    def restore_base(self):
        with self._lock:
            self._pixels = list(self._base)
            self._show()

    def restore_panel_base(self, panel):
        base = panel * PANEL_SIZE
        for i in range(PANEL_SIZE):
            self._pixels[base + i] = self._base[base + i]

    def all_off(self):
        self._stop_animation()
        with self._lock:
            self._pixels = [(0,0,0)] * LED_COUNT
            self._base   = [(0,0,0)] * LED_COUNT
            self._show()

    def set_brightness(self, b):
        self.brightness = max(0, min(255, b))
        if HARDWARE_MODE:
            self.strip.setBrightness(self.brightness)
            self.strip.show()

    # ─── Animation ────────────────────────────────────────────────────────────

    def _stop_animation(self):
        if self._anim and self._anim.is_alive():
            self._stop_evt.set()
            self._anim.join(timeout=3)
        self._stop_evt.clear()

    def animate(self, fn, *args):
        self._stop_animation()
        stop = self._stop_evt
        self._anim = threading.Thread(target=fn, args=(stop,)+args, daemon=True)
        self._anim.start()

    # ─────────────────────────────────────────────────────────────────────────
    # PANEL-LEVEL ANIMATIONS
    # ─────────────────────────────────────────────────────────────────────────

    def star_online(self, panel, x, y, r, g, b):
        """A card just connected — their star flickers on then glows dim."""
        dim = 0.35
        self.set_base_panel_xy(panel, x, y, int(r*dim), int(g*dim), int(b*dim))
        def _run(stop):
            for br in [1.0, 0.15, 0.9, 0.15, 0.6, dim]:
                if stop.is_set(): break
                with self._lock:
                    self.set_panel_xy(panel, x, y, int(r*br), int(g*br), int(b*br))
                    self._show()
                time.sleep(0.07)
        self.animate(_run)
        print(f"[LED] Star online → {PANEL_CONSTELLATIONS[panel]} ({x},{y})")

    def constellation_partial(self, panel, stars, r, g, b):
        """2 of 3 members online — active stars pulse softly, panel background barely glows."""
        # Set dim background on whole panel
        for y in range(PANEL_H):
            for x in range(PANEL_W):
                self.set_base_panel_xy(panel, x, y, int(r*0.04), int(g*0.04), int(b*0.04))
        for (sx, sy) in stars:
            self.set_base_panel_xy(panel, sx, sy, int(r*0.35), int(g*0.35), int(b*0.35))

        def _run(stop):
            for _ in range(3):
                if stop.is_set(): break
                for step in range(20):
                    if stop.is_set(): break
                    br = 0.35 + step/50
                    with self._lock:
                        for (sx, sy) in stars:
                            self.set_panel_xy(panel, sx, sy, int(r*br), int(g*br), int(b*br))
                        self._show()
                    time.sleep(0.04)
                for step in range(20, 0, -1):
                    if stop.is_set(): break
                    br = 0.35 + step/50
                    with self._lock:
                        for (sx, sy) in stars:
                            self.set_panel_xy(panel, sx, sy, int(r*br), int(g*br), int(b*br))
                        self._show()
                    time.sleep(0.04)
            self.restore_base()
        self.animate(_run)

    def constellation_full(self, panel, stars, lines, r, g, b):
        """
        All 3 members online — FULL ACTIVATION:
        1. Panel background ripples on
        2. Stars flash
        3. Lines draw in pixel by pixel
        4. Settles to steady bright glow with dim background
        """
        name = PANEL_CONSTELLATIONS[panel]
        print(f"[LED] ★ FULL CONSTELLATION → {name}")

        # Build all pixels in this constellation drawing
        drawing = list(stars)
        for seg in lines:
            for px in line_pixels(*seg[0], *seg[1]):
                if px not in drawing:
                    drawing.append(px)

        # Set base state: dim bg + bright drawing
        for y in range(PANEL_H):
            for x in range(PANEL_W):
                self.set_base_panel_xy(panel, x, y, int(r*0.06), int(g*0.06), int(b*0.06))
        for (px, py) in drawing:
            self.set_base_panel_xy(panel, px, py, int(r*0.85), int(g*0.85), int(b*0.85))

        def _run(stop):
            # Panel background wipe on (column by column, fast)
            for col in range(PANEL_W):
                if stop.is_set(): break
                with self._lock:
                    for row in range(PANEL_H):
                        self.set_panel_xy(panel, col, row, int(r*0.08), int(g*0.08), int(b*0.08))
                    self._show()
                time.sleep(0.025)

            time.sleep(0.1)
            if stop.is_set(): return

            # Stars flash 3x
            for _ in range(3):
                if stop.is_set(): break
                with self._lock:
                    for (sx, sy) in stars:
                        self.set_panel_xy(panel, sx, sy, r, g, b)
                    self._show()
                time.sleep(0.1)
                with self._lock:
                    for (sx, sy) in stars:
                        self.set_panel_xy(panel, sx, sy, int(r*0.08), int(g*0.08), int(b*0.08))
                    self._show()
                time.sleep(0.07)
            if stop.is_set(): return

            # Stars steady on
            with self._lock:
                for (sx, sy) in stars:
                    self.set_panel_xy(panel, sx, sy, r, g, b)
                self._show()
            time.sleep(0.25)

            # Lines draw in pixel by pixel
            for seg in lines:
                pixels = line_pixels(*seg[0], *seg[1])
                for (px, py) in pixels:
                    if stop.is_set(): break
                    with self._lock:
                        self.set_panel_xy(panel, px, py, r, g, b)
                        self._show()
                    time.sleep(0.055)
                time.sleep(0.1)

            # Single breath pulse then settle
            if not stop.is_set():
                for step in range(8, 0, -1):
                    if stop.is_set(): break
                    br = 0.85 + step/40
                    with self._lock:
                        for (px, py) in drawing:
                            self.set_panel_xy(panel, px, py, min(255,int(r*br)), min(255,int(g*br)), min(255,int(b*br)))
                        self._show()
                    time.sleep(0.04)
            self.restore_base()
        self.animate(_run)

    def panel_flash(self, panel, r, g, b, flashes=4):
        """Whole panel flashes — used for cross-constellation rare events."""
        def _run(stop):
            for _ in range(flashes):
                if stop.is_set(): break
                with self._lock:
                    self.fill_panel(panel, r, g, b)
                    self._show()
                time.sleep(0.08)
                with self._lock:
                    self.restore_panel_base(panel)
                    self._show()
                time.sleep(0.08)
            self.restore_base()
        self.animate(_run)

    def pair_flash(self, panel_a, stars_a, color_a, panel_b, stars_b, color_b, rare=False):
        """Two constellations interact — flash their stars. Rare = extra effects."""
        ra, ga, ba = color_a
        rb, gb, bb = color_b

        def _run(stop):
            flashes = 5 if rare else 2
            for _ in range(flashes):
                if stop.is_set(): break
                with self._lock:
                    for (x, y) in stars_a:
                        self.set_panel_xy(panel_a, x, y, ra, ga, ba)
                    for (x, y) in stars_b:
                        self.set_panel_xy(panel_b, x, y, rb, gb, bb)
                    self._show()
                time.sleep(0.1)
                with self._lock:
                    for (x, y) in stars_a:
                        self.set_panel_xy(panel_a, x, y, 0, 0, 0)
                    for (x, y) in stars_b:
                        self.set_panel_xy(panel_b, x, y, 0, 0, 0)
                    self._show()
                time.sleep(0.08)

            if rare:
                # Both panels get a full dim wash then fade
                for step in range(20):
                    if stop.is_set(): break
                    br = step/20
                    with self._lock:
                        self.fill_panel(panel_a, int(ra*br*0.4), int(ga*br*0.4), int(ba*br*0.4))
                        self.fill_panel(panel_b, int(rb*br*0.4), int(gb*br*0.4), int(bb*br*0.4))
                        self._show()
                    time.sleep(0.025)
                time.sleep(0.2)
                for step in range(20, 0, -1):
                    if stop.is_set(): break
                    br = step/20
                    with self._lock:
                        self.fill_panel(panel_a, int(ra*br*0.4), int(ga*br*0.4), int(ba*br*0.4))
                        self.fill_panel(panel_b, int(rb*br*0.4), int(gb*br*0.4), int(bb*br*0.4))
                        self._show()
                    time.sleep(0.025)

            self.restore_base()
        self.animate(_run)

    def award_flash(self, panel, winner_star, all_stars, all_lines, r, g, b):
        """Award given — winner star blazes white, whole panel flashes gold."""
        wx, wy = winner_star
        def _run(stop):
            # Winner star white burst
            with self._lock:
                self.set_panel_xy(panel, wx, wy, 255, 255, 255)
                self._show()
            time.sleep(0.5)

            # Build all constellation pixels
            all_px = list(all_stars)
            for seg in all_lines:
                for px in line_pixels(*seg[0], *seg[1]):
                    if px not in all_px:
                        all_px.append(px)

            # Flash gold 5 times
            for _ in range(5):
                if stop.is_set(): break
                with self._lock:
                    self.fill_panel(panel, 40, 30, 0)  # dark gold bg
                    for (px, py) in all_px:
                        self.set_panel_xy(panel, px, py, 255, 215, 0)
                    self._show()
                time.sleep(0.14)
                with self._lock:
                    self.fill_panel(panel, 0, 0, 0)
                    for (px, py) in all_px:
                        self.set_panel_xy(panel, px, py, 0, 0, 0)
                    self._show()
                time.sleep(0.1)

            # Winner star stays bright gold, rest restores base
            for (px, py) in all_px:
                self.set_base_panel_xy(panel, px, py, int(r*0.85), int(g*0.85), int(b*0.85))
            self.set_base_panel_xy(panel, wx, wy, 255, 215, 0)
            self.restore_base()
        self.animate(_run)

    # ─────────────────────────────────────────────────────────────────────────
    # FULL-DISPLAY ANIMATIONS (all 8 panels)
    # ─────────────────────────────────────────────────────────────────────────

    def phase_transition(self, phase):
        print(f"[LED] Phase → {phase}")

        if phase == 'LOBBY':
            # Dim shimmer — random twinkles across all panels
            def _run(stop):
                import random
                for _ in range(100):
                    if stop.is_set(): break
                    active = [i for i, c in enumerate(self._base) if any(v > 0 for v in c)]
                    if active:
                        idx = random.choice(active)
                        r, g, b = self._base[idx]
                        with self._lock:
                            self._pixels[idx] = (min(255,r+60), min(255,g+60), min(255,b+60))
                            self._show()
                        time.sleep(0.04)
                        with self._lock:
                            self._pixels[idx] = self._base[idx]
                            self._show()
                    time.sleep(0.06)
            self.animate(_run)

        elif phase == 'DINNER':
            # Warm pulse on all active stars across all panels
            def _run(stop):
                for step in range(40):
                    if stop.is_set(): break
                    br = 0.8 + 0.2 * math.sin(step * 0.16)
                    with self._lock:
                        for i, (r, g, b) in enumerate(self._base):
                            if any(v > 0 for v in (r,g,b)):
                                self._pixels[i] = (min(255,int(r*br)), min(255,int(g*br)), min(255,int(b*br)))
                        self._show()
                    time.sleep(0.06)
                self.restore_base()
            self.animate(_run)

        elif phase == 'SPEECHES':
            # Panel-by-panel sweep: each panel brightens briefly left to right
            def _run(stop):
                for panel in range(PANEL_COUNT):
                    if stop.is_set(): break
                    r, g, b = 0, 0, 0
                    # Get this panel's color from its active base pixels
                    base_panel = self._base[panel*PANEL_SIZE:(panel+1)*PANEL_SIZE]
                    bright_pixels = [c for c in base_panel if any(v > 10 for v in c)]
                    if bright_pixels:
                        r = max(c[0] for c in bright_pixels)
                        g = max(c[1] for c in bright_pixels)
                        b = max(c[2] for c in bright_pixels)
                    else:
                        r, g, b = 40, 40, 80

                    for step in range(12):
                        if stop.is_set(): break
                        br = step/12
                        with self._lock:
                            self.fill_panel(panel, int(r*br*0.5), int(g*br*0.5), int(b*br*0.5))
                            self._show()
                        time.sleep(0.025)
                    for step in range(12, 0, -1):
                        if stop.is_set(): break
                        br = step/12
                        with self._lock:
                            self.fill_panel(panel, int(r*br*0.5), int(g*br*0.5), int(b*br*0.5))
                            self._show()
                        time.sleep(0.025)
                    with self._lock:
                        self.restore_panel_base(panel)
                        self._show()
                    time.sleep(0.05)
            self.animate(_run)

        elif phase == 'MINGLING':
            # Each active panel randomly twinkles its stars
            def _run(stop):
                import random
                for _ in range(120):
                    if stop.is_set(): break
                    active = [i for i, c in enumerate(self._base) if any(v > 15 for v in c)]
                    if active:
                        idx = random.choice(active)
                        r, g, b = self._base[idx]
                        with self._lock:
                            self._pixels[idx] = (255, 255, 255)
                            self._show()
                        time.sleep(0.05)
                        with self._lock:
                            self._pixels[idx] = (r, g, b)
                            self._show()
                    time.sleep(0.08)
                self.restore_base()
            self.animate(_run)

        elif phase == 'AFTERPARTY':
            # AURORA: full rainbow wave sweeps across all 8 panels (64x32 grid)
            FULL_W = PANEL_W * 4   # 64
            FULL_H = PANEL_H * 2   # 32
            def _run(stop):
                for cycle in range(4):
                    if stop.is_set(): break
                    for offset in range(FULL_W):
                        if stop.is_set(): break
                        with self._lock:
                            for gy in range(FULL_H):
                                for gx in range(FULL_W):
                                    hue = ((gx + gy//2 + offset) % FULL_W) / FULL_W
                                    cr, cg, cb = [int(c*220) for c in colorsys.hsv_to_rgb(hue, 0.75, 1.0)]
                                    self._pixels[global_xy(gx, gy)] = (cr, cg, cb)
                            self._show()
                        time.sleep(0.03)
                self.restore_base()
            self.animate(_run)

    def speech_highlight(self, panel, r, g, b):
        """During speeches — light up the speaking subteam's panel brighter."""
        def _run(stop):
            # Gentle pulse 3 times on top of base
            for _ in range(3):
                if stop.is_set(): break
                for step in range(20):
                    if stop.is_set(): break
                    br = step/20
                    with self._lock:
                        self.fill_panel(panel, int(r*br*0.3), int(g*br*0.3), int(b*br*0.3))
                        # Keep star pixels bright
                        base_slice = self._base[panel*PANEL_SIZE:(panel+1)*PANEL_SIZE]
                        for i, (br2, bg2, bb2) in enumerate(base_slice):
                            if any(v > 15 for v in (br2, bg2, bb2)):
                                self._pixels[panel*PANEL_SIZE+i] = (br2, bg2, bb2)
                        self._show()
                    time.sleep(0.04)
                for step in range(20, 0, -1):
                    if stop.is_set(): break
                    br = step/20
                    with self._lock:
                        self.fill_panel(panel, int(r*br*0.3), int(g*br*0.3), int(b*br*0.3))
                        base_slice = self._base[panel*PANEL_SIZE:(panel+1)*PANEL_SIZE]
                        for i, (br2, bg2, bb2) in enumerate(base_slice):
                            if any(v > 15 for v in (br2, bg2, bb2)):
                                self._pixels[panel*PANEL_SIZE+i] = (br2, bg2, bb2)
                        self._show()
                    time.sleep(0.04)
            with self._lock:
                self.restore_panel_base(panel)
                self._show()
        self.animate(_run)

    def finale(self):
        """Terminal solved — constellation panels light up one by one then full aurora."""
        print("[LED] ★★★ MIDNIGHT ECLIPSE COMPLETE ★★★")
        snapshot = list(self._base)

        def _run(stop):
            # Blackout
            with self._lock:
                self._pixels = [(0,0,0)] * LED_COUNT
                self._show()
            time.sleep(0.8)

            # Each panel ignites one by one
            for panel in range(PANEL_COUNT):
                if stop.is_set(): break
                name = PANEL_CONSTELLATIONS[panel]
                base_slice = snapshot[panel*PANEL_SIZE:(panel+1)*PANEL_SIZE]
                bright = [(i, c) for i, c in enumerate(base_slice) if any(v > 10 for v in c)]

                # Panel flash white
                with self._lock:
                    self.fill_panel(panel, 255, 255, 255)
                    self._show()
                time.sleep(0.15)
                with self._lock:
                    self.fill_panel(panel, 0, 0, 0)
                    self._show()
                time.sleep(0.05)

                # Constellation pixels light up
                for i, (r, g, b) in bright:
                    if stop.is_set(): break
                    with self._lock:
                        self._pixels[panel*PANEL_SIZE + i] = (r, g, b)
                        self._show()
                    time.sleep(0.008)

                time.sleep(0.3)

            time.sleep(0.5)
            if stop.is_set(): return

            # All panels pulse together 6 times
            for pulse in range(6):
                if stop.is_set(): break
                for step in range(20):
                    if stop.is_set(): break
                    br = 0.7 + step/30
                    with self._lock:
                        for i, (r, g, b) in enumerate(snapshot):
                            if not any([r,g,b]):
                                r, g, b = 40, 40, 100
                            self._pixels[i] = (min(255,int(r*br)), min(255,int(g*br)), min(255,int(b*br)))
                        self._show()
                    time.sleep(0.02)
                for step in range(20, 5, -1):
                    if stop.is_set(): break
                    br = step/20
                    with self._lock:
                        for i, (r, g, b) in enumerate(snapshot):
                            if not any([r,g,b]):
                                r, g, b = 40, 40, 100
                            self._pixels[i] = (int(r*br), int(g*br), int(b*br))
                        self._show()
                    time.sleep(0.02)

            # Final: steady max brightness
            with self._lock:
                for i, (r, g, b) in enumerate(snapshot):
                    self._pixels[i] = (r or 40, g or 40, b or 100)
                self._show()
        self.animate(_run)

    def test_sequence(self, const_data):
        """Test mode — draw each constellation panel one by one."""
        def _run(stop):
            with self._lock:
                self._pixels = [(0,0,0)] * LED_COUNT
                self._show()
            time.sleep(0.4)

            for panel, name in enumerate(PANEL_CONSTELLATIONS):
                if stop.is_set(): break
                cdata = const_data.get(name)
                if not cdata:
                    continue
                r, g, b = cdata['color']
                stars = [tuple(s) for s in cdata['stars']]
                lines = [[tuple(p) for p in seg] for seg in cdata['lines']]

                # Stars on
                with self._lock:
                    for (sx, sy) in stars:
                        self.set_panel_xy(panel, sx, sy, r, g, b)
                    self._show()
                time.sleep(0.2)

                # Lines draw
                for seg in lines:
                    for (px, py) in line_pixels(*seg[0], *seg[1]):
                        if stop.is_set(): break
                        with self._lock:
                            self.set_panel_xy(panel, px, py, int(r*0.6), int(g*0.6), int(b*0.6))
                            self._show()
                        time.sleep(0.04)
                time.sleep(0.3)

            time.sleep(1)
            # Fade all off
            for step in range(15, 0, -1):
                if stop.is_set(): break
                br = step/15
                with self._lock:
                    self._pixels = [(int(c[0]*br), int(c[1]*br), int(c[2]*br)) for c in self._pixels]
                    self._show()
                time.sleep(0.06)
            with self._lock:
                self._pixels = [(0,0,0)] * LED_COUNT
                self._show()
        self.animate(_run)


# ─── Socket.IO Client ─────────────────────────────────────────────────────────

def run(server_url, password, brightness):
    matrix = MatrixController(brightness=brightness)
    sio = socketio.Client(reconnection=True, reconnection_delay=3)
    led_map = {}
    const_pixels = {}

    def load_local_map():
        try:
            p = os.path.join(os.path.dirname(__file__), '..', 'data', 'led_map.json')
            with open(p) as f:
                return json.load(f)
        except Exception as e:
            print(f"[Pi] Warning: could not load led_map.json: {e}")
            return {}

    def get_panel(const_name):
        return constellation_panel(const_name)

    print(f"[Pi] Connecting to {server_url} ...")

    @sio.event
    def connect():
        sio.emit('pi_auth', {'password': password})

    @sio.event
    def disconnect():
        print("[Pi] Disconnected — retrying...")

    @sio.on('pi_auth_fail')
    def on_auth_fail():
        print("[Pi] Wrong password"); sys.exit(1)

    @sio.on('pi_ready')
    def on_ready(data):
        nonlocal led_map, const_pixels
        led_map = data.get('ledStates', {})
        cgroups = data.get('constellationGroups', {})
        print(f"[Pi] Authenticated — {len(led_map)} cards, {PANEL_COUNT} panels")

        lm = load_local_map()
        cpix = lm.get('constellationPixels', {})
        for name, pdata in cpix.items():
            color = cgroups.get(name, {}).get('color', [255,255,255])
            const_pixels[name] = {
                'stars': pdata['stars'],
                'lines': pdata['lines'],
                'color': color,
            }

        # Restore online cards
        online_count = 0
        for card_id, info in led_map.items():
            if not info.get('online'): continue
            const = info.get('constellation')
            panel = get_panel(const)
            cdata = const_pixels.get(const)
            if panel is None or not cdata: continue
            si = info.get('starIndex', 0)
            if si < len(cdata['stars']):
                sx, sy = cdata['stars'][si]
                r, g, b = cdata['color']
                matrix.set_base_panel_xy(panel, sx, sy, int(r*0.35), int(g*0.35), int(b*0.35))
                online_count += 1
        matrix.show()
        print(f"[Pi] Restored {online_count} online card nodes")

    @sio.on('pi_full_state')
    def on_full_state(data): on_ready(data)

    @sio.on('led_card_online')
    def on_card_online(data):
        card_id = data.get('cardId')
        const = data.get('constellation')
        r, g, b = data.get('color', [255,255,255])
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        si = led_map.get(card_id, {}).get('starIndex', 0)
        if si < len(cdata['stars']):
            sx, sy = cdata['stars'][si]
            matrix.star_online(panel, sx, sy, r, g, b)

    @sio.on('led_constellation_partial')
    def on_partial(data):
        const = data.get('constellation')
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        r, g, b = cdata['color']
        online_stars = []
        for cid, info in led_map.items():
            if info.get('constellation') == const and info.get('online'):
                si = info.get('starIndex', 0)
                if si < len(cdata['stars']):
                    online_stars.append(tuple(cdata['stars'][si]))
        if online_stars:
            matrix.constellation_partial(panel, online_stars, r, g, b)

    @sio.on('led_constellation_full')
    def on_full(data):
        const = data.get('constellation')
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        r, g, b = cdata['color']
        stars = [tuple(s) for s in cdata['stars']]
        lines = [[tuple(p) for p in seg] for seg in cdata['lines']]
        matrix.constellation_full(panel, stars, lines, r, g, b)

    @sio.on('led_pair_interaction')
    def on_pair(data):
        ra, ga, ba = data.get('colorA', [255,255,255])
        rb, gb, bb = data.get('colorB', [255,255,255])
        rare = data.get('rare', False)
        const_a = next((n for n,c in const_pixels.items() if c['color']==[ra,ga,ba]), None)
        const_b = next((n for n,c in const_pixels.items() if c['color']==[rb,gb,bb]), None)
        panel_a = get_panel(const_a) if const_a else None
        panel_b = get_panel(const_b) if const_b else None
        stars_a = [tuple(s) for s in const_pixels[const_a]['stars']] if const_a else []
        stars_b = [tuple(s) for s in const_pixels[const_b]['stars']] if const_b else []
        if panel_a is not None and panel_b is not None:
            matrix.pair_flash(panel_a, stars_a, (ra,ga,ba), panel_b, stars_b, (rb,gb,bb), rare=rare)

    @sio.on('led_award')
    def on_award(data):
        const = data.get('constellation')
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        r, g, b = cdata['color']
        stars = [tuple(s) for s in cdata['stars']]
        lines = [[tuple(p) for p in seg] for seg in cdata['lines']]
        winner_card = data.get('winnerCardId')
        winner_star = stars[0]
        if winner_card and winner_card in led_map:
            si = led_map[winner_card].get('starIndex', 0)
            if si < len(stars): winner_star = stars[si]
        matrix.award_flash(panel, winner_star, stars, lines, r, g, b)

    @sio.on('led_phase_change')
    def on_phase(data):
        matrix.phase_transition(data.get('phase',''))

    @sio.on('led_speech_team')
    def on_speech_team(data):
        # Highlight a specific subteam's panel during their speech
        const = data.get('constellation')
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        r, g, b = cdata['color']
        matrix.speech_highlight(panel, r, g, b)

    @sio.on('led_finale')
    def on_finale(_=None): matrix.finale()

    @sio.on('led_test')
    def on_test(_=None): matrix.test_sequence(const_pixels)

    @sio.on('led_all_off')
    def on_off(_=None): matrix.all_off()

    @sio.on('led_brightness')
    def on_brightness(data): matrix.set_brightness(data.get('brightness', 100))

    @sio.on('led_constellation')
    def on_const_cmd(data):
        const = data.get('constellation')
        mode  = data.get('mode', 'pulse')
        panel = get_panel(const)
        cdata = const_pixels.get(const)
        if panel is None or not cdata: return
        r, g, b = cdata['color']
        stars = [tuple(s) for s in cdata['stars']]
        lines = [[tuple(p) for p in seg] for seg in cdata['lines']]
        if mode == 'pulse':
            matrix.constellation_partial(panel, stars, r, g, b)
        elif mode == 'glow':
            matrix.constellation_full(panel, stars, lines, r, g, b)
        elif mode == 'off':
            for y in range(PANEL_H):
                for x in range(PANEL_W):
                    matrix.set_base_panel_xy(panel, x, y, 0, 0, 0)
            matrix.show()

    sio.connect(server_url)
    print("[Pi] 8-panel matrix ready. Ctrl+C to stop.")
    try:
        sio.wait()
    except KeyboardInterrupt:
        matrix.all_off()
        print("\n[Pi] Shutdown — all panels off")
        sio.disconnect()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Midnight Eclipse — Pi 8-Panel Matrix')
    p.add_argument('--server',     default='http://localhost:3000')
    p.add_argument('--password',   default='claws2025')
    p.add_argument('--brightness', type=int, default=100)
    args = p.parse_args()
    run(args.server, args.password, args.brightness)
