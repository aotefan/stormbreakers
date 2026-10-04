import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='test-output/ai-revision';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const report=[],errors=[];
const read=()=>{
 const el=document.querySelector('[data-testid="storm-scene"]');if(!el)return null;
 let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))],root=f;while(root.return)root=root.return;
 if(root.stateNode.current!==root&&f.alternate)f=f.alternate;
 let s,id,r;for(;f;f=f.return){if(f.memoizedProps?.state){s=f.memoizedProps.state;id=f.memoizedProps.boatId;}for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.camera)r=h.memoizedState.current;}
 return s&&r?{s,id,r}:null;
};
try {
 for(const [difficulty,mode,seconds]of [['easy','battle',35],['normal','battle',60],['hard','battle',45],['normal','storm',20],['normal','treasure',20]]) {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8787');await page.getByTestId('nickname').fill('孙警醒');
  await page.locator('select').nth(0).selectOption(mode);await page.locator('select').nth(1).selectOption(difficulty);await page.getByTestId('practice').click();await page.waitForTimeout(500);
  await page.evaluate(`window.readGame=${read.toString()}`);
  await page.evaluate(()=>{
   window.qaPlay={boats:{},events:[],lastTick:-1,frames:[],lastFrame:0};
   const observe=t=>{const q=qaPlay,g=readGame();if(g){
    if(q.lastFrame&&q.frames.length<600)q.frames.push(t-q.lastFrame);q.lastFrame=t;
    if(q.lastTick!==g.s.tick){q.lastTick=g.s.tick;
     for(const b of g.s.boats){const old=q.boats[b.id]??{name:b.name,ai:b.ai,travel:0,maxIdle:0,idle:0,x:b.x,z:b.z,now:g.s.now,minHp:100};const dt=g.s.now-old.now;
      const move=Math.hypot(b.x-old.x,b.z-old.z);if(move<30)old.travel+=move;
      old.idle=b.hp>0&&Math.hypot(b.vx,b.vz)<.5?old.idle+dt:0;old.maxIdle=Math.max(old.idle,old.maxIdle);old.minHp=Math.min(old.minHp,b.hp);Object.assign(old,{x:b.x,z:b.z,now:g.s.now,hp:b.hp,score:b.score});q.boats[b.id]=old;}
     q.events.push(...g.s.events.map(e=>({...e,at:g.s.now})));
    }
   }requestAnimationFrame(observe);};requestAnimationFrame(observe);
  });
  const held=new Set();const setKey=async(k,want)=>{if(want&&!held.has(k)){await page.keyboard.down(k);held.add(k);}else if(!want&&held.has(k)){await page.keyboard.up(k);held.delete(k);}};
  const start=Date.now();let nextLog=10,paused=false;
  while(Date.now()-start<seconds*1000) {
   const g=await page.evaluate(()=>{const g=readGame();return {state:g.s,id:g.id};});
   const own=g.state.boats.find(b=>b.id===g.id),enemies=g.state.boats.filter(b=>b.ai&&b.hp>0).sort((a,b)=>Math.hypot(a.x-own.x,a.z-own.z)-Math.hypot(b.x-own.x,b.z-own.z));
   const enemy=enemies[0];
   if(own.hp>0&&enemy){const d=Math.hypot(enemy.x-own.x,enemy.z-own.z),flight=d/58,bearing=Math.atan2(enemy.x+enemy.vx*flight-own.x,enemy.z+enemy.vz*flight-own.z);
    const norm=a=>Math.atan2(Math.sin(a),Math.cos(a));const side=norm(bearing-own.angle)>0?'q':'e';
    const target=d>63?bearing:bearing+(side==='q'?-Math.PI/2:Math.PI/2),delta=norm(target-own.angle);
    await setKey('a',delta>.08);await setKey('d',delta<-.08);await setKey('w',d>63||(g.state.now%12<5&&Math.abs(delta)<.35));
    if(d<75&&Math.abs(Math.abs(norm(bearing-own.angle))-Math.PI/2)<.16&&own[side==='q'?'cooldownLeft':'cooldownRight']<=0)await page.keyboard.press(side);
    if(own.hp<64&&own.repairCooldown<=0)await page.keyboard.press('r');
    if(d>75&&own.boostCooldown<=0&&Math.abs(delta)<.2)await page.keyboard.press('Space');
   }else for(const k of [...held])await setKey(k,false);
   if(!paused&&g.state.now>12){for(const k of [...held])await setKey(k,false);await page.getByTestId('pause').click();await page.waitForTimeout(100);
    const before=await page.evaluate(()=>{const g=readGame();return {now:g.s.now,tick:g.s.tick,water:g.r.water.material.uniforms.uTime.value};});await page.waitForTimeout(500);
    const after=await page.evaluate(()=>{const g=readGame();return {now:g.s.now,tick:g.s.tick,water:g.r.water.material.uniforms.uTime.value};});assert.deepEqual(after,before,'pause freezes simulation and ocean');await page.getByTestId('pause').click();paused=true;
   }
   const elapsed=(Date.now()-start)/1000;if(elapsed>nextLog){console.log('PLAY_PROGRESS',difficulty,mode,Math.round(g.state.now),{hp:own.hp,score:own.score,enemyPositions:enemies.map(b=>[b.name,Math.round(b.x),Math.round(b.z)])});nextLog+=10;}
   await page.waitForTimeout(120);
  }
  for(const k of [...held])await setKey(k,false);
  await page.getByTestId('pause').click();await page.waitForTimeout(100);
  const result=await page.evaluate(()=>{const g=readGame(),q=qaPlay;return {seconds:g.s.now,ended:g.s.ended,boats:Object.values(q.boats),events:q.events,frames:q.frames,shipNames:[...g.r.boats].map(([id,b])=>({id,name:b.group.userData.captainName,texture:b.group.getObjectByName('warship-canvas').material.map.userData.captainName})),gpu:(()=>{const gl=g.r.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);})()};});
  for(const name of result.shipNames)assert.equal(name.name,name.texture);
  assert(result.boats.filter(b=>b.ai).every(b=>b.travel>20&&b.maxIdle<4),'every enemy sails without remaining stuck');
  assert(result.events.some(e=>e.type==='fire'),'combat produces cannon fire');
  await page.screenshot({path:`${out}/play-${difficulty}-${mode}.png`});
  if(difficulty==='normal'&&mode==='battle'){
   await page.evaluate(()=>{const g=readGame(),b=g.s.boats.find(b=>b.id===g.id);g.r.camera.position.set(b.x+22,15,b.z+28);g.r.camera.lookAt(b.x,7,b.z);});await page.waitForTimeout(150);await page.screenshot({path:`${out}/captain-sails-and-water.png`});
  }
  report.push({difficulty,mode,...result});console.log('PLAY_COMPLETE',difficulty,mode,{seconds:result.seconds,events:result.events.length,boats:result.boats});await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PLAYTHROUGH_PASS');
}catch(error){console.error(error);process.exitCode=1;}
finally{await writeFile(`${out}/playthrough.json`,JSON.stringify({report,errors},null,2));await browser.close();}
