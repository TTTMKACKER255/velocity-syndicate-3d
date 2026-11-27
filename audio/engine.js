// Engine harmonics follow the simulated tach. Audio is created after a user gesture.
export class GameAudio {
  constructor() {
    this.enabled = true;
  }
  start() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Audio();
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
  impact(relativeSpeed, wood = false) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx,
      t = ctx.currentTime;
    if (!this.crunch) {
      this.crunch = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.28),
        ctx.sampleRate,
      );
      const samples = this.crunch.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    noise.buffer = this.crunch;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(wood ? 1450 : 780, t);
    filter.frequency.exponentialRampToValueAtTime(wood ? 290 : 95, t + 0.18);
    gain.gain.setValueAtTime(0.018 + Math.min(1, relativeSpeed / 35) * 0.19, t);
    gain.gain.exponentialRampToValueAtTime(0.0002, t + 0.24);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    noise.start(t);
  }
  quiet() {
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
