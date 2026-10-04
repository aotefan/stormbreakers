import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { addBoat, createGameState, stepGame } from '../shared/simulation';
import type { Difficulty } from '../shared/protocol';

const originalRandom=Math.random;
let seed=123456;
Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const evidence:unknown[]=[];
try {
  for(let round=0;round<20;round++) {
    const s=createGameState({roomCode:'SPAWN',mode:'battle',aiCount:6});
    for(const a of s.boats) {
      assert(s.islands.every(i=>Math.hypot(a.x-i.x,a.z-i.z)>i.radius+5),'spawn must clear islands');
      assert(s.boats.every(b=>a===b||Math.hypot(a.x-b.x,a.z-b.z)>=18),'ships must start visibly separated');
    }
  }
  const totals:Record<string,number>={};
  for(const difficulty of ['easy','normal','hard'] as Difficulty[]) {
    const s=createGameState({roomCode:'DUEL',mode:'battle',aiCount:0});s.islands=[];s.chests=[];
    const human=addBoat(s,{name:'Captain',playerId:'human',ai:false});Object.assign(human,{x:0,z:0,hp:100000,maxHp:100000});
    const bot=addBoat(s,{name:'Hunter',ai:true});Object.assign(bot,{x:-38,z:0,angle:0});
    let shots=0,hits=0,contact=0,longestContact=0,travel=0;
    for(let frame=0;frame<60*60;frame++) {
      const before={x:bot.x,z:bot.z};stepGame(s,1/60,new Map([['human',{seq:frame,throttle:0,turn:0,stop:true}]]),difficulty);
      travel+=Math.hypot(bot.x-before.x,bot.z-before.z);
      shots+=s.events.filter(e=>e.type==='fire'&&e.boatId===bot.id).length;
      hits+=s.events.filter(e=>e.type==='hit'&&e.boatId===bot.id&&e.targetId===human.id).length;
      contact=Math.hypot(bot.x-human.x,bot.z-human.z)<14?contact+1/60:0;longestContact=Math.max(longestContact,contact);
    }
    evidence.push({difficulty,shots,hits,travel,longestContact});totals[difficulty]=shots;
    assert(travel>160,`${difficulty}: enemy must keep manoeuvring`);
    assert(longestContact<3,`${difficulty}: enemy must break close contact`);
    assert(shots>=3&&hits>=1,`${difficulty}: enemy must attack and land shots`);
  }
  assert(totals.hard>totals.normal&&totals.normal>totals.easy,'higher difficulty must increase attack cadence');
  for(const difficulty of ['easy','normal','hard'] as Difficulty[]) {
    const s=createGameState({roomCode:'FLEET',mode:'battle',aiCount:5});
    const human=addBoat(s,{name:'Captain',playerId:'human',ai:false,replaceAi:true});human.hp=human.maxHp=100000;
    const stats=new Map(s.boats.filter(b=>b.ai).map(b=>[b.id,{name:b.name,shots:0,travel:0,idle:0,maxIdle:0,contact:0,maxContact:0}]));
    for(let frame=0;frame<80*60;frame++) {
      const before=s.boats.map(b=>({x:b.x,z:b.z}));stepGame(s,1/60,new Map(),difficulty);
      s.boats.forEach((b,i)=>{const stat=stats.get(b.id);if(!stat)return;
        stat.travel+=Math.hypot(b.x-before[i].x,b.z-before[i].z);
        stat.idle=b.hp>0&&Math.hypot(b.vx,b.vz)<.5?stat.idle+1/60:0;stat.maxIdle=Math.max(stat.maxIdle,stat.idle);
        stat.contact=b.hp>0&&Math.hypot(b.x-human.x,b.z-human.z)<14?stat.contact+1/60:0;stat.maxContact=Math.max(stat.maxContact,stat.contact);
      });
      for(const event of s.events)if(event.type==='fire'&&stats.has(event.boatId))stats.get(event.boatId)!.shots++;
    }
    evidence.push({fleet:difficulty,boats:[...stats.values()]});
    for(const stat of stats.values()) {
      assert(stat.travel>120&&stat.maxIdle<3,`${difficulty} ${stat.name}: every enemy must move and escape obstacles`);
      assert(stat.maxContact<4,`${difficulty} ${stat.name}: must not glue to the player`);
      assert(stat.shots>=2,`${difficulty} ${stat.name}: every enemy must attack`);
    }
  }
  for(const hz of [20,60,120]) {
    const s=createGameState({roomCode:'ISLAND',mode:'battle',aiCount:0});s.chests=[];s.islands=[{id:'barrier',x:0,z:0,radius:10}];
    const human=addBoat(s,{name:'Captain',playerId:'human',ai:false});Object.assign(human,{x:40,z:0,hp:100000,maxHp:100000});
    const bot=addBoat(s,{name:'Navigator',ai:true});Object.assign(bot,{x:-13.21,z:0,angle:Math.PI/2});
    let longestIdle=0,idle=0;const points=[];
    for(let frame=0;frame<40*hz;frame++) {
      stepGame(s,1/hz,new Map(),'normal');
      idle=Math.hypot(bot.vx,bot.vz)<.6?idle+1/hz:0;longestIdle=Math.max(longestIdle,idle);
      if(frame%hz===0)points.push({x:bot.x,z:bot.z});
      assert(Math.hypot(bot.x,bot.z)>=13.19,'AI cannot sail through islands');
    }
    evidence.push({hz,longestIdle,end:{x:bot.x,z:bot.z},points});
    assert(bot.x>5,`${hz}Hz: blocked enemy must navigate around island`);
    assert(longestIdle<3,`${hz}Hz: enemy must not stay stuck`);
  }
  const journeys=[];
  for(const hz of [20,60,120]) {
    const s=createGameState({roomCode:'FPS',mode:'battle',aiCount:0});s.islands=[];s.chests=[];
    const boat=addBoat(s,{name:'Captain',playerId:'human',ai:false});Object.assign(boat,{x:0,z:-40,angle:0});
    for(let i=0;i<5*hz;i++)stepGame(s,1/hz,new Map([['human',{seq:i,throttle:.55,turn:0}]]),'normal');
    journeys.push(boat.z+40);
  }
  assert(Math.max(...journeys)/Math.min(...journeys)<1.07,'movement must not change materially with display refresh rate');
  evidence.push({frameRateTravel:journeys});
  for(const mode of ['battle','storm','treasure'] as const) {
    const s=createGameState({roomCode:'ROUND',mode,aiCount:4});
    for(let i=0;i<3601;i++)stepGame(s,.05,new Map(),'normal');
    assert(s.ended&&s.timeLeft===0&&s.duration===180,'each mode must finish at the default 180 seconds');
    assert(s.winnerId===[...s.boats].sort((a,b)=>b.score-a.score)[0].id,'winner must be the highest scorer');
    evidence.push({fullRound:mode,duration:s.duration,winner:s.winnerName});
  }
  console.log('AI_BEHAVIOR_PASS',JSON.stringify(evidence.map((item:any)=>({...item,points:item.points?.length}))));
} finally {
  Math.random=originalRandom;mkdirSync('test-output/ai-revision',{recursive:true});
  writeFileSync('test-output/ai-revision/behavior.json',JSON.stringify(evidence,null,2));
}
