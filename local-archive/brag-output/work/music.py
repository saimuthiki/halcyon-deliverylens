"""Soundtrack for the DeliveryLens brag video: 120 BPM, D major (D-A-Bm-G), 21.5 s, one beat grid from frame 0.
Music and effects are written together: cut whooshes, bar 'ticks' and the counter riser use the same key and grid."""
import wave
import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM          # 0.5 s
DUR = 21.5
N = int(DUR * SR)
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)          # dry bus
VL = np.zeros(N); VR = np.zeros(N)        # reverb send


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# chords per bar (2 s): D, A, Bm, G ; final bar D
CHORDS = {0: [62, 66, 69], 1: [57, 61, 64], 2: [59, 62, 66], 3: [55, 59, 62]}
ROOT = {0: 38, 1: 33, 2: 35, 3: 31}       # D2, A1, B1, G1
def bar_of(t):
    b = int(t // (4 * BEAT))
    return 0 if t >= 20.0 else b % 4


def add(sig, t, gl=1.0, gr=1.0, send=0.0):
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gl; R[i:i + len(sig)] += sig * gr
    if send:
        VL[i:i + len(sig)] += sig * gl * send; VR[i:i + len(sig)] += sig * gr * send


def env(n, a, d):
    """attack seconds, exponential decay time constant seconds"""
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def tone(f, length, harmonics=(1.0,), detune=0.0):
    t = np.arange(int(length * SR)) / SR
    out = np.zeros_like(t)
    for k, amp in enumerate(harmonics, 1):
        out += amp * np.sin(2 * np.pi * f * k * t)
        if detune:
            out += amp * np.sin(2 * np.pi * f * k * (1 + detune) * t)
    return out


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


# ---- drums -------------------------------------------------------------
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 85 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * 0.9 + rng.standard_normal(n) * np.exp(-t / 0.004) * 0.08

def clap():
    n = int(0.3 * SR); x = rng.standard_normal(n)
    x = x - lowpass(x, 900)              # take out the low end
    x = lowpass(x, 5000)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        e += np.roll(env(n, 0.001, 0.012), int(off * SR)) * 0.6
    e += np.roll(env(n, 0.001, 0.09), int(0.03 * SR))
    return x * e * 0.22

def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR); x = rng.standard_normal(n)
    x = x - lowpass(x, 7000)
    return x * env(n, 0.0005, 0.07 if open_ else 0.018) * 0.12

K, C, H, HO = kick(), clap(), hat(), hat(True)


# ---- tonal parts ------------------------------------------------------
def pluck(f, length=0.35, vol=0.1):
    return tone(f, length, (1, 0.45, 0.2, 0.08)) * env(int(length * SR), 0.002, 0.09) * vol

def bass_note(f, length):
    s = tone(f, length, (1, 0.5, 0.3, 0.15, 0.08)) * env(int(length * SR), 0.004, 0.16)
    return np.tanh(s * 1.4) * 0.30

def pad(chord, length, vol=0.055):
    n = int(length * SR); s = np.zeros(n)
    for m in chord:
        s += tone(midi(m - 12), length, (1, 0.3, 0.1), detune=0.004)
    e = np.minimum(1, np.arange(n) / (0.25 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.3 * SR))
    return s * e * vol

def whoosh(length=0.45, vol=0.09):
    n = int(length * SR); x = rng.standard_normal(n)
    x = x - lowpass(x, 600); x = lowpass(x, 3500)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * shape * vol

def impact():
    n = int(1.6 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t / 0.08)) * t) * np.exp(-t / 0.45)
    hiss = lowpass(rng.standard_normal(n), 2500) * np.exp(-t / 0.25) * 0.25
    return (boom * 0.7 + hiss) * 0.8


FULL_FROM, FULL_TO = 3.5, 20.0   # groove from the reveal to the sign-off

# impact on frame 0 (the $680K slam) and the hook's sparse bed
add(impact(), 0.0, send=0.25)
add(pad(CHORDS[0], 2.0, 0.045), 0.0, send=0.5)
add(pad(CHORDS[1], 1.5, 0.045), 2.0, send=0.5)
for i, t in enumerate(np.arange(1.0, 3.5, BEAT)):
    add(K * (0.55 if t < 2.5 else 0.7), t)
