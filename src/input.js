export class Controls {
  constructor(action) {
    this.keys = new Set(); this.touch = new Set(); this.prior = []; this.action = action; this.active = false;
    const shortcuts = {KeyC:'camera', KeyR:'reset', KeyM:'map', Escape:'pause', KeyE:'interact',KeyH:'lights'};
    window.addEventListener('keydown', e => {
      if (!this.active || e.target.closest?.('input,select,textarea')) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code) && e.code!=='Tab') e.preventDefault();
      if (!e.repeat && shortcuts[e.code]) this.action(shortcuts[e.code]);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
  }
  clear() { this.keys.clear(); this.touch.clear(); }
  read() {
    const k=(...codes)=>codes.some(c=>this.keys.has(c)||this.touch.has(c));
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    const buttons = pad?.buttons || [], value=i=>buttons[i]?.value || 0;
    const actions={2:'reset',3:'camera',4:'interact',8:'map',9:'pause',12:'lights'};
    if (this.active) for (const [i,act] of Object.entries(actions)) if (value(i)>.5 && !this.prior[i]) this.action(act);
    this.prior=buttons.map(b=>b.value>.5);
    const axis=pad?.axes?.[0] || 0;
    return {throttle:Math.max(k('KeyW','ArrowUp')?1:0,value(7)),
      brake:Math.max(k('KeyS','ArrowDown')?1:0,value(6)),
      steer:Math.max(-1,Math.min(1,Number(k('KeyA','ArrowLeft'))-Number(k('KeyD','ArrowRight'))-(Math.abs(axis)>.12?axis:0))),
      nitro:k('ShiftLeft','ShiftRight')||value(0)>.5,drift:k('Space')||value(1)>.5};
  }
}
