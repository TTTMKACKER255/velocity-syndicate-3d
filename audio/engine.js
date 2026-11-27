// Engine harmonics follow the simulated tach. Audio is created after a user gesture.
export class GameAudio {
  constructor(){this.enabled=true;}
  start(){
    if(!this.enabled)return;
    try {
      if(!this.ctx){
        const Audio=window.AudioContext||window.webkitAudioContext;
        this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=0;
        this.master.connect(this.ctx.destination);
        this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.Q.value=.8;this.filter.connect(this.master);
        this.osc=[1,1.006,.5].map(r=>{const o=this.ctx.createOscillator();o.type=r===.5?'triangle':'sawtooth';o.connect(this.filter);o.start();return o;});
      }
      this.ctx.resume().catch(()=>{});
    }catch{/* Audio hardware is optional. */}
  }
  update(p,throttle){
    if(!this.ctx)return;let t=this.ctx.currentTime,f=p.rpm/60*1.6;
    this.osc.forEach((o,i)=>o.frequency.setTargetAtTime(f*[1,1.006,.5][i],t,.04));
    this.filter.frequency.setTargetAtTime(220+throttle*450+p.boostStage*160,t,.08);
    this.master.gain.setTargetAtTime(this.enabled?.012+throttle*.011:0,t,.08);
  }
  quiet(){if(this.ctx)this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.045);if('speechSynthesis'in window)window.speechSynthesis.cancel();}
  speak(text,voice){if(!this.enabled||!voice||!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=1.03;u.pitch=.84;window.speechSynthesis.speak(u);}
}
