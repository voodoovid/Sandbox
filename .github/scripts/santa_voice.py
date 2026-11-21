#!/usr/bin/env python3
"""Make Santa voicemail greetings with Kokoro TTS.

For each voice: a full-quality MP3 to preview, and an 8 kHz 16-bit mono WAV
that VoIP.ms accepts as an uploaded voicemail greeting.
"""
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2] / "santa"
TEXT = (ROOT / "greeting.txt").read_text().strip()
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

# (file name, Kokoro voice, language code, speed, pitch factor)
TAKES = [
    ("santa-a", "am_michael", "a", 0.88, 0.90),
    ("santa-b", "am_onyx", "a", 0.88, 0.92),
    ("santa-c", "bm_george", "b", 0.88, 0.90),
]
SR = 24000
pipes = {}

for name, voice, lang, speed, pitch in TAKES:
    pipe = pipes.setdefault(lang, KPipeline(lang_code=lang))
    parts = [np.asarray(a) for _, _, a in pipe(TEXT, voice=voice, speed=speed)]
    raw = OUT / f"{name}-raw.wav"
    sf.write(raw, np.concatenate(parts), SR)

    # Lower the pitch while keeping the pace, add a touch of warmth and room,
    # and even out the loudness.
    fx = (
        f"asetrate={int(SR * pitch)},aresample={SR},atempo={1 / pitch:.4f},"
        "bass=g=4:f=120,aecho=0.8:0.6:40:0.12,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    pad = "adelay=300,apad=pad_dur=0.6"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                    "-af", f"{fx},{pad}", "-ar", "44100", "-b:a", "160k",
                    str(OUT / f"{name}.mp3")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                    "-af", f"{fx},{pad}", "-ar", "8000", "-ac", "1",
                    "-c:a", "pcm_s16le", str(OUT / f"{name}-voipms.wav")],
                   check=True)
    raw.unlink()
    print("made", name, voice)
