import assert from 'node:assert/strict';
import { writeFileSync,mkdirSync } from 'node:fs';
import { addBoat,createGameState,stepGame,SUPPLY_DURATION,SUPPLY_BOX_LIFETIME } from '../shared/simulation';

const evidence:unknown[]=[];
for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const side of ['left','right'] as const) {
  const s=createGameState({roomCode:'SIDE',mode:'battle',aiCount:0});s.islands=[];
  const b=addBoat(s,{name:'Captain',playerId:'p',ai:false});Object.assign(b,{x:0,z:-60,angle:heading});
  stepGame(s,.01,new Map([['p',{seq:1,throttle:0,turn:0,stop:true,fireLeft:side==='left',fireRight:side==='right'}]]),'normal');
  assert.equal(s.cannonballs.length,1,'one projectile by default');
  const ball=s.cannonballs[0],rightX=-Math.cos(heading),rightZ=Math.sin(heading),dot=ball.vx*rightX+ball.vz*rightZ;
  assert(side==='right'?dot>57:dot< -57,`${side} must be relative to the bow at heading ${heading}`);
  assert.equal(ball.damage,34);evidence.push({heading,side,vx:ball.vx,vz:ball.vz,damage:ball.damage});
}
const s=createGameState({roomCode:'POWER',mode:'battle',aiCount:0});s.islands=[];
const b=addBoat(s,{name:'Captain',playerId:'p',ai:false});Object.assign(b,{x:0,z:-60,angle:0});
const input={seq:0,throttle:0,turn:0,stop:true};
function step(seconds:number){for(let left=seconds;left>1e-6;left-=.05)stepGame(s,Math.min(.05,left),new Map([['p',input]]),'normal');}
function pickup(){s.chests.push({id:'test-supply-'+s.tick,x:b.x,z:b.z,expiresAt:s.now+30,kind:'normal'});step(.01);}
pickup();assert.equal(b.salvoCount,2);assert(Math.abs(b.powerUntil-s.now-SUPPLY_DURATION)<.001);
stepGame(s,.01,new Map([['p',{...input,seq:2,fireRight:true}]]),'normal');
assert.equal(s.cannonballs.length,2);assert(s.cannonballs.every(ball=>ball.damage===41&&ball.vx<0));
const target=addBoat(s,{name:'Target',playerId:'target',ai:false});Object.assign(target,{x:-13,z:-60,angle:0});
step(.35);assert.equal(target.hp,18,'two powered hits each deal 41 damage');
const firstExpiry=b.powerUntil;step(3);pickup();assert.equal(b.salvoCount,3);assert(b.powerUntil>firstExpiry);
pickup();assert.equal(b.salvoCount,5,'third pickup grants five explosive rounds');
pickup();assert.equal(b.salvoCount,5,'extra crates cannot exceed maximum power');
b.cooldownLeft=0;b.cooldownRight=0;s.cannonballs=[];
stepGame(s,.01,new Map([['p',{...input,seq:3,fireLeft:true}]]),'normal');assert.equal(s.cannonballs.length,5);
assert(s.cannonballs.every(ball=>ball.damage===68&&ball.explosive));
const now=s.now,until=b.powerUntil;s.running=false;stepGame(s,20,new Map(),'normal');assert.equal(s.now,now);assert.equal(b.powerUntil,until);s.running=true;
step(SUPPLY_DURATION+.1);assert.equal(b.salvoCount,1);assert.equal(b.powerUntil,0);
s.cannonballs=[];stepGame(s,.01,new Map([['p',{...input,seq:4,fireLeft:true}]]),'normal');assert.equal(s.cannonballs.length,1);assert.equal(s.cannonballs[0].damage,34);
const id=s.chests[0].id,expires=s.chests[0].expiresAt;assert(expires-s.now<=SUPPLY_BOX_LIFETIME+.01);step(expires-s.now+.1);assert(!s.chests.some(c=>c.id===id),'expired sea crates disappear');assert.equal(s.chests.length,2,'sea crates replenish');
evidence.push({poweredSalvos:[2,3,5],poweredDamage:[41,51,68],baseDamage:34,powerSeconds:SUPPLY_DURATION,crateSeconds:SUPPLY_BOX_LIFETIME,pauseFreezesPower:true,expiryRestoresDefault:true});
mkdirSync('test-output/supply-revision',{recursive:true});writeFileSync('test-output/supply-revision/rules.json',JSON.stringify(evidence,null,2));console.log('FIREPOWER_RULES_PASS',JSON.stringify(evidence));
