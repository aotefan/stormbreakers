import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='test-output/rapid-damage',base='http://127.0.0.1:8796';
await mkdir(out,{recursive:true});
const source=await readFile('scripts/playthrough.mjs','utf8');
const read=source.slice(source.indexOf('const read=')+11,source.indexOf('\ntry {')).trim().replace(/;$/,'');
const child=spawn('node',['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'8796',NODE_ENV:'test'},stdio:'pipe'});
const report={},errors=[],sockets=[];let browser;
async function wait(check,label,timeout=18000){const end=Date.now()+timeout;while(Date.now()<end){const r=await check();if(r)return r;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout: '+label);}
async function context(options={}) {
 const c=await browser.newContext(options);
 await c.addInitScript(()=>{window.qa={states:[],events:[],sockets:[],inputs:[],pointers:[]};for(const type of['pointerdown','pointerup','pointercancel'])document.addEventListener(type,e=>qa.pointers.push({type,id:e.pointerId,target:e.target.closest('[data-testid]')?.dataset.testid}),true);const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);qa.sockets.push(this);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='joined')qa.joined=m;if(m.type==='state'){qa.states.push(m.state);qa.state=m.state;qa.events.push(...m.state.events.map(e=>({...e,tick:m.state.tick,at:m.state.now})));}});}send(data){const m=JSON.parse(data);if(m.type==='input')qa.inputs.push(m.input);super.send(data);}};});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto(base);return [c,p];
}
async function attach(p){await p.evaluate(`window.readGame=${read}`);await wait(()=>p.evaluate(()=>!!readGame()),'scene ready');}
const own=p=>p.evaluate(()=>{const g=readGame();return g.s.boats.find(b=>b.id===g.id);});
const fired=(p,side)=>p.evaluate(side=>qa.events.filter(e=>e.type==='fire'&&e.boatId===qa.joined.boatId&&(!side||e.side===side)).length,side);
async function allDamage(p){return p.evaluate(()=>{const g=readGame();return g.s.boats.map(b=>({id:b.id,hp:b.hp,damage:g.r.boats.get(b.id)?.group.userData.damage.value,hits:b.hullHits}));});}
async function shot(p,key){const count=await fired(p);await p.keyboard.press(key);await wait(async()=>await fired(p)>count,'keyboard shot');}
async function imageOf(p,name,targetId){await p.evaluate(id=>{const g=readGame(),b=g.s.boats.find(b=>b.id===(id||g.id));g.r.camera.position.set(b.x+24,14,b.z+26);g.r.camera.lookAt(b.x,7,b.z);},targetId);await p.waitForTimeout(80);await p.screenshot({path:`${out}/${name}.png`});}