# teal strike on beat 5 (2.5 s): a soft rising pluck pair
add(pluck(midi(69 + 12), 0.4, 0.07), 2.5, 0.8, 1.0, send=0.4)
add(pluck(midi(73 + 12), 0.4, 0.07), 2.75, 1.0, 0.8, send=0.4)
# riser into the reveal
n = int(1.0 * SR); r = rng.standard_normal(n); r = r - lowpass(r, 1200)
add(lowpass(r, 6000) * np.linspace(0, 1, n) ** 2 * 0.07, 2.5, send=0.3)

beats = np.arange(0, DUR, BEAT)
for t in beats:
    if not (FULL_FROM <= t < FULL_TO):
        continue
    b = bar_of(t); pos = round(t / BEAT) % 4
    add(K, t)
    if pos in (1, 3):
        add(C, t, 0.9, 1.0, send=0.25)
    add(H, t + BEAT / 2, 0.7, 1.0)
    if pos == 3:
        add(HO * 0.7, t + BEAT / 2, 1.0, 0.7)
    for half in (0, 0.5):           # bass on 8ths
        add(bass_note(midi(ROOT[b] + (12 if half and pos % 2 else 0)), 0.24), t + half * BEAT)

# pad per bar through the groove, final D chord rings out
for bt in np.arange(4.0, 20.0, 2.0):
    add(pad(CHORDS[bar_of(bt)], 2.05), bt, send=0.6)
add(pad(CHORDS[1], 0.55), 3.5, send=0.6)
add(pad([62, 66, 69, 74], 1.5, 0.06), 20.0, send=0.8)

# plucked 16th arpeggio (quiet texture, ping-pong)
for i, t in enumerate(np.arange(3.5, 20.0, BEAT / 4)):
    ch = CHORDS[bar_of(t)]
    note = ch[[0, 1, 2, 1][i % 4]] + 12
    add(pluck(midi(note), 0.25, 0.035), t, 1.0 if i % 2 else 0.55, 0.55 if i % 2 else 1.0, send=0.35)

# cut whooshes, landing on each cut
for cut in (3.5, 6.0, 10.0, 14.5, 18.0):
    add(whoosh(), cut - 0.38, send=0.4)
    add(HO * 0.9, cut)

# in-key ticks: bars growing (6.5 + i/2) and trace cards landing (10.5 + i/2), stepping up D major
scale = [74, 76, 78, 79, 81, 83, 85, 86]
for i in range(6):
    add(pluck(midi(scale[i] + 12), 0.3, 0.035), 6.5 + i * BEAT, send=0.5)
for i in range(7):
    add(pluck(midi(scale[i] + 12), 0.3, 0.03), 10.5 + i * BEAT, send=0.5)
# carrier cards (14.6, 15.0) and the strike (15.5)
add(pluck(midi(69 + 12), 0.4, 0.04), 14.5, send=0.5)
add(pluck(midi(74 + 12), 0.4, 0.045), 15.0, send=0.5)
# counter 71 -> 90 (18.5-19.5): rising 16ths, then the sign-off hit at 20.0
for i, t in enumerate(np.arange(18.5, 19.5, BEAT / 4)):
    add(pluck(midi(scale[i % 8] + 12 * (i // 8)), 0.2, 0.03), t, send=0.4)
add(K, 20.0); add(impact() * 0.45, 20.0, send=0.5)
add(pluck(midi(86), 1.2, 0.06), 20.0, send=0.8)

# ---- reverb (FFT convolution with decaying noise) and master ------------
ir_n = int(1.4 * SR); tt = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-tt / 0.35); irR = rng.standard_normal(ir_n) * np.exp(-tt / 0.35)
irL = lowpass(irL, 5000); irR = lowpass(irR, 5000)
def conv(x, ir):
    m = len(x) + len(ir)
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
wetL, wetR = conv(VL, irL), conv(VR, irR)
wet_scale = 0.18 / (np.abs(np.concatenate([wetL, wetR])).max() + 1e-9) * np.abs(np.concatenate([VL, VR])).max()
L += wetL * wet_scale; R += wetR * wet_scale

mix = np.stack([L, R], axis=1)
fade = np.ones(N); fn = int(0.4 * SR); fade[-fn:] = np.linspace(1, 0, fn)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1)
mix *= 0.89 / np.abs(mix).max()     # about -1 dBFS peak
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('music.wav', DUR, 's')
