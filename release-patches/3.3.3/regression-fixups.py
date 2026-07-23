from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:140]!r}")
    write(path, source.replace(old, new, 1))


# Preserve the 3.3.0 waveform regression contract while delegating final shaping
# to the shared 3.3.3 implementation.
replace_once(
    "client/src/components/SecureMessagePane.jsx",
    'const BASE_REACTIONS = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];\nconst PLUS_REACTIONS = ["✨", "💜", "⚡", "🫡", "🤝", "🚀"];',
    '''const BASE_REACTIONS = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];
const PLUS_REACTIONS = ["✨", "💜", "⚡", "🫡", "🤝", "🚀"];

function normalizeWaveform(values, target = 48) {
  const source = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
  const sumSquares = source.reduce((sum, value) => sum + value * value, 0);
  const rms = source.length ? Math.sqrt(sumSquares / source.length) : 0;
  const scaled = source.length ? source.map((value) => Math.max(value, rms * 0.12)) : source;
  return normalizeVoiceWaveform(scaled, target);
}''',
)
replace_once(
    "client/src/components/SecureMessagePane.jsx",
    "    return normalizeVoiceWaveform(amplitudes, bars);",
    "    return normalizeWaveform(amplitudes, bars);",
)

styles = read("client/src/secure-messaging.css")
compatibility_css = '''

/* 3.3.3 voice playback compatibility contract. */
.secure-message-pane { --secure-wave-active: #c69cff; }
.secure-voice-wave i.played {
  background: var(--secure-wave-active);
  opacity: 1;
}
'''
if "--secure-wave-active" not in styles:
    write("client/src/secure-messaging.css", styles.rstrip() + compatibility_css)

# Description is intentionally mandatory for every collective goal.
replace_once(
    "test/pulse-sandbox-service.test.cjs",
    '''    productCode: "room_banner_aurora",
    title: "Баннер",
    targetAmount: 500,''',
    '''    productCode: "room_banner_aurora",
    title: "Баннер",
    description: "Динамический баннер комнаты",
    targetAmount: 500,''',
)

# Import the browser ES module through a data URL under the CommonJS Node test runner.
write("test/voice-waveform.test.cjs", '''"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../client/src/utils/voice-waveform.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("voice duration never renders Infinity:NaN", async () => {
  const { finiteDuration, formatVoiceDuration } = await modulePromise;
  assert.equal(finiteDuration(Infinity), 0);
  assert.equal(formatVoiceDuration(Infinity), "0:00");
  assert.equal(formatVoiceDuration(65.2), "1:05");
});

test("waveform normalization is deterministic and bounded", async () => {
  const { normalizeVoiceWaveform, waveformLevel, seekRatio } = await modulePromise;
  const bars = normalizeVoiceWaveform([0, 1, 4, 9, 16], 48);
  assert.equal(bars.length, 48);
  assert.ok(bars.every((value) => value >= 14 && value <= 100));
  assert.equal(seekRatio(50, 0, 100), 0.5);
  assert.equal(seekRatio(-50, 0, 100), 0);
  assert.equal(seekRatio(150, 0, 100), 1);
  assert.equal(waveformLevel(new Uint8Array(256).fill(128)), 0);
  assert.ok(waveformLevel(Uint8Array.from({ length: 256 }, (_, index) => index % 2 ? 255 : 0)) > 70);
});
''')

print("Nexora 3.3.3 regression fixups applied.")
