#!/usr/bin/env python3
"""Synthesises every sound of the app into src/audio/*.mp3 (no external samples, so no licensing issues).
Music loops are rendered periodic (tails folded back to the start) with 0.5 s of extra periodic
audio, so the player can loop an exact window [0.15, 0.15+L] sample-accurately even through MP3 padding."""
import numpy as np, subprocess, pathlib, json, sys
from scipy import signal
SR = 44100
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "audio"; OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
def T(d): return np.arange(int(SR * d)) / SR
def noise(d): return rng.uniform(-1, 1, int(SR * d))
def filt(x, kind, fc, order=2):
    b, a = signal.butter(order, np.array(fc, dtype=float) / (SR / 2), kind); return signal.lfilter(b, a, x)
def dec(d, tau): return np.exp(-T(d) / tau)
def ar(d, a=0.01, r=0.05):
    n = int(SR * d); e = np.ones(n); na, nr = max(1, int(SR * a)), max(1, int(SR * r))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def sweep(f0, f1, d, exp=True):
    t = T(d); f = f0 * (f1 / f0) ** (t / d) if exp else f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def tri(f, d): return signal.sawtooth(2 * np.pi * f * T(d), 0.5)
def saw(f, d, vib=0.0):
    t = T(d); ph = 2 * np.pi * f * t + (vib * np.sin(2 * np.pi * 5.5 * t) if vib else 0); return signal.sawtooth(ph)
def brass(f, d, cut=1500, vib=0.25): return filt(saw(f, d, vib) + 0.5 * saw(f * 1.004, d, vib), "low", cut) * ar(d, 0.035, min(0.12, d / 3))
def pluck(f, d, tau=0.25):
    t = T(d); return (np.sin(2*np.pi*f*t) + 0.45*np.sin(4*np.pi*f*t)*np.exp(-t/0.08) + 0.2*np.sin(6*np.pi*f*t)*np.exp(-t/0.04)) * np.exp(-t/tau) * ar(d, 0.003, 0.02)
def pad(f, d, a=0.7, r=0.9):
    t = T(d); return (np.sin(2*np.pi*f*t) + 0.5*np.sin(2*np.pi*f*1.006*t) + 0.25*tri(f*2.002, d)) * ar(d, a, r) * (0.85 + 0.15*np.sin(2*np.pi*0.6*t))
def bell(f, d, tau=0.6):
    t = T(d); return (np.sin(2*np.pi*f*t) + 0.5*np.sin(2*np.pi*f*2.76*t)*np.exp(-t/0.15) + 0.25*np.sin(2*np.pi*f*5.4*t)*np.exp(-t/0.06)) * np.exp(-t/tau) * ar(d, 0.002, 0.03)
def thump(f0, f1, d, tau): return np.tanh(2.2 * sweep(f0, f1, d) * dec(d, tau))
def reverb(x, mix=0.25, fb=0.72, tail=1.5):
    x = np.concatenate([x, np.zeros(int(SR * tail))]); y = np.zeros_like(x)
    for dl in (0.0297, 0.0371, 0.0411, 0.0437, 0.0533):
        n = int(SR * dl); a = np.zeros(n + 1); a[0] = 1; a[n] = -fb; y += signal.lfilter([1], a, x)
    return x + mix * filt(y, "low", 4500) / 5
class Buf:
    def __init__(s, d): s.x = np.zeros(int(SR * d))
    def add(s, at, sig, g=1.0):
        i = int(SR * at); n = min(len(sig), len(s.x) - i)
        if n > 0: s.x[i:i + n] += g * sig[:n]
