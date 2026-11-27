import test from 'node:test';
import assert from 'node:assert/strict';
import {newDriver,stepVehicle,vehicleStats,STEP} from '../src/physics.js';
const flat=()=>({height:0,road:true,ramp:false});
const tune=vehicleStats({top:90,accel:13,grip:1});
const input={throttle:1,brake:0,steer:0,drift:false,nitro:false};
function run(p,controls,seconds,surface=flat) { for(let i=0;i<Math.round(seconds/STEP);i++) stepVehicle(p,controls,tune,surface); }
const driver=()=>newDriver({x:0,z:0,heading:0});
test('fixed-step drive, reverse and drift',()=>{const p=driver();run(p,input,5);assert.ok(p.z < -80 && p.speed>30);run(p,{...input,drift:true,steer:1},1);assert.ok(p.drift && p.driftScore>0);run(p,{...input,throttle:0,brake:1},12);assert.ok(p.speed<0 && p.speed>=-13);});
test('nitro has three stages and release-to-rearm',()=>{const p=driver();p.speed=45;run(p,{...input,nitro:true},2);assert.equal(p.boostStage,3);run(p,{...input,nitro:true},2);assert.ok(p.heatLock && !p.boosting);run(p,input,2);assert.ok(p.nitro>0 && !p.heatLock);});
test('ramps launch, permit a barrel roll and land',()=>{const p=driver();p.y=4;p.speed=60;const ramp=(x,z)=>({height:z>=-2?4:0,ramp:z>=-2,road:true});run(p,{...input,drift:true},.4,ramp);assert.ok(p.airborne);run(p,{...input,drift:true},3,ramp);assert.ok(!p.airborne && p.rolls>=1 && p.y===0);});
