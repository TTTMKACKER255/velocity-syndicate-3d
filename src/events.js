export const events=[
 {id:'coast',name:'Coastal Rush',type:'Time attack',place:'Coastal Highway',image:'coastal',color:'#ff782d',icon:'timer',road:0,start:115,interval:150,count:6,limit:75,reward:3400,rep:85,chapter:1,
 brief:'Beat the clock through six coastal checkpoints. The syndicate is watching the highway cameras.',dispatch:'Rookie, take the ocean road. Six gates. Show them whose coast this is.'},
 {id:'city',name:'Neon Pursuit',type:'Heist & escape',place:'Downtown District',image:'downtown',color:'#b296ff',icon:'siren',road:0,startRatio:.52,interval:135,count:7,limit:90,reward:4600,rep:120,chapter:2,
 brief:'Deliver the prototype before the syndicate interceptors box you in. Keep moving to shake their pursuit.',dispatch:'Prototype is live. The interceptors have your signal. Get it to the drop.'},
 {id:'canyon',name:'Canyon Duel',type:'Rival showdown',place:'Canyon Pass',image:'canyon',color:'#3dd6bf',icon:'flag',road:1,start:55,interval:140,count:7,limit:105,reward:6500,rep:180,chapter:3,
 brief:'Race Vale, head of the syndicate, through seven mountain gates. Cross the last gate first to win his hypercar.',dispatch:'Vale has come out of hiding. Take his title, and the bay belongs to the drivers.'}
];
export const stuntEvent={id:'stunt',name:'Dockside Air',type:'Stunt trial',place:'Harbour',icon:'bolt',road:2,start:60,interval:95,count:3,limit:85,reward:2800,rep:75,
 brief:'Earn 160 stunt points before the timer expires. Hold the handbrake and steer to drift, or launch from a ramp.',dispatch:'The dock crew wants a show. Link drifts or take to the air.'};
export const activities=[...events,stuntEvent];
export const storyLine=complete=>complete.length===3?'The syndicate has fallen. Aurelia Bay is yours.':complete.length===0?'Rookie, the coast is clear. Your first contract is on the board.':complete.length===1?'The syndicate knows your name. A prototype just arrived downtown.':'Vale is waiting in the canyon. Bring your fastest car.';
export const startDistance=(event,lengths)=>event.start??event.startRatio*lengths[event.road];
export function newMission(event) {return {event,elapsed:0,passed:0,status:'intro',intro:3.2,rival:0,exposure:0,stunt:0};}
export function tickMission(m,dt,p,waypoint,pursuit) {
  if(m.status!=='running')return;
  m.elapsed+=dt;const e=m.event;
  if(e.id==='stunt')m.stunt=Math.floor(p.driftScore+(p.rolls*150)+p.airtime*14);
  if(e.id==='city') m.exposure=Math.max(0,Math.min(1,m.exposure+dt*(pursuit<9&&Math.abs(p.speed)<20?.12:-.075)));
  if(e.id==='canyon')m.rival+=dt*(19+Math.min(10,m.elapsed*.2));
  const hit=Math.hypot(p.x-waypoint.x,p.z-waypoint.z)<23;
  if(hit && e.id!=='stunt')m.passed++;
  if((e.id==='stunt'&&m.stunt>=160)||(e.id!=='stunt'&&m.passed>=e.count))m.status='won';
  else if(m.elapsed>=e.limit||m.exposure>=1||(e.id==='canyon'&&m.rival>=e.interval*e.count))m.status='lost';
}
