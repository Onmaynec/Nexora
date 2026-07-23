"use strict";

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