try {
 await wait(async()=>{try{return(await fetch(base+'/healthz')).ok;}catch{return false;}},'test server');
 browser=await chromium.launch({channel:'chrome',headless:false});
 const [ac,a]=await context({viewport:{width:1440,height:900},hasTouch:true}),[bc,b]=await context({viewport:{width:1280,height:800}});
 await a.getByTestId('nickname').fill('试玩船长');await a.locator('select').nth(0).selectOption('treasure');await a.getByTestId('create-room').click();await attach(a);
 const room=await a.evaluate(()=>readGame().s.roomCode);
 await b.getByTestId('nickname').fill('海风船长');await b.getByTestId('room-code').fill(room);await b.getByTestId('join-room').click();await attach(b);
 for(let i=0;i<2;i++){const ws=new WebSocket(base.replace('http','ws')+'/ws');sockets.push(ws);await once(ws,'open');ws.send(JSON.stringify({type:'join',nickname:'QA'+i,roomCode:room,mode:'treasure',difficulty:'easy'}));}
 await wait(()=>a.evaluate(()=>readGame().s.boats.every(b=>!b.ai)),'AI seats replaced');
 // Test-only fixture positions the two ships. HP, hits, repairs and score use normal inputs and authority.
 await a.evaluate(()=>qa.sockets[0].send(JSON.stringify({type:'debug',command:'placeDuel'})));
 await wait(async()=>Math.abs((await own(b)).z-14)<.01,'duel position');
 const aid=(await own(a)).id,bid=(await own(b)).id;
 await shot(a,'e');await wait(async()=>(await own(b)).hp===66,'first hit');
 for(const p of[a,b])assert((await allDamage(p)).every(v=>Math.abs(v.damage-(1-v.hp/100))<.001),'every rendered ship matches health');
 await imageOf(b,'damage-66');report.firstHit=await allDamage(b);
 await wait(async()=>(await own(a)).cooldownRight===0,'reload');await shot(a,'e');await wait(async()=>(await own(b)).hp===32,'second hit');
 await imageOf(b,'damage-32');
 await b.keyboard.press('r');await wait(async()=>(await own(b)).hp===62,'repair');
 assert(Math.abs((await allDamage(b)).find(v=>v.id===bid).damage-.38)<.001);await imageOf(b,'repaired-62');report.repair={before:32,after:62};
 await a.keyboard.down('e');await wait(async()=>(await own(b)).hp===0,'held fire sinks target');await a.keyboard.up('e');
 assert((await own(a)).score>=100);await imageOf(b,'sinking');
 await wait(async()=>(await own(b)).hp===100,'five-second respawn',7000);assert.equal((await own(b)).hullHits.length,0);report.sinkAndRespawn=true;
 // Continue below with actual navigation to a naturally generated large supply crate.
 await a.evaluate(()=>{window.worldPoint=(x,z)=>{const g=readGame(),v=g.r.boats.get(g.id).group.position.clone().set(x,0,z).project(g.r.camera),r=g.r.renderer.domElement.getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};};});
 async function collectLarge(){
  const route=await a.evaluate(()=>{
   const g=readGame(),own=g.s.boats.find(b=>b.id===g.id),nodes=[own,...g.s.chests.filter(c=>c.kind==='large')];const targets=nodes.length;
   for(const island of g.s.islands)for(let i=0;i<12;i++){const angle=i*Math.PI/6;nodes.push({x:island.x+Math.sin(angle)*(island.radius+10),z:island.z+Math.cos(angle)*(island.radius+10)});}
   const clear=(a,b)=>g.s.islands.every(i=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((i.x-a.x)*dx+(i.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(a.x+t*dx-i.x,a.z+t*dz-i.z)>i.radius+5;});
   const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set();dist[0]=0;
   for(let j=0;j<nodes.length;j++){let u=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u<0||dist[i]<dist[u]))u=i;if(u<0||!Number.isFinite(dist[u]))break;visited.add(u);for(let v=0;v<nodes.length;v++)if(v!==u&&clear(nodes[u],nodes[v])){const d=dist[u]+Math.hypot(nodes[u].x-nodes[v].x,nodes[u].z-nodes[v].z);if(d<dist[v]){dist[v]=d;prev[v]=u;}}}
   let best=1;for(let i=2;i<targets;i++)if(dist[i]<dist[best])best=i;if(!Number.isFinite(dist[best]))return null;const path=[],id=nodes[best].id;for(let i=best;i>0;i=prev[i])path.unshift({x:nodes[i].x,z:nodes[i].z});return{id,path};
  });
  assert(route,'reachable large crate');let p=await a.evaluate(b=>worldPoint(b.x,b.z),await own(a));await a.mouse.move(p.x,p.y);await a.mouse.down();
  try{for(const target of route.path){const end=Date.now()+16000;let reached=false;while(Date.now()<end){const boat=await own(a);if(boat.weaponLevel===3)return;if(Math.hypot(boat.x-target.x,boat.z-target.z)<4){reached=true;break;}p=await a.evaluate(t=>worldPoint(t.x,t.z),target);await a.mouse.move(p.x,p.y);await a.waitForTimeout(70);}assert(reached,'waypoint reached');}await wait(async()=>(await own(a)).weaponLevel===3,'large crate pickup');}finally{await a.mouse.up();}
 }
 await collectLarge();report.pickup=await own(a);assert.equal(report.pickup.salvoCount,5);
 await wait(()=>b.evaluate(id=>readGame().s.boats.find(b=>b.id===id).weaponLevel===3,aid),'remote power');
 const before={left:await fired(a,'left'),right:await fired(a,'right')};
 await a.keyboard.down('q');await a.keyboard.down('e');await a.waitForTimeout(2150);
 report.heldVolleys={left:await fired(a,'left')-before.left,right:await fired(a,'right')-before.right};
 assert(report.heldVolleys.left>=5&&report.heldVolleys.right>=5);
 await a.screenshot({path:`${out}/inferno-live.png`});await a.keyboard.up('q');await a.keyboard.up('e');await a.waitForTimeout(150);
 const released=await fired(a);await a.waitForTimeout(700);assert.equal(await fired(a),released,'release stops continuous fire');report.releaseStops=true;
 await a.keyboard.down('q');await a.waitForTimeout(400);await a.evaluate(()=>window.dispatchEvent(new Event('blur')));await a.keyboard.up('q');await a.waitForTimeout(150);const blurred=await fired(a);await a.waitForTimeout(500);assert.equal(await fired(a),blurred,'blur clears held fire');report.blurStops=true;
 report.touch=[];
 for(const [name,viewport]of[['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
  await a.setViewportSize(viewport);await a.waitForTimeout(120);const cdp=await ac.newCDPSession(a),boat=await own(a),point=await a.evaluate(b=>worldPoint(b.x,b.z),boat);
  assert(await a.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',point),'own ship exposed on touch layout');
  const moving={x:point.x+48,y:point.y+18,id:1};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moving]});
  await wait(async()=>Math.hypot((await own(a)).vx,(await own(a)).vz)>1,'touch sailing');
  const button=await a.getByTestId('fire-right').boundingBox(),finger={x:button.x+button.width/2,y:button.y+button.height/2,id:2},shots=await fired(a,'right');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moving,finger]});await a.waitForTimeout(1150);
  const count=await fired(a,'right')-shots;assert(count>=2,'second finger holds rapid fire while dragging');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[finger]});await a.waitForTimeout(150);const stop=await fired(a,'right');await a.waitForTimeout(450);
  report.touchEvents=await a.evaluate(()=>({pointers:qa.pointers.slice(-8),input:qa.inputs.at(-1)}));assert.equal(await fired(a,'right'),stop,'lifting the firing finger stops shooting');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(async()=>{const x=await own(a);return x.vx===0&&x.vz===0;},'drag release stops');
  assert(await a.evaluate(()=>scrollY===0&&document.documentElement.scrollWidth<=innerWidth),'no scroll or overflow');
  await a.screenshot({path:`${out}/touch-${name}.png`});report.touch.push({name,volleys:count,releaseStops:true,dragStops:true});await cdp.detach();
 }
 const sa=await a.evaluate(()=>qa.states),sb=await b.evaluate(()=>qa.states);assert(sa.some(x=>sb.some(y=>x.tick===y.tick&&JSON.stringify(x)===JSON.stringify(y))));report.identicalAuthority=true;
 await wait(async()=>(await own(a)).weaponLevel===0,'buff expires',18000);assert.equal((await own(a)).salvoCount,1);report.expiry=true;
 await bc.close();await wait(()=>a.evaluate(id=>readGame().s.boats.find(b=>b.id===id).ai,bid),'AI takeover');report.aiTakeover=true;
 await ac.close();
 // Practice uses actual controls and AI combat; check visual damage on every ship each frame.
 const [sc,p]=await context({viewport:{width:1440,height:900}});await p.locator('select').nth(1).selectOption('hard');await p.getByTestId('practice').click();await attach(p);
 await p.evaluate(()=>{window.practiceQa={ticks:-1,damaged:[],mismatches:[],events:[]};const observe=()=>{const g=readGame();if(g&&g.s.tick!==practiceQa.ticks){practiceQa.ticks=g.s.tick;for(const b of g.s.boats){const d=g.r.boats.get(b.id)?.group.userData.damage.value;if(b.hp<100)practiceQa.damaged.push({id:b.id,ai:b.ai,hp:b.hp,damage:d});if(d!==undefined&&Math.abs(d-(1-b.hp/100))>.001)practiceQa.mismatches.push({hp:b.hp,d});}practiceQa.events.push(...g.s.events);}requestAnimationFrame(observe);};requestAnimationFrame(observe);});
 await p.keyboard.down('q');await p.keyboard.down('e');await p.waitForTimeout(18000);await p.keyboard.up('q');await p.keyboard.up('e');
 await p.getByTestId('pause').click();await p.waitForTimeout(100);const frozen=await p.evaluate(()=>{const g=readGame();return{now:g.s.now,boats:g.s.boats,water:g.r.water.material.uniforms.uTime.value};});await p.waitForTimeout(500);assert.deepEqual(await p.evaluate(()=>{const g=readGame();return{now:g.s.now,boats:g.s.boats,water:g.r.water.material.uniforms.uTime.value};}),frozen);
 report.practice=await p.evaluate(()=>({damaged:practiceQa.damaged.slice(-30),mismatches:practiceQa.mismatches,eventTypes:[...new Set(practiceQa.events.map(e=>e.type))]}));assert(report.practice.damaged.some(b=>b.ai),'AI damaged in actual combat');assert.equal(report.practice.mismatches.length,0);await p.screenshot({path:`${out}/practice-damage.png`});await sc.close();
 assert.equal(errors.length,0,errors.join('\n'));console.log('RAPID_DAMAGE_PLAYTHROUGH_PASS',JSON.stringify(report));
}catch(e){console.error(e);report.failed=String(e);process.exitCode=1;}
finally{for(const ws of sockets)ws.close();await writeFile(`${out}/browser.json`,JSON.stringify({report,errors},null,2));await browser?.close();child.kill();}