def norm(x, peak=0.93): return x / (np.max(np.abs(x)) + 1e-9) * peak
def save(name, x, br="64k"):
    x = np.clip(x, -1, 1); raw = (x * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", br, str(OUT / f"{name}.mp3")], input=raw, check=True)
def loop(name, L, render, br="80k", peak=0.8):
    """render(buf) draws into a buffer of L+4 s; the tail is folded back so the result is L-periodic."""
    b = Buf(L + 4); render(b); x = reverb(b.x, 0.3, 0.74, 2.0); n = int(SR * L)
    per = np.zeros(n)
    for k in range(0, len(x), n): seg = x[k:k + n]; per[:len(seg)] += seg
    per = norm(per, peak); save(name, np.concatenate([per, per[:int(SR * 0.5)]]), br); META[name] = {"loop": L}
META = {}
N = lambda semis, base=440.0: base * 2 ** (semis / 12)   # semitones from A4

# ---------- shared UI / bomb ----------
def tick(f):
    d = 0.09; return norm(filt(noise(d), "band", [1800, 7000]) * dec(d, 0.004) * 0.9 + np.sin(2*np.pi*f*T(d)) * dec(d, 0.012) * 0.6 + np.sin(2*np.pi*f/2*T(d)) * dec(d, 0.02) * 0.35, 0.8)
save("tick", tick(2500)); save("tock", tick(1850))
b = Buf(0.55); b.add(0, thump(130, 52, 0.22, 0.07)); b.add(0.2, thump(110, 48, 0.25, 0.08), 0.75)
save("heartbeat", norm(filt(b.x, "low", 900), 0.95))
b = Buf(0.9); b.add(0, sweep(280, 880, 0.26) * ar(0.26, 0.02, 0.05), 0.5); b.add(0.24, (tri(523.25, 0.5) + tri(783.99, 0.5) + 0.6 * tri(1046.5, 0.5)) * dec(0.5, 0.16), 0.5)
save("round_start", norm(reverb(b.x, 0.2, 0.6, 0.4), 0.85))
b = Buf(0.4); b.add(0, tri(659.25, 0.1) * ar(0.1, 0.005, 0.04)); b.add(0.09, tri(987.77, 0.22) * dec(0.22, 0.08))
save("begin", norm(b.x, 0.8))
d = 0.26; w = filt(noise(d), "band", [900, 5000]) * np.sin(np.pi * T(d) / d) ** 2
b = Buf(0.36); b.add(0, w, 0.5); b.add(0.1, sweep(480, 940, 0.11) * ar(0.11, 0.005, 0.05), 0.8)
save("turn", norm(b.x, 0.8))
d = 0.4; w = filt(noise(d) * np.sin(np.pi * T(d) / d) ** 1.5, "band", [500, 3500])
b = Buf(0.6); b.add(0, w, 0.7); b.add(0.12, tri(784, 0.09) * ar(0.09, 0.004, 0.04), 0.6); b.add(0.22, tri(523.25, 0.2) * dec(0.2, 0.07), 0.6)
save("skip", norm(b.x, 0.8))
d = 0.36; save("pass", norm(filt(noise(d) * np.sin(np.pi * T(d) / d) ** 2, "band", [700, 4200]) * (0.6 + 0.4 * sweep(2, 9, d)), 0.6))
def explosion(big=False):
    d = 3.2 if big else 2.6; n = noise(d)
    x = (filt(n, "high", 2500) * dec(d, 0.09) * 0.9 + filt(n, "band", [300, 2500]) * dec(d, 0.38 if big else 0.3) * 1.3 +
         filt(n, "low", 300, 3) * dec(d, 0.8 if big else 0.6) * 2.2 + sweep(140, 30, d) * dec(d, 0.55) * 1.6 + sweep(260, 70, d) * dec(d, 0.22) * 0.8)
    x[:int(SR * 0.006)] += noise(0.006) * 2
    deb = np.zeros_like(x); idx = rng.integers(int(SR * 0.25), int(SR * (d - 0.8)), 70); deb[idx] = rng.uniform(-1, 1, 70)
    x += filt(deb, "band", [900, 5000]) * 3 * dec(d, 0.9)
    return norm(np.tanh(2.8 * reverb(np.tanh(3.5 * norm(x, 1)), 0.35, 0.8, 1.2) ), 0.98)
save("explosion", explosion(False), "96k"); save("explosion_big", explosion(True), "96k")
b = Buf(2.2)
for i, (s, dd) in enumerate([(-11, 0.38), (-12, 0.38), (-13, 0.38), (-14, 0.95)]): b.add(i * 0.4, brass(N(s), dd, 1100, 0.5 if i == 3 else 0.2), 0.8)
save("lose", norm(reverb(b.x, 0.2, 0.65, 0.6), 0.85))
def fanfare(notes, cut=2200):
    b = Buf(sum(d for _, d in notes) + 0.3); at = 0
    for s, dd in notes:
        if s is not None:
            for h, g in ((0, 1), (-5, 0.45), (-12, 0.5)): b.add(at, brass(N(s + h), dd * 0.96, cut), g)
        at += dd
    return norm(reverb(b.x, 0.22, 0.68, 0.9), 0.88)
save("win", fanfare([(3, .16), (3, .16), (3, .16), (7, .34), (10, .3), (7, .16), (15, .95)]), "80k")
save("evil", fanfare([(-9, .3), (-10, .3), (-9, .3), (-15, .3), (-14, 1.2)], 1300), "80k")

# ---------- village ----------
d = 0.7; sw = filt(noise(d), "high", 3000) * (T(d) / d) ** 3
b = Buf(2.0); b.add(0, sw, 0.5)
for f, g in ((146.83, 1), (220, 0.7), (349.23, 0.5), (587.33, 0.3)): b.add(0.68, bell(f, 1.3, 0.5), g)
b.add(0.68, thump(120, 50, 0.3, 0.09), 0.7)
save("reveal", norm(reverb(b.x, 0.3, 0.75, 0.8), 0.88), "80k")
b = Buf(0.4); b.add(0, thump(190, 70, 0.16, 0.045)); b.add(0, filt(noise(0.05), "high", 2500) * dec(0.05, 0.008), 0.5); b.add(0.03, filt(noise(0.2), "band", [1500, 6000]) * dec(0.2, 0.05), 0.12)
save("vote", norm(b.x, 0.85))
roll = 2.4; b = Buf(roll + 1.4); at = 0.0
while at < roll:
    p = at / roll; g = 0.25 + 0.75 * p ** 1.5
    b.add(at, (filt(noise(0.07), "band", [900, 6000]) * dec(0.07, 0.018) + 0.6 * np.sin(2*np.pi*190*T(0.07)) * dec(0.07, 0.02)) * g * rng.uniform(0.8, 1), 0.7)
    at += 1 / (15 + 16 * p)
b.add(roll, thump(150, 45, 0.5, 0.14), 1.3); b.add(roll, filt(noise(1.3), "high", 3500) * dec(1.3, 0.35), 0.8)
save("drumroll", norm(reverb(b.x, 0.18, 0.6, 0.4), 0.9), "80k"); META["drumroll"] = {"hit": roll}
b = Buf(1.9); b.add(0, thump(140, 38, 0.6, 0.16), 1.4); b.add(0, filt(noise(0.12), "band", [200, 3000]) * dec(0.12, 0.03), 0.9)
for s in (-33, -18, -15): b.add(0.05, brass(N(s), 1.6, 800, 0.15) * dec(1.6, 0.6), 0.5)
save("eliminate", norm(reverb(b.x, 0.3, 0.75, 0.9), 0.9), "80k")
b = Buf(0.7); b.add(0, tri(392, 0.16) * ar(0.16, 0.01, 0.06)); b.add(0.22, tri(392, 0.3) * dec(0.3, 0.12))
save("tie", norm(b.x, 0.7))

# ---------- music loops ----------
def tension(b):                                   # 120 bpm, 16 beats = 8 s, D minor
    q = 0.5
    for i in range(32):                           # pulsing bass eighths
        f = 73.42 if (i // 8) % 2 == 0 else 69.30
        b.add(i * q / 2, filt(saw(f, 0.2) + 0.7 * saw(f * 2, 0.2), "low", 500) * dec(0.2, 0.07), 0.55 if i % 2 == 0 else 0.33)
    for i, s in enumerate([5, 8, 7, 5, 5, 8, 7, 4] * 4):   # ostinato D5 F5 E5 D5 ..
        b.add(i * q / 2 + q / 4, pluck(N(s), 0.22, 0.09), 0.12)
    for k, (ch) in enumerate([(-19, -12, -4), (-20, -12, -5)]):
        for s in ch: b.add(k * 4, pad(N(s), 4.1, 1.2, 1.2), 0.07)
    for at in (0, 4): b.add(at, thump(110, 40, 0.5, 0.15), 0.5)
    for i in range(16): b.add(i * q, filt(noise(0.03), "high", 6000) * dec(0.03, 0.006), 0.06)
loop("tension", 8.0, tension)
def cinematic(b):                                 # 100 bpm, 16 beats = 9.6 s
    q = 0.6; L = 9.6; t = T(L)
    dr = filt(saw(36.71, L) + saw(73.42 * 1.003, L) + 0.6 * saw(110, L), "low", 420) * (0.6 + 0.4 * np.sin(2 * np.pi * t / L * 2 - 1.2))
    b.add(0, dr * ar(L, 0.4, 0.4), 0.22)
    for at in (0, 8 * q):                         # "braam" hits
        for f in (73.42, 77.78, 146.83, 220): b.add(at, brass(f, 2.6, 900, 0.1) * dec(2.6, 0.9), 0.28)
        b.add(at, thump(120, 35, 0.8, 0.22), 0.9)
    for at in (6.5, 7, 7.5, 14, 14.5, 15, 15.5): b.add(at * q, thump(100, 55, 0.3, 0.09), 0.3 + 0.03 * at)
    tr = (np.sin(2*np.pi*440*t) + np.sin(2*np.pi*466.16*t) + 0.5*np.sin(2*np.pi*880*t)) * (0.5 + 0.5 * signal.square(2*np.pi*11*t)) * (t / L) ** 2
    b.add(0, filt(tr, "low", 3000) * ar(L, 0.3, 0.25), 0.1)
    for i in range(32): b.add(i * q / 2, filt(noise(0.03), "high", 7000) * dec(0.03, 0.005), 0.05)
loop("cinematic", 9.6, cinematic)
def mystery(b):                                   # 80 bpm, 16 beats = 12 s : Am | F | Dm | E
    q = 0.75; bars = [(-12, -9, -5), (-16, -12, -9), (-19, -16, -12), (-17, -13, -10)]
    for k, ch in enumerate(bars):
        for s in ch: b.add(k * 3, pad(N(s), 3.3, 1.0, 1.1), 0.1)
        b.add(k * 3, pad(N(ch[0] - 12), 3.0, 0.3, 1.0), 0.16)
        arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[1]]
        for i, s in enumerate(arp): b.add(k * 3 + i * q / 2, pluck(N(s), 0.5, 0.2), 0.16)
    for at, s in ((1.5, 12), (2.25, 11), (4.5, 8), (7.5, 5), (8.25, 7), (9.0, 8), (10.5, 11), (11.25, 8)):
        b.add(at, bell(N(s), 1.4, 0.5), 0.07)
loop("mystery", 12.0, mystery)

(OUT / "meta.json").write_text(json.dumps(META))
for f in sorted(OUT.glob("*.mp3")): print(f"{f.name:20s} {f.stat().st_size:7d}")
print("total", sum(f.stat().st_size for f in OUT.glob('*.mp3')))
