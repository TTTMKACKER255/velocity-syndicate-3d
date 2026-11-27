const impactFiles = {
  car: new URL("./impacts/car.wav", import.meta.url).href,
  tree: new URL("./impacts/tree.wav", import.meta.url).href,
  concrete: new URL("./impacts/concrete.wav", import.meta.url).href,
  glass: new URL("./impacts/glass.wav", import.meta.url).href,
};
// Engine harmonics follow the simulated tach. Audio is created after a user gesture.
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.buffers = new Map();
    this.voices = new Set();
    this.effectTime = new Map();
    this.generation = 0;
  }
  start() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Audio();
        this.effects = this.ctx.createDynamicsCompressor();
        this.effects.threshold.value = -9;
        this.effects.ratio.value = 5;
        this.effects.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.Q.value = 0.8;
        this.filter.connect(this.master);
        this.osc = [1, 1.006, 0.5].map((r) => {
          const o = this.ctx.createOscillator();
          o.type = r === 0.5 ? "triangle" : "sawtooth";
          o.connect(this.filter);
          o.start();
          return o;
        });
      }
      this.ctx.resume().catch(() => {});
      for (const material of Object.keys(impactFiles))
        this.loadImpact(material);
    } catch {
      /* Audio hardware is optional. */
    }
  }
  update(p, throttle) {
    if (!this.ctx) return;
    let t = this.ctx.currentTime,
      f = (p.rpm / 60) * 1.6;
    this.osc.forEach((o, i) =>
      o.frequency.setTargetAtTime(f * [1, 1.006, 0.5][i], t, 0.04),
    );
    this.filter.frequency.setTargetAtTime(
      220 + throttle * 450 + p.boostStage * 160,
      t,
      0.08,
    );
    this.master.gain.setTargetAtTime(
      this.enabled ? 0.012 + throttle * 0.011 : 0,
      t,
      0.08,
    );
  }
  loadImpact(material) {
    if (this.buffers.has(material)) return this.buffers.get(material);
    const task = fetch(impactFiles[material])
      .then((r) => {
        if (!r.ok) throw new Error("Impact recording unavailable");
        return r.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .catch(() => {
        this.buffers.delete(material);
        return null;
      });
    this.buffers.set(material, task);
    return task;
  }
  async impact(speed, material) {
    if (
      !this.enabled ||
      !this.ctx ||
      this.ctx.state !== "running" ||
      speed < 1.1
    )
      return;
    const ctx = this.ctx,
      contactTime = ctx.currentTime;
    if (contactTime - (this.effectTime.get(material) ?? -10) < 0.2) return;
    this.effectTime.set(material, contactTime);
    const generation = this.generation,
      lightWood = material === "wood";
    const buffer = await this.loadImpact(lightWood ? "tree" : material);
    if (
      !buffer ||
      generation !== this.generation ||
      !this.enabled ||
      ctx.currentTime - contactTime > 0.5
    )
      return;
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    const intensity = Math.min(1, Math.sqrt(speed / 42));
    source.buffer = buffer;
    source.playbackRate.value =
      material === "tree" ? 1 : 0.96 + Math.random() * 0.11 - 0.07 * intensity;
    const volume = (lightWood ? 0.26 : 0.9) * (0.12 + 0.88 * intensity);
    gain.gain.setValueAtTime(volume, t);
    if (lightWood) {
      gain.gain.setValueAtTime(volume, t + 0.085);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    }
    source.connect(gain).connect(this.effects);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    if (this.voices.size >= 6) this.voices.values().next().value.stop();
    this.voices.add(source);
    source.start(t);
    if (lightWood) source.stop(t + 0.21);
  }
  stopEffects() {
    this.generation++;
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }
  quiet() {
    this.stopEffects();
    if (this.ctx)
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.045);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  speak(text, voice) {
    if (!this.enabled || !voice || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03;
    u.pitch = 0.84;
    window.speechSynthesis.speak(u);
  }
}
