import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {activities,newMission,tickMission} from '../src/events.js';
import {createVehicle} from '../models/vehicle.js';
import {createWorld,routePoint,roadLengths,groundHeight} from '../src/world.js';
import {newDriver,stepVehicle,vehicleStats,STEP} from '../src/physics.js';
import {cars} from '../src/profile.js';

const run=id=>({...newMission(activities.find(e=>e.id===id)),status:'running'});
const p={x:0,z:0,speed:65,driftScore:0,rolls:0,airtime:0};
test('timed gates, pursuit capture, rival finish and speed camera resolve independently',()=>{
 const coast=run('coast');for(let i=0;i<coast.event.count;i++)tickMission(coast,1,p,p,Infinity);assert.equal(coast.status,'won');
 const pursuit=run('city');tickMission(pursuit,10,{...p,speed:0},{x:40,z:40},2);assert.equal(pursuit.status,'lost');
 const duel=run('canyon');duel.rival=duel.event.interval*duel.event.count;tickMission(duel,.1,p,{x:99,z:99},Infinity);assert.equal(duel.status,'lost');
 for(const [kph,outcome] of [[218,'lost'],[222,'won']]){const trap=run('speed');tickMission(trap,.01,{...p,speed:kph/3.6},p,Infinity);assert.equal(trap.status,outcome);}
});
test('both glass targets are required, in either order',()=>{
 const m=run('glass');tickMission(m,.1,p,p,Infinity,'2/548');tickMission(m,.1,p,p,Infinity,'2/548');assert.equal(m.passed,1);
 tickMission(m,.1,p,p,Infinity,'2/231');assert.equal(m.status,'won');
});
test('all seven vehicles produce a detailed renderable mesh',()=>{
 for(const car of cars){const v=createVehicle({body:car.id});assert.ok(v.group.userData.triangles>60000);v.update({speed:30,steer:.2,brake:.8,boosting:true},.02);v.dispose();}
});
test('road queries preserve both expressway decks, destructibles reset, and a harbour ramp launches a car',()=>{
 // Offscreen test needs only the sign lettering calls. Runtime supplies a real browser canvas.
 const original=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
 let w;try{
  w=createWorld(new THREE.Scene());const bridge=routePoint(12,roadLengths[12]*.48);
  assert.ok(w.surface(bridge.x,bridge.z,bridge.height).height>groundHeight(bridge.x,bridge.z)+7);
  const id='2/231',b=w.boardAt(id),hit=()=>w.collide({...b,y:groundHeight(b.x,b.z)});
  assert.equal(hit().boardId,id);assert.equal(hit().smashed,0);w.resetBoards([id]);assert.equal(hit().boardId,id);
  const r=routePoint(2,148),x=r.x+Math.cos(r.heading)*3.2,z=r.z-Math.sin(r.heading)*3.2;
  const d=newDriver({x,z,heading:r.heading},w.surface(x,z).height);d.speed=38;
  for(let i=0;i<70&&!d.airborne;i++)stepVehicle(d,{throttle:1,brake:0,steer:0,drift:false,nitro:false},vehicleStats(cars[0]),w.surface,STEP);
  assert.ok(d.airborne);
 }finally{w?.dispose();if(original)globalThis.document=original;else delete globalThis.document;}
});
test('the hypercar exceeds 200 mph under boost',()=>{
 const d=newDriver({x:0,z:0,heading:0});const tune=vehicleStats(cars.at(-1));const surface=()=>({height:0,ramp:false,road:true});
 const input={throttle:1,brake:0,steer:0,drift:false,nitro:false};
 for(let i=0;i<45/STEP;i++)stepVehicle(d,input,tune,surface);
 input.nitro=true;for(let i=0;i<2/STEP;i++)stepVehicle(d,input,tune,surface);assert.ok(d.speed*2.23694>200);
});
