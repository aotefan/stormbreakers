import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import * as simulation from '../shared/simulation';
import type { BoatState, GameState, PlayerInput } from '../shared/protocol';

const failures: string[] = [];
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); console.log('PASS', name); }
  catch (error) { failures.push(name); console.error('FAIL', name, String(error)); }
}
function fixture() {
  const state = simulation.createGameState({ roomCode: 'STOP', mode: 'battle', aiCount: 0 });
  const boat = simulation.addBoat(state, { playerId: 'touch', name: 'Touch', ai: false });
  Object.assign(boat, { x: 0, z: 0, vx: 12, vz: 4, angle: 0 });
  return { state, boat };
}
const stoppedInput = { seq: 1, throttle: 0, turn: 0, dragTarget: null, stop: true };
await test('touch release immediately freezes position and velocity', () => {
  const { state, boat } = fixture();
  simulation.stepGame(state, .05, new Map([['touch', stoppedInput]]), 'normal');
  assert.deepEqual([boat.x, boat.z, boat.vx, boat.vz], [0, 0, 0, 0]);
  simulation.stepGame(state, .05, new Map([['touch', { ...stoppedInput, fireRight: true }]]), 'normal');
  assert.deepEqual([boat.x, boat.z, boat.vx, boat.vz], [0, 0, 0, 0]);
  assert.equal(state.cannonballs.length, 1, 'stopped touch ship can still fire');
});
await test('keyboard idle retains its existing inertia', () => {
  const { state, boat } = fixture();
  simulation.stepGame(state, .05, new Map([['touch', { seq:1, throttle:0, turn:0 }]]), 'normal');
  assert(boat.vx > 0 && boat.x > 0);
});
await test('keyboard sailing resumes after a touch stop', () => {
  const { state, boat } = fixture();
  simulation.stepGame(state,.05,new Map([['touch',stoppedInput]]),'normal');
  simulation.stepGame(state,.05,new Map([['touch',{seq:2,throttle:1,turn:0,stop:false}]]),'normal');
  assert(boat.vz>0&&boat.z>0);
});
await test('touch prediction uses bounded movement and collisions without mutating authority', () => {
  const predict = (simulation as unknown as { predictBoatMovement?: (state: GameState, boat: BoatState, input: PlayerInput, dt: number) => BoatState }).predictBoatMovement;
  assert.equal(typeof predict, 'function', 'movement prediction must exist');
  const { state, boat } = fixture();
  const before = JSON.stringify(state);
  const stopped = predict!(state, boat, stoppedInput, .05);
  assert.deepEqual([stopped.x, stopped.z, stopped.vx, stopped.vz], [0,0,0,0]);
  const moving = predict!(state, boat, { seq:2, throttle:1, turn:0, dragTarget:{x:10000,z:10000} }, .05);
  assert(Math.hypot(moving.vx,moving.vz)<=22);
  assert(Math.hypot(moving.x-boat.x,moving.z-boat.z)<=22*.05+.001);
  const island=state.islands[0];
  Object.assign(boat,{x:island.x+island.radius+3.25,z:island.z,vx:-20,vz:0});
  const collision=predict!(state,boat,{seq:3,throttle:0,turn:0},.05);
  assert(Math.hypot(collision.x-island.x,collision.z-island.z)>=island.radius+3.2-.001);
  Object.assign(boat,{x:0,z:0,vx:12,vz:4});
  assert.equal(JSON.stringify(state),before);
});

const port=8794;
const child=spawn('npm',['run','server'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:'pipe'});
const sockets:WebSocket[]=[];
try {
  for(let i=0;i<100;i++) {
    try { if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {}
    await new Promise(r=>setTimeout(r,50));
  }
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws); await once(ws,'open');
  let state:GameState|undefined;
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='state')state=m.state;});
  ws.send(JSON.stringify({type:'join',nickname:'Production',mode:'battle',difficulty:'easy',create:true,testDuration:1}));
  while(!state)await new Promise(r=>setTimeout(r,20));
  await test('production ignores external testDuration even for a created room',()=>assert.equal(state!.duration,180));
  const tick=state.tick;
  ws.send(JSON.stringify({type:'debug',command:'fastEnd'}));
  await new Promise(r=>setTimeout(r,120));
  await test('production debug commands cannot fast-forward the round',()=> {assert(state!.tick>tick);assert(state!.now<5);assert.equal(state!.ended,false);});
  ws.send(JSON.stringify({type:'input',input:{seq:1,throttle:1,turn:0}}));
  while(state!.boats.find(b=>b.name==='Production')!.vz===0)await new Promise(r=>setTimeout(r,20));
  ws.send(JSON.stringify({type:'input',input:{seq:2,throttle:0,turn:0,dragTarget:null,stop:true}}));
  while(state!.boats.find(b=>b.name==='Production')!.lastInputSeq<2)await new Promise(r=>setTimeout(r,20));
  const stopped={...state!.boats.find(b=>b.name==='Production')!};
  await new Promise(r=>setTimeout(r,160));
  await test('production authority has zero motion after touch release',()=> {
    const boat=state!.boats.find(b=>b.name==='Production')!;
    assert.deepEqual([boat.x,boat.z,boat.vx,boat.vz],[stopped.x,stopped.z,0,0]);
  });
} finally { for(const ws of sockets)ws.close(); child.kill(); }
if(failures.length) { console.error('TOUCH_STOP_TEST_FAIL',failures);process.exitCode=1; }
else console.log('TOUCH_STOP_TEST_PASS');
