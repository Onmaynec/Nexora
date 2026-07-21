"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

class AudioStub {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.currentTime = 0;
    this.duration = 7;
    this.playbackRate = 1;
    this.src = "";
  }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  async play() { this.paused = false; this.listeners.get("play")?.(); }
  pause() { this.paused = true; this.listeners.get("pause")?.(); }
  removeAttribute(name) { if (name === "src") this.src = ""; }
  load() {}
}

test("stopVoice clears identity and source so GlobalVoiceDock unmounts", async () => {
  const previousWindow = global.window;
  const previousAudio = global.Audio;
  global.window = {};
  global.Audio = AudioStub;
  try {
    const source = fs.readFileSync(path.join(__dirname, "..", "client", "src", "audio-player.js"), "utf8");
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    await module.toggleVoice({ url: "https://local.test/voice.webm", name: "voice.webm", duration: 7 }, "message-1");
    assert.equal(module.getAudioSnapshot().id, "message-1");
    module.stopVoice();
    assert.deepEqual(module.getAudioSnapshot(), {
      id: null,
      url: "",
      name: "",
      playing: false,
      currentTime: 0,
      duration: 0,
      rate: 1,
    });
  } finally {
    global.window = previousWindow;
    global.Audio = previousAudio;
  }
});
