import '../ui/style.css';
import { icon,logo } from '../ui/icons.js';
import { cars,activeCar,currentLook,readProfile,saveProfile,money,upgradeCost,repCost,upgradeNames } from './profile.js';
import { vehicleStats } from './physics.js';
import { events,activities,storyLine,startDistance } from './events.js';
import { Controls } from './input.js';
import { GameAudio } from '../audio/engine.js';
import coastalPhoto from '../assets/coastal.webp';
import downtownPhoto from '../assets/downtown.webp';
import canyonPhoto from '../assets/canyon.webp';
import stationTrack from '../audio/bay-fm.ogg';
const photos={coastal:coastalPhoto,downtown:downtownPhoto,canyon:canyonPhoto};
const app=document.querySelector('#app'),dialog=document.querySelector('#dialog'),toastEl=document.querySelector('#toast');
const profile=readProfile(),audio=new GameAudio(),radio=new Audio(stationTrack);radio.loop=true;radio.volume=.22;audio.enabled=profile.settings.sound;
const input=new Controls(action);
let screen='hub',garageCar=profile.car,garageTab='performance',showroom=null,session=null,mapOverlay=null,mapPick=events[0],mapGps=null,mapResize=null,mapEpoch=0;
let launchBusy=false,radioActive=false,dialogKind='',dialogData=null,toastTimer,radioTimer,revision=0;
const cash=()=>money(profile.credits)+' CR',car=()=>activeCar(profile);
const btn=(id,text,css='secondary')=>'<button class="'+css+'" data-act="'+id+'">'+text+'</button>';
const iconBtn=(act,label,glyph)=>'<button class="icon-button" data-act="'+act+'" aria-label="'+label+'" title="'+label+'">'+icon(glyph,17)+'</button>';
function notice(message){toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2350);}
function persist(){if(!saveProfile(profile))notice('Progress is available for this session only');updateAccount();}
function updateAccount(){const credit=app.querySelector('[data-credits]');if(credit)credit.textContent=cash();const rank=app.querySelector('[data-rank]');if(rank)rank.textContent=profile.rep>=350?'HEADLINER':profile.rep>=100?'CONTENDER':'ROOKIE';}
function clearView(){revision++;showroom?.dispose();showroom=null;mapResize?.disconnect();mapResize=null;mapEpoch++;mapOverlay?.remove();mapOverlay=null;}
function shell(content){
 const nav=(id,label,glyph)=>'<button class="nav-btn '+(screen===id?'active':'')+'" data-act="'+id+'" '+(screen===id?'aria-current="page"':'')+'>'+icon(glyph,17)+label+'</button>';
 app.innerHTML='<div class="shell"><header class="topbar"><button class="brand" data-act="hub" aria-label="Velocity Syndicate driver hub">'+logo+'<span class="wordmark">VELOCITY<small>SYNDICATE</small></span></button><nav class="nav" aria-label="Main navigation">'+nav('hub','Driver hub','hub')+nav('garage','Garage','garage')+nav('map','World map','map')+'</nav><div class="account"><div title="Prize credits" class="credit">'+icon('cash',18)+'<span data-credits>'+cash()+'</span></div><div class="account-rule"></div><div class="avatar">'+icon('user',18)+'</div><div class="driver-meta"><small>Driver rank</small><strong data-rank></strong></div></div></header><main class="page">'+content+'</main>'+footer()+'</div>';updateAccount();
}
function footer(){return '<footer class="footer"><button class="radio-line" data-act="radio" aria-pressed="'+radioActive+'" title="Play or pause Bay FM">'+icon('radio',20)+'<b>BAY FM</b><span class="footer-sep"></span><span class="station-track">'+(radioActive?'On air · Afterhours Run':'98.4 FM')+'</span>'+icon(radioActive?'volume':'play',12)+'</button><div class="footer-actions">'+btn('controls',icon('control',17)+'Controls','utility')+'<span class="footer-sep"></span>'+btn('settings',icon('settings',16)+'Settings','utility')+'</div></footer>';}
function heading(title,level='h1'){return '<div class="section-heading"><i class="speed-slashes" aria-hidden="true"></i><'+level+'>'+title+'</'+level+'></div>';}
function eventCard(e){const win=profile.wins[e.id];return '<button class="event-card" data-act="event:'+e.id+'" style="--accent:'+e.color+'"><div class="event-photo"><img alt="" src="'+photos[e.image]+'"><span class="event-icon">'+icon(e.icon,18)+'</span></div><div class="event-text"><div class="eyebrow">'+e.type+'</div><div class="card-title"><h3>'+e.name+'</h3><span class="open-mark">'+icon(win?'check':'arrow',14)+'</span></div><div class="event-meta">'+icon('pin',12)+e.place+'<span class="separator">/</span>'+icon('cash',12)+money(e.reward)+' CR</div></div></button>';}
function hub(){
 clearView();screen='hub';document.title='Velocity Syndicate — Driver Hub';
 shell('<div class="title-row">'+heading('Driver hub')+'<div class="session"><i class="status-light"></i>Single player</div></div><section class="hero" aria-label="Aurelia Bay free roam"><div class="hero-art"></div><div class="hero-content"><span class="mode-tag">'+icon('compass',14)+' Free roam</span><h2>Aurelia<span>Bay</span></h2><p>Explore the coastal highways, downtown streets, and canyon passes of Aurelia Bay.</p><button class="primary" data-act="drive">'+icon('play',15)+' Start driving <span class="key">'+icon('return',13)+'</span></button></div><span class="location-tag">'+icon('pin',12)+' Coastal district</span><div class="hero-car"><div><small>Featured vehicle</small><b>Veloce GT-R</b></div>'+icon('car',24)+'</div></section><div class="section-line">'+heading('Event board','h2')+btn('map',icon('map',15)+'View map','minor-btn')+'</div><div class="event-grid">'+events.map(eventCard).join('')+'</div>');
}
function openDialog(kind,title,body,data=null){
 dialogKind=kind;dialogData=data;dialog.innerHTML='<div class="dialog-top"><h2 class="dialog-title">'+title+'</h2>'+iconBtn('close','Close dialog','cross')+'</div>'+body;
 if(!dialog.open)dialog.showModal();
}
function closeDialog(resume=true){const old=dialogKind;dialogKind='';dialogData=null;if(dialog.open)dialog.close();if(!resume)return;
 if(session&&old==='result'){session.mission=null;session.hooks.radio('Contract closed. The bay is open.');}
 if(session&&!mapOverlay)session.pause(false);
}
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
const line=(name,value)=>'<div class="dialog-line"><span>'+name+'</span><strong>'+value+'</strong></div>';
function eventDetail(e){
 openDialog('event',e.name,(photos[e.image]?'<img class="dialog-photo" alt="" src="'+photos[e.image]+'">':'')+'<p class="dialog-copy">'+e.brief+'</p>'+line('Event',e.type)+line('District',e.place)+line('Prize',money(e.reward)+' CR · '+e.rep+' REP')+(profile.best[e.id]?line('Personal best',profile.best[e.id].toFixed(1)+' s'):'')+'<div class="modal-actions">'+btn('launch:'+e.id,icon('flag',16)+' Enter event','primary')+btn('gps:'+e.id,icon('pin',16)+' Set GPS')+'</div>',e);
}
function controlsDialog(){
 if(session)session.pause(true);
 const keys=[['Accelerate / brake','W / S or ↑ / ↓','RT / LT'],['Steer','A / D or ← / →','Left stick'],['Drift / air roll','Space + steer','B + steer'],['Nitro','Hold Shift','Hold A'],['Change camera','C','Y'],['Recover car','R','X'],['Enter nearby event','E','LB'],['World map','M','View'],['Headlights','H','D-pad ↑'],['Pause','Esc','Menu']];
 openDialog('controls','Driving controls','<table class="control-table"><thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th></tr></thead><tbody>'+keys.map(k=>'<tr>'+k.map(t=>'<td>'+t+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
}
function settingsDialog(){
 if(session)session.pause(true);
 const s=profile.settings;
 const group=(name,values,current)=>'<div class="segmented">'+values.map(([value,label])=>'<button data-act="setting:'+name+':'+value+'" aria-pressed="'+(String(current)===String(value))+'" class="'+(String(current)===String(value)?'on':'')+'">'+label+'</button>').join('')+'</div>';
 const binary=[[true,'On'],[false,'Off']];
 openDialog('settings','Settings',line('Game sound',group('sound',binary,s.sound))+line('Spoken dispatch',group('voice',binary,s.voice))+line('Day / night cycle',group('cycle',binary,s.cycle))+line('Speed units',group('units',[['km/h','km/h'],['mph','mph']],s.units))+line('Graphics quality',group('quality',['Low','Balanced','High'].map(x=>[x,x]),s.quality)));
}
function changeSetting(k,v){profile.settings[k]=v==='true'?true:v==='false'?false:v;audio.enabled=profile.settings.sound;radio.muted=!profile.settings.sound;persist();session?.graphics.resize();settingsDialog();}
function toggleRadio(){
 if(radioActive){radio.pause();radioActive=false;}else{radio.muted=!profile.settings.sound;radio.play().catch(()=>notice('Audio playback is unavailable'));radioActive=true;}
 const f=app.querySelector('.footer');if(f)f.outerHTML=footer();else notice(radioActive?'Bay FM · Afterhours Run':'Bay FM paused');
}
function getGarageCar(){return cars.find(c=>c.id===garageCar)||car();}
const swatches=['#bfc4c9','#2d3032','#cc4a30','#efa74c','#47687b','#5c7f64'];
function garagePanel(){
 const c=getGarageCar(),owned=profile.owned.includes(c.id),t=vehicleStats(c,profile.upgrades[c.id]),look=currentLook(profile,c);
 const stat=(label,v,bar)=>'<div><div class="stat-label"><span>'+label+'</span><span>'+v+'</span></div><div class="stat-track"><i style="width:'+Math.min(100,bar)+'%"></i></div></div>';
 const stats='<div class="subpage-note">'+money(profile.repBalance)+' RP available</div><div class="stats-grid">'+stat('Top speed',Math.round(t.top*3.6)+' km/h',t.top/1.2)+stat('Acceleration',t.accel.toFixed(1)+' m/s²',t.accel*4.1)+stat('Handling',t.grip.toFixed(2)+' ×',t.grip*60)+stat('Nitro',t.capacity.toFixed(1)+' s',t.capacity*13)+'</div>';
 let tuning='';
 if(owned&&garageTab==='performance'){
  tuning=Object.entries(upgradeNames).map(([id,label])=>{const lv=profile.upgrades[c.id]?.[id]||0,cost=upgradeCost(lv);return '<div class="garage-row"><div><label>'+label+'</label><small>Level '+lv+' / 3</small></div><button class="buy" data-act="upgrade:'+id+'" '+(lv===3||(profile.credits<cost||profile.repBalance<repCost(lv))?'disabled':'')+'>'+ (lv===3?'Max level':'+ '+money(cost)+' CR'+(repCost(lv)?' · '+repCost(lv)+' RP':''))+'</button></div>';}).join('');
 }else if(owned){
  const choices=(id,label,values)=>'<div class="garage-row"><label for="v-'+id+'">'+label+'</label><select id="v-'+id+'" data-look="'+id+'">'+values.map(([v,l])=>'<option value="'+v+'" '+(String(look[id])===String(v)?'selected':'')+'>'+l+'</option>').join('')+'</select></div>';
  const toggle=[[false,'Stock'],[true,'Fitted']];tuning='<div class="garage-row"><label>Paint colour</label><div class="swatches">'+swatches.map((v,i)=>'<button style="--swatch:'+v+'" class="swatch '+(v===look.paint?'on':'')+'" aria-label="Paint '+['silver','graphite','vermilion','amber','slate','alpine green'][i]+'" data-act="paint:'+v+'"></button>').join('')+'</div></div>'+choices('finish','Paint finish',[['metallic','Metallic'],['matte','Matte'],['iridescent','Iridescent']])+choices('rims','Alloy rims',[['alloy','Graphite'],['silver','Silver'],['mesh','Mesh'],['bronze','Bronze']])+choices('spoiler','Carbon wing',[[true,'Fitted'],[false,'Removed']])+choices('bumper','Sport bumpers',toggle)+choices('widebody','Widebody kit',toggle)+choices('tint','Window tint',[[false,'Factory'],[true,'Smoke']])+choices('underglow','Underglow',[[false,'Off'],[true,'Amber']]);
 }
 const use=owned?(profile.car===c.id?'Equipped':'Equip vehicle'):'Buy · '+money(c.cost)+' CR';
 return '<div class="eyebrow">'+c.kind+'</div><div class="row"><h2>'+c.name+'</h2></div>'+stats+(!owned?'<p class="dialog-copy">Add this vehicle to your garage to drive and tune it.</p>':'<div class="tabs">'+btn('garage-tab:performance','Performance',garageTab==='performance'?'on':'')+btn('garage-tab:visual','Visual tuning',garageTab==='visual'?'on':'')+'</div>')+tuning+'<button class="primary" style="margin-top:15px" data-act="equip" '+((owned&&profile.car===c.id)||(!owned&&profile.credits<c.cost)?'disabled':'')+'>'+use+'</button>';
}
function refreshGarage(model=true){if(screen!=='garage')return;document.querySelector('#garage-panel').innerHTML=garagePanel();document.querySelector('#garage-label').textContent=getGarageCar().name;document.querySelectorAll('[data-car]').forEach(el=>{el.classList.toggle('on',el.dataset.car===garageCar);const c=cars.find(x=>x.id===el.dataset.car);el.querySelector('small').textContent=profile.owned.includes(c.id)?(profile.car===c.id?'Equipped':'Owned'):money(c.cost)+' CR';});if(model)showroom?.setLook(currentLook(profile,getGarageCar()));}
async function garage(){
 clearView();screen='garage';garageCar=profile.car;const rev=revision;
 shell('<div class="title-row">'+heading('Garage')+'<span class="subpage-note">'+profile.owned.length+' / '+cars.length+' vehicles owned</span></div><div class="workspace-grid"><div class="showroom"><div id="showroom" class="showroom-stage"></div><div class="canvas-label"><span class="eyebrow">Vehicle preview</span><h2 id="garage-label">'+getGarageCar().name+'</h2></div><div class="canvas-caption">Drag to rotate</div></div><section class="work-panel" id="garage-panel">'+garagePanel()+'</section></div><div class="car-strip">'+cars.map(c=>'<button class="car-option" data-car="'+c.id+'" data-act="car:'+c.id+'"><b>'+c.name+'</b><small></small></button>').join('')+'</div>');
 refreshGarage(false);try{const {createShowroom}=await import('../models/showroom.js');if(screen==='garage'&&rev===revision)showroom=createShowroom(document.querySelector('#showroom'),currentLook(profile,getGarageCar()));}catch(e){notice('The 3D preview could not start. Garage tuning is still available.');console.error(e);}
}
function setLook(k,v){const c=getGarageCar();if(!profile.owned.includes(c.id))return;profile.looks[c.id]={...currentLook(profile,c),[k]:v==='true'?true:v==='false'?false:v};persist();refreshGarage();}
function upgrade(id){const c=getGarageCar();if(!upgradeNames[id]||!profile.owned.includes(c.id))return;const tune=profile.upgrades[c.id]??={},level=tune[id]||0,price=upgradeCost(level);if(level>=3||price>profile.credits||repCost(level)>profile.repBalance)return;profile.credits-=price;profile.repBalance-=repCost(level);tune[id]=level+1;persist();refreshGarage(false);notice(upgradeNames[id]+' upgraded to level '+(level+1));}
function equip(){const c=getGarageCar();if(!profile.owned.includes(c.id)){if(profile.credits<c.cost)return;profile.credits-=c.cost;profile.owned.push(c.id);}profile.car=c.id;persist();refreshGarage(false);const label=document.querySelector('.subpage-note');if(label)label.textContent=profile.owned.length+' / '+cars.length+' vehicles owned';notice(c.name+' equipped');}
document.addEventListener('change',e=>{if(e.target.dataset.look)setLook(e.target.dataset.look,e.target.value);});
let mapApi=null,mapCanvas=null,mapState=null;
function mapBody(){
 return '<div class="title-row">'+heading('World map')+(session?btn('back-drive',icon('back',15)+' Return to drive','minor-btn'):'<div class="session">'+icon('compass',15)+' Aurelia Bay</div>')+'</div><div class="workspace-grid"><div class="map-frame"><canvas id="world-map" aria-label="Aurelia Bay road map. Select a point to set a waypoint."></canvas><div class="map-compass">N</div><div class="canvas-caption">Select a marker or place a GPS waypoint</div></div><section class="work-panel"><div class="eyebrow">Radio dispatch</div><h2>District events</h2><p class="dialog-copy">'+storyLine(events.filter(e=>profile.wins[e.id]))+'</p><div class="map-events">'+activities.map(e=>'<button class="map-event '+(mapPick?.id===e.id?'on':'')+'" style="--accent:'+(e.color||'#ffba71')+'" data-act="pick:'+e.id+'">'+icon(e.icon,21)+'<span><b>'+e.name+'</b><small>'+e.type+' · '+e.place+'</small></span>'+icon('arrow',14)+'</button>').join('')+'</div><div id="map-selected"></div></section></div>';
}
function drawFullMap(){
 if(!mapCanvas||!mapApi||!mapCanvas.isConnected)return;
 const b=mapCanvas.getBoundingClientRect();mapCanvas.width=Math.max(1,Math.round(b.width));mapCanvas.height=Math.max(1,Math.round(b.height));
 mapState=mapApi.drawMap(mapCanvas,{player:session?.p||mapApi.spawn,waypoint:mapGps||session?.gps,events:activities,selected:mapPick});
}
function updateMapSelection(){
 const region=document.querySelector('#map-selected');if(!region)return;
 document.querySelectorAll('.map-event').forEach(el=>el.classList.toggle('on',el.dataset.act==='pick:'+mapPick?.id));
 region.innerHTML=mapPick?'<div class="eyebrow">'+mapPick.place+'</div><p class="dialog-copy">'+mapPick.brief+'</p><div class="map-btns">'+btn('launch:'+mapPick.id,icon('flag',15)+' Enter event','primary')+btn('gps:'+mapPick.id,icon('pin',15)+' Set GPS')+'</div>':'<div class="eyebrow">Custom waypoint</div><p class="dialog-copy">GPS destination selected. Follow the amber marker to this location.</p>'+btn('gps-custom','Drive to waypoint','primary');
 drawFullMap();
}
async function worldMap(){
 if(launchBusy)return;
 if(session){if(mapOverlay){closeMap();return;}session.pause(true);mapOverlay=document.createElement('aside');mapOverlay.className='map-in-game';app.querySelector('.drive').inert=true;mapOverlay.innerHTML='<div class="page">'+mapBody()+'</div>';app.append(mapOverlay);}
 else{clearView();screen='map';shell(mapBody());}
 const epoch=++mapEpoch;
 const [m,w]=await Promise.all([import('../ui/map.js'),import('./world.js')]);if(epoch!==mapEpoch)return;
 mapApi={...m,...w};mapCanvas=document.querySelector('#world-map');mapResize?.disconnect();mapResize=new ResizeObserver(drawFullMap);mapResize.observe(mapCanvas);updateMapSelection();
 mapCanvas.addEventListener('click',e=>{const b=mapCanvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,found=activities.find(ev=>{const pos=w.routePoint(ev.road,startDistance(ev,w.roadLengths));const q=mapState.point(pos.x,pos.z);return Math.hypot(q[0]-x,q[1]-y)<17;});
  if(found){mapPick=found;mapGps=null;}else{mapPick=null;const p=mapState.world(x,y);let best=Infinity;for(const road of w.roads){for(const [a,b]of road.points){const d=Math.hypot(a-p.x,b-p.z);if(d<best){best=d;mapGps={x:a,z:b};}}}}updateMapSelection();
 });
}
function closeMap(){const drive=app.querySelector('.drive');if(drive)drive.inert=false;mapResize?.disconnect();mapResize=null;mapEpoch++;mapOverlay?.remove();mapOverlay=null;mapCanvas=null;if(session)session.pause(false);}
async function gps(e){
 let p=mapGps;if(e){const w=await import('./world.js');p=w.routePoint(e.road,startDistance(e,w.roadLengths));}if(!p)return;
 closeDialog(false);if(mapOverlay)closeMap();if(!session)await launch();if(session){session.gps=p;session.pause(false);notice('GPS set · '+(e?e.name:'Custom waypoint'));}
}
function radioMessage(text){const el=document.querySelector('#dispatch');if(!el)return;el.innerHTML='';const span=document.createElement('span');span.className='message';span.textContent='DISPATCH  /  '+text;el.append(span);clearTimeout(radioTimer);radioTimer=setTimeout(()=>{if(el.isConnected)el.innerHTML='';},5800);}
function hudMarkup(){
 const touch=(key,label)=>'<button data-hold="'+key+'" aria-label="'+label+'">'+label+'</button>';
 return '<div class="drive"><div id="viewport" class="viewport"></div><div class="hud"><div class="hud-top"><div class="hud-block"><div class="eyebrow" id="race-type">Free roam</div><h2 id="race-name">Coastal Highway</h2><p id="race-progress"></p><p class="gps-readout" id="gps-readout"></p></div><div class="hud-ops">'+iconBtn('map','World map (M)','map')+iconBtn('camera','Change camera (C)','camera')+iconBtn('pause','Pause game','pause')+'</div></div><div class="hud-center"><div id="countdown" class="countdown"></div><div id="dispatch"></div></div><div class="hud-bottom"><button class="hud-minimap" data-act="map" aria-label="Open world map"><canvas id="mini" width="180" height="130"></canvas><span id="district">Coastal Highway</span></button><div class="dial"><i class="gear" id="gear">1</i><strong id="speed">0</strong><span id="unit" class="dial-unit">KM/H</span><dl><dt>RPM</dt><dd id="rpm-label">1,000</dd></dl><div class="meter rpm-meter"><i id="rpm"></i></div><dl><dt>NITRO</dt><dd id="nitro-label">100%</dd></dl><div class="meter"><i id="nitro"></i></div></div></div><button class="mission-more" id="near-event" hidden data-act="interact"></button><div class="touch-controls"><div>'+touch('KeyA','◀')+touch('KeyD','▶')+'</div><div>'+touch('Space','Drift')+touch('ShiftLeft','Nitro')+touch('KeyS','Brake')+touch('KeyW','Gas')+'</div></div></div><div id="loading" class="loading">Entering Aurelia Bay…</div></div>';
}
let hudRefs={},miniDraw;
function updateHud(p,m,wp,near,district){
 const h=hudRefs;if(!h.speed)return;
 h.speed.textContent=Math.round(Math.abs(p.speed)*(profile.settings.units==='mph'?2.23694:3.6));h.unit.textContent=profile.settings.units.toUpperCase();
 h.gear.textContent=p.gear<0?'R':p.gear;h.rpm.style.width=Math.round(p.rpm/86)+'%';h['rpm-label'].textContent=money(p.rpm);
 h.nitro.style.width=Math.round(p.nitro*100)+'%';h['nitro-label'].textContent=p.boosting?['','Boost','Overdrive','Shockwave'][p.boostStage]:Math.round(p.nitro*100)+'%';
 h.district.textContent=district;h['race-name'].textContent=m?m.event.name:district;h['race-type'].textContent=m?m.event.type:'Free roam';
 h['race-progress'].textContent=m?((m.event.id==='stunt'?m.stunt+' / 160 stunt points':(m.event.id==='glass'?'Billboard ':'Gate ')+Math.min(m.event.count,m.passed+1)+' / '+m.event.count)+'  ·  '+Math.ceil(Math.max(0,m.event.limit-m.elapsed))+' s'+(m.event.id==='city'?'  ·  Heat '+Math.round(m.exposure*100)+'%':'')):p.drift?'Drift · '+Math.round(p.driftScore)+' pts':p.airborne?'Airborne · '+p.airtime.toFixed(1)+' s':'';
 h.countdown.textContent=m?.status==='intro'?Math.max(1,Math.ceil(m.intro)):'';
 h['near-event'].hidden=!near;if(near)h['near-event'].textContent='[ E ]  Enter '+near.name;
 if(wp){const distance=Math.hypot(p.x-wp.x,p.z-wp.z);const bearing=Math.atan2(-(wp.x-p.x),-(wp.z-p.z));const delta=Math.atan2(Math.sin(bearing-p.heading),Math.cos(bearing-p.heading));h['gps-readout'].textContent=(Math.abs(delta)>2.6?'Turn around':delta>.3?'Bear left':delta<-.3?'Bear right':'Ahead')+'  ·  '+Math.round(distance)+' m';}else h['gps-readout'].textContent='';
 miniDraw(h.mini,{player:p,waypoint:wp,local:true,scale:.35,events:activities,selected:m?.event});
}
function result(m,reward,rep){
 const won=m.status==='won';openDialog('result',won?'Event complete':'Event ended','<div class="eyebrow">'+m.event.name+'</div><p class="dialog-copy">'+(won?(m.unlocked?'All three contracts are complete. The syndicate is out, and the Solare X1 is yours.':m.event.id==='canyon'?'Vale has conceded the canyon. Clear all three district contracts to claim his Solare X1.':'Dispatch confirmed your run. Your prize is in the garage account.'):(m.event.id==='speed'&&m.recorded?'The camera recorded '+m.recorded+' km/h. The target was 220 km/h.':m.exposure>=1?'The interceptors caught the prototype.':m.event.id==='canyon'?'Vale claimed the finish.':'The clock ran out.'))+'</p>'+line('Run time',m.elapsed.toFixed(1)+' s')+(m.recorded?line('Speed trap',m.recorded+' km/h'):'')+(won?line('Award',money(reward)+' CR · '+rep+' REP'):'')+'<div class="modal-actions">'+btn('free-continue','Free roam','primary')+btn('launch:'+m.event.id,'Retry event')+btn('leave','Driver hub','minor-btn')+'</div>');
}
async function launch(event=null){
 if(launchBusy)return;
 closeDialog(false);if(mapOverlay)closeMap();
 if(session){if(event)session.start(event);session.pause(false);return;}
 clearView();launchBusy=true;screen='drive';app.innerHTML=hudMarkup();const root=document.querySelector('.hud');hudRefs=Object.fromEntries([...root.querySelectorAll('[id]')].map(el=>[el.id,el]));
 try{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const [{Session},{drawMap}]=await Promise.all([import('./session.js'),import('../ui/map.js')]);miniDraw=drawMap;
  session=new Session(document.querySelector('#viewport'),profile,input,audio,{notice,radio:radioMessage,result,hud:updateHud});
  document.querySelector('#loading').remove();if(event)session.start(event);else radioMessage('Welcome to Aurelia Bay. Accelerate with W or the right trigger.');
  document.querySelectorAll('[data-hold]').forEach(el=>{el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);input.touch.add(el.dataset.hold);});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>input.touch.delete(el.dataset.hold));});
 }catch(error){console.error(error);session?.dispose();session=null;hub();openDialog('load-error','Drive unavailable','<p class="dialog-copy">The driving scene could not start in this browser. Reload the page and try again.</p>'+btn('close','Return to hub','primary'));}
 finally{launchBusy=false;}
}
function leave(){closeDialog(false);if(mapOverlay)closeMap();session?.dispose();session=null;hudRefs={};clearTimeout(radioTimer);hub();}
function pause(){
 if(!session)return;if(mapOverlay){closeMap();return;}if(dialog.open){closeDialog();return;}session.pause(true);
 openDialog('pause','Paused','<div class="eyebrow">'+session.district()+'</div><p class="dialog-copy">'+(session.mission?session.mission.event.name:'Free roam')+' · '+car().name+'</p><div class="modal-actions">'+btn('close','Resume driving','primary')+btn('controls','Controls')+btn('settings','Settings')+btn('leave',icon('exit',15)+' Driver hub','minor-btn')+'</div>');
}
function action(name){
 const [act,id,value]=name.split(':');if(launchBusy)return;
 switch(act){
  case'hub':if(session)leave();else hub();break;case'garage':garage();break;case'map':worldMap();break;case'back-drive':closeMap();break;
  case'drive':launch();break;case'event':eventDetail(activities.find(e=>e.id===id));break;case'launch':launch(activities.find(e=>e.id===id));break;
  case'pick':mapPick=activities.find(e=>e.id===id);mapGps=null;updateMapSelection();break;
  case'gps':gps(activities.find(e=>e.id===id));break;case'gps-custom':gps(null);break;
  case'close':closeDialog();break;case'controls':controlsDialog();break;case'settings':settingsDialog();break;case'setting':changeSetting(id,value);break;
  case'pause':pause();break;case'camera':if(session)notice('Camera · '+session.graphics.controller.cycle());break;
  case'interact':session?.interact();break;case'reset':session?.reset();break;case'lights':if(session){session.headlights=!session.headlights;notice('Headlights '+(session.headlights?'on':'off'));}break;
  case'radio':toggleRadio();break;case'leave':leave();break;case'free-continue':closeDialog();break;
  case'car':garageCar=id;refreshGarage();break;case'garage-tab':garageTab=id;refreshGarage(false);break;case'paint':setLook('paint',id);break;case'upgrade':upgrade(id);break;case'equip':equip();break;
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)action(b.dataset.act);});
window.addEventListener('keydown',e=>{if(dialog.open||launchBusy)return;if(mapOverlay&&(e.code==='Escape'||e.code==='KeyM')){closeMap();e.preventDefault();return;}if(screen==='hub'&&e.code==='Enter'&&(document.activeElement===document.body||document.activeElement===app)){e.preventDefault();launch();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session&&!session.paused)pause();});
let priorPad=[],padLatch=0;
function navigatePad(t){
 requestAnimationFrame(navigatePad);const pad=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(!pad)return;
 const down=i=>pad.buttons[i]?.pressed,pressed=i=>down(i)&&!priorPad[i];
 if((!session||session.paused)&&!launchBusy){
  const scope=dialog.open?dialog:mapOverlay||app;const candidates=[...scope.querySelectorAll('button:not(:disabled),select')].filter(el=>el.offsetWidth>0);
  const axis=Math.abs(pad.axes[1]||0)>.55?pad.axes[1]:pad.axes[0]||0;
  const direction=down(13)||down(15)||axis>.55?1:down(12)||down(14)||axis<-.55?-1:0;
  if(direction&&t>padLatch&&candidates.length){const idx=candidates.indexOf(document.activeElement);candidates[(Math.max(-1,idx)+direction+candidates.length)%candidates.length].focus();padLatch=t+190;}
  if(document.activeElement?.tagName==='SELECT'&&(pressed(4)||pressed(5))){const select=document.activeElement;select.selectedIndex=(select.selectedIndex+(pressed(5)?1:-1)+select.options.length)%select.options.length;select.dispatchEvent(new Event('change',{bubbles:true}));}
  if(pressed(0)){(candidates.includes(document.activeElement)?document.activeElement:candidates.find(b=>b.dataset.act==='drive')||candidates[0])?.click();}
  if(pressed(1)||pressed(9)){if(dialog.open)closeDialog();else if(mapOverlay)closeMap();else if(screen!=='hub')hub();}
 }
 priorPad=pad.buttons.map(b=>b.pressed);
}
hub();requestAnimationFrame(navigatePad);
