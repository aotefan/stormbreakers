import { chromium } from 'playwright';
import WebSocket from 'ws';
import { once } from 'node:events';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='test-output/supply-revision';await mkdir(out,{recursive:true});
const source=await readFile('scripts/playthrough.mjs','utf8');const read=source.slice(source.indexOf('const read=')+11,source.indexOf('\ntry {')).trim().replace(/;$/,'');
const browser=await chromium.launch({channel:'chrome',headless:false}),sockets=[],report={},errors=[];
async function wait(check,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){const result=await check();if(result)return result;await new Promise(r=>setTimeout(r,80));}throw Error('Timeout '+label);}
try {
 const a=await browser.newContext({viewport:{width:1440,height:900}}),b=await browser.newContext({viewport:{width:1100,height:760}});
 for(const c of [a,b])await c.addInitScript(()=>{window.qaStates=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')qaStates.push(m.state);});}};});
 const pa=await a.newPage(),pb=await b.newPage();for(const p of [pa,pb])p.on('pageerror',e=>errors.push(e.message));
 await pa.goto('http://127.0.0.1:8787');await pa.locator('select').nth(0).selectOption('treasure');await pa.locator('select').nth(1).selectOption('easy');await pa.getByTestId('create-room').click();await pa.waitForTimeout(500);await pa.evaluate(`window.readGame=${read}`);
 const code=await pa.evaluate(()=>readGame().s.roomCode);await pb.goto('http://127.0.0.1:8787');await pb.getByTestId('nickname').fill('补给验证员');await pb.getByTestId('room-code').fill(code);await pb.getByTestId('join-room').click();await pb.waitForTimeout(400);await pb.evaluate(`window.readGame=${read}`);
 // Occupy the remaining seats so combat cannot invalidate a timer measurement.
 for(let i=0;i<2;i++){const ws=new WebSocket('ws://127.0.0.1:8787/ws');sockets.push(ws);await once(ws,'open');ws.send(JSON.stringify({type:'join',nickname:'QA Observer '+i,roomCode:code,mode:'treasure',difficulty:'easy'}));}
 await wait(()=>pa.evaluate(()=>readGame().s.boats.every(b=>!b.ai)),'four human seats');
 await pa.evaluate(()=>{
  window.worldPoint=(x,z)=>{const g=readGame(),v=g.r.boats.get(g.id).group.position.clone();v.set(x,0,z).project(g.r.camera);const rect=g.r.renderer.domElement.getBoundingClientRect();return {x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2};};
 });
 const own=()=>pa.evaluate(()=>{const g=readGame();return g.s.boats.find(b=>b.id===g.id);});
 async function sail(target,done){let boat=await own(),p=await pa.evaluate(({x,z})=>worldPoint(x,z),boat);await pa.mouse.move(p.x,p.y);await pa.mouse.down();const end=Date.now()+16000;
  try{while(Date.now()<end){if(await done())return;const p=await pa.evaluate(t=>worldPoint(t.x,t.z),target);await pa.mouse.move(p.x,p.y);await pa.waitForTimeout(75);}throw Error('drag did not reach target');}finally{await pa.mouse.up();}}
 const chest=await pa.evaluate(()=>{const g=readGame(),b=g.s.boats.find(b=>b.id===g.id);return [...g.s.chests].filter(c=>c.kind==='normal').filter(c=>g.s.islands.every(i=>{const dx=c.x-b.x,dz=c.z-b.z,length=Math.hypot(dx,dz),along=((i.x-b.x)*dx+(i.z-b.z)*dz)/length;return along<0||along>length||Math.abs((i.x-b.x)*dz-(i.z-b.z)*dx)/length>i.radius+5;})).sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z))[0];});
 assert(chest,'reachable supply crate');report.default=await own();assert.equal(report.default.salvoCount,1);
 await sail(chest,async()=>(await own()).salvoCount>1);await wait(()=>pa.getByTestId('weapon-status').textContent().then(t=>t.includes('+20%')),'powered HUD');report.pickup=await own();
 await pa.keyboard.press('q');await pa.keyboard.press('e');await pa.waitForTimeout(100);
 const firing=await pa.evaluate(()=>{const g=readGame(),b=g.s.boats.find(b=>b.id===g.id);return {boat:b,balls:g.s.cannonballs.filter(c=>c.ownerId===g.id)};});
 for(const side of ['left','right']) {
  const balls=firing.balls.filter(c=>c.side===side);assert(balls.length>=2,`${side} has powered salvo`);
  for(const ball of balls){const dot=ball.vx*-Math.cos(firing.boat.angle)+ball.vz*Math.sin(firing.boat.angle);assert(side==='right'?dot>0:dot<0);assert.equal(ball.damage,41);}
 }
 report.firing=firing;await pa.screenshot({path:`${out}/powered-salvo.png`});
 const remote=await wait(()=>pb.evaluate(id=>readGame().s.boats.find(b=>b.id===id)?.salvoCount>1,firing.boat.id),'remote sees power');report.remoteSeesPower=remote;
 await sail({x:72,z:-35},async()=>{const b=await own();return Math.hypot(b.x-72,b.z+35)<5;});
 const powerUntil=(await own()).powerUntil;report.powerUntil=powerUntil;
 await wait(async()=>{const b=await own();return b.powerUntil===0&&b.salvoCount===1&&b.hp>0;},'power expires while alive',22000);
 report.expired=await own();await pa.keyboard.press('e');await pa.waitForTimeout(100);
 const base=await pa.evaluate(()=>{const g=readGame();return g.s.cannonballs.filter(c=>c.ownerId===g.id&&c.side==='right');});assert.equal(base.length,1);assert.equal(base[0].damage,34);report.baseAfterExpiry=base;
 await pa.screenshot({path:`${out}/power-expired.png`});
 const sa=await pa.evaluate(()=>qaStates),sb=await pb.evaluate(()=>qaStates);assert(sa.some(a=>sb.some(b=>a.tick===b.tick&&JSON.stringify(a)===JSON.stringify(b))));report.identicalAuthority=true;
 assert.equal(errors.length,0);console.log('SUPPLY_PLAYTHROUGH_PASS',JSON.stringify(report));
}catch(e){console.error(e);process.exitCode=1;}
finally{for(const ws of sockets)ws.close();await writeFile(`${out}/browser.json`,JSON.stringify({report,errors},null,2));await browser.close();}
