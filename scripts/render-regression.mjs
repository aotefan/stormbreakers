import { chromium,devices } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='test-output/ai-revision',base='http://127.0.0.1:8787';
const play=await readFile('scripts/playthrough.mjs','utf8');
const read=play.slice(play.indexOf('const read=')+11,play.indexOf('\ntry {')).trim().replace(/;$/,'');
const browser=await chromium.launch({channel:'chrome',headless:false});
const report={},errors=[];
async function attach(page){await page.evaluate(`window.readGame=${read}`);page.on('pageerror',e=>errors.push(e.message));}
try {
 const solo=await browser.newContext({viewport:{width:1440,height:900}}),p=await solo.newPage();await p.goto(base);await p.getByTestId('practice').click();await p.waitForTimeout(500);await attach(p);
 const baseMemory=await p.evaluate(()=>({...readGame().r.renderer.info.memory})),samples=[];
 await p.keyboard.press('q');await p.getByTestId('pause').click();await p.waitForTimeout(100);
 const frozen=await p.evaluate(()=>{const g=readGame();return {time:g.s.now,particles:g.r.particles.map(p=>({life:p.life,pos:p.mesh.position.toArray()})),water:g.r.water.material.uniforms.uTime.value};});
 assert(frozen.particles.length>0,'pause test includes active cannon smoke');await p.waitForTimeout(500);
 assert.deepEqual(await p.evaluate(()=>{const g=readGame();return {time:g.s.now,particles:g.r.particles.map(p=>({life:p.life,pos:p.mesh.position.toArray()})),water:g.r.water.material.uniforms.uTime.value};}),frozen);
 await p.getByTestId('pause').click();
 for(let i=0;i<7;i++){await p.keyboard.press('q');await p.keyboard.press('e');await p.waitForTimeout(3150);samples.push(await p.evaluate(()=>({...readGame().r.renderer.info.memory})));}
 assert(samples.every(m=>m.geometries<baseMemory.geometries+160),'expired effects must release their GPU geometry');
 report.resources={baseMemory,samples};report.pauseIncludesParticles=true;
 await p.getByTestId('pause').click();await p.waitForTimeout(100);
 await p.screenshot({path:`out/desktop.png`.replace('out/',out+'/')});
 await p.evaluate(()=>{const g=readGame();const own=g.s.boats.find(b=>b.id===g.id);const b=own.hp>0?own:g.s.boats.find(b=>b.hp>0);g.r.camera.position.set(b.x+Math.sin(b.angle)*25+Math.cos(b.angle)*13,14,b.z+Math.cos(b.angle)*25-Math.sin(b.angle)*13);g.r.camera.lookAt(b.x,8,b.z);});await p.waitForTimeout(150);await p.screenshot({path:`${out}/ship-closeup.png`});await solo.close();
 const a=await browser.newContext({viewport:{width:1280,height:800}}),b=await browser.newContext({viewport:{width:1100,height:760}});const pa=await a.newPage(),pb=await b.newPage();await pa.goto(base);await pa.getByTestId('nickname').fill('孙警醒');await pa.getByTestId('create-room').click();await pa.waitForTimeout(500);await attach(pa);
 const room=await pa.evaluate(()=>readGame().s.roomCode);await pb.goto(base);await pb.getByTestId('nickname').fill('海风 Captain');await pb.getByTestId('room-code').fill(room);await pb.getByTestId('join-room').click();await pb.waitForTimeout(500);await attach(pb);
 await pa.waitForFunction(()=>{const g=readGame();return [...g.r.boats.values()].some(b=>b.group.getObjectByName('warship-canvas').material.map.userData.captainName==='海风 Captain');});
 const target=await pa.evaluate(()=>{const g=readGame(),b=g.s.boats.find(b=>b.name==='海风 Captain'),r=g.r.boats.get(b.id);return {id:b.id,uuid:r.group.uuid};});
 report.multiplayerNames=await Promise.all([pa,pb].map(p=>p.evaluate(()=>[...readGame().r.boats.values()].map(b=>b.group.getObjectByName('warship-canvas').material.map.userData.captainName))));
 await b.close();await pa.waitForFunction(id=>{const g=readGame();return g.r.boats.get(id).group.getObjectByName('warship-canvas').material.map.userData.captainName==='海风 Captain (AI)';},target.id);
 assert.equal(await pa.evaluate(id=>readGame().r.boats.get(id).group.uuid,target.id),target.uuid,'AI takeover updates the existing ship');report.aiTakeoverName=true;await a.close();
 const mobile=await browser.newContext({...devices['iPhone 14']}),pm=await mobile.newPage();await pm.goto(base);await pm.getByTestId('practice').click();await pm.waitForTimeout(1000);await pm.getByTestId('pause').click();await pm.screenshot({path:`${out}/mobile-portrait.png`});await mobile.close();
 assert.equal(errors.length,0);console.log('RENDER_REGRESSION_PASS',report);
}catch(error){console.error(error);process.exitCode=1;}
finally{await writeFile(`${out}/render-regression.json`,JSON.stringify({report,errors},null,2));await browser.close();}
