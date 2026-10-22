import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const publicUrl = process.env.TEST_URL;
const baseUrl = publicUrl ?? 'http://127.0.0.1:8795';
const output = process.env.TEST_OUTPUT ?? 'test-output/touch-stop';
const checks = [];
let child, browser;
function check(ok, label, evidence) {
  checks.push({ label, pass: !!ok, evidence });
  console.log(ok ? 'PASS' : 'FAIL', label, JSON.stringify(evidence));
  assert(ok, label);
}
async function waitFor(predicate, label, timeout=10000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) { const x=await predicate(); if(x)return x; await new Promise(r=>setTimeout(r,30)); }
  throw new Error('Timeout: '+label);
}
async function install(context) {
  await context.addInitScript(() => {
    window.qa = { states: [], inputs: [], joined: null, delayStop: false, sockets: [], delayedStops: [] };
    window.qa.releaseStops=()=>window.qa.delayedStops.splice(0).forEach(send=>send());
    const Native=window.WebSocket;
    window.WebSocket=class extends Native {
      constructor(...args) {
        super(...args);window.qa.sockets.push(this);
        this.addEventListener('message',event=> {
          const message=JSON.parse(event.data);
          if(message.type==='joined')window.qa.joined=message;
          if(message.type==='state') {window.qa.state=message.state;window.qa.states.push(message.state);}
        });
      }
      send(data) {
        const message=JSON.parse(data);
        if(message.type==='input')window.qa.inputs.push(message.input);
        if(message.type==='input'&&message.input.stop&&window.qa.delayStop) {
          // Hold until the pre-ack assertion: slow software frames can exceed
          // a fixed delay and accidentally test only the authoritative stop.
          window.qa.delayedStops.push(()=>super.send(data));
        } else super.send(data);
      }
    };
    window.inspectBoat=()=> {
      const div=document.querySelector('[data-testid="storm-scene"]');
      let fiber=div?.[Object.keys(div).find(k=>k.startsWith('__reactFiber'))];
      if(!fiber)return null;
      let root=fiber;while(root.return)root=root.return;
      if(root.stateNode?.current!==root&&fiber.alternate)fiber=fiber.alternate;
      let state,boatId,runtime;
      for(let f=fiber;f;f=f.return) {
        if(f.memoizedProps?.state?.boats) {state=f.memoizedProps.state;boatId=f.memoizedProps.boatId;}
        for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.camera)runtime=h.memoizedState.current;
      }
      const boat=state?.boats.find(b=>b.id===boatId),group=runtime?.boats.get(boatId)?.group;
      if(!boat||!group)return null;
      runtime.camera.updateMatrixWorld(true);
      const vector=group.position.clone().set(boat.x,0,boat.z).project(runtime.camera);
      const rect=runtime.renderer.domElement.getBoundingClientRect();
      return {boat:{...boat},tick:state.tick,visible:{x:group.position.x,z:group.position.z},point:{x:rect.x+(vector.x+1)*rect.width/2,y:rect.y+(1-vector.y)*rect.height/2}};
    };
  });
}
async function open(page) {
  await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByTestId('nickname').waitFor();
}
async function inspect(page) { return page.evaluate('window.inspectBoat()'); }
async function gesture(page, label, online) {
  await waitFor(()=>inspect(page),label+' ready');
  await page.waitForTimeout(200);
  const initial=await inspect(page);
  const canvas=await page.locator('[data-testid="storm-scene"] canvas').elementHandle();
  const cdp=await page.context().newCDPSession(page);
  const p=initial.point;
  check(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',p),label+' own ship reachable on canvas',p);
  const target={x:p.x+(p.x>page.viewportSize().width*.7?-65:65),y:p.y+20,id:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[target]});
  const moving=await waitFor(async()=> {const value=await inspect(page);return value&&Math.hypot(value.boat.vx,value.boat.vz)>2&&value;},label+' moving');
  check(Math.hypot(moving.boat.vx,moving.boat.vz)<=22+.001,label+' drag respects speed limit');
  check(await canvas.evaluate(element=>element.isConnected),label+' canvas survives simulation updates');
  const fire={x:page.viewportSize().width/2+80,y:p.y,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[target,fire]});
  await waitFor(async()=> (await inspect(page)).boat.cooldownRight>0,label+' multitouch fires');
  check(true,label+' second finger fires while first stays held');
  if(online)await page.evaluate('window.qa.delayStop=true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const released=await inspect(page);
  check(released.boat.vx===0&&released.boat.vz===0,label+' local velocity zero immediately on release',released.boat);
  const stoppedPose=released.visible;
  await page.waitForTimeout(180);
  const later=await inspect(page);
  check(Math.hypot(later.visible.x-stoppedPose.x,later.visible.z-stoppedPose.z)<.000001,label+' rendered ship does not slide after release',{from:stoppedPose,to:later.visible});
  if(online) {
    const release=await page.evaluate('window.qa.inputs.findLast(i=>i.stop===true)');
    const authorityBefore=await page.evaluate('window.qa.state.boats.find(b=>b.id===window.qa.joined.boatId)');
    check(authorityBefore.lastInputSeq<release.seq,label+' prediction tested before delayed server stop acknowledgement',{releaseSeq:release.seq,serverSeq:authorityBefore.lastInputSeq});
    await page.evaluate('window.qa.delayStop=false;window.qa.releaseStops()');
    await waitFor(()=>page.evaluate(seq=> {const b=window.qa.state.boats.find(b=>b.id===window.qa.joined.boatId);return b.lastInputSeq>=seq&&b.vx===0&&b.vz===0;},release.seq),label+' server stopped');
    await page.waitForTimeout(800);
    const first=await page.evaluate('window.qa.state.boats.find(b=>b.id===window.qa.joined.boatId)');
    await page.waitForTimeout(180);
    const last=await page.evaluate('window.qa.state.boats.find(b=>b.id===window.qa.joined.boatId)');
    check(last.vx===0&&last.vz===0&&last.x===first.x&&last.z===first.z,label+' authority stays motionless after receiving stop',{first,last});
  }
  check(await page.evaluate('window.scrollY===0 && document.documentElement.scrollWidth<=window.innerWidth'),label+' no scrolling or horizontal overflow');
  await page.screenshot({path:`${output}/${label}.png`});
  await cdp.detach();
}

async function main() {
  await mkdir(output,{recursive:true});
  if(!publicUrl) {
    child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'8795',NODE_ENV:'test'},stdio:'pipe'});
    await waitFor(async()=>{try{return(await fetch(`${baseUrl}/healthz`)).ok;}catch{return false;}},'health');
  }
  browser=await chromium.launch();
  const errors=[];
  for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]) {
    const context=await browser.newContext({...devices['iPhone 14'],viewport});await install(context);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await open(page);await page.getByTestId('practice').click();
    await gesture(page,`solo-${name}`,false);await context.close();
  }
  const aContext=await browser.newContext({...devices['iPhone 14'],viewport:{width:390,height:844}});
  const bContext=await browser.newContext({viewport:{width:1280,height:800}});
  await install(aContext);await install(bContext);
  const a=await aContext.newPage(),b=await bContext.newPage();
  a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
  await open(a);await a.getByTestId('nickname').fill('StopA');await a.getByTestId('create-room').click();
  const joined=await waitFor(()=>a.evaluate('window.qa.joined'),'A joined');
  await open(b);await b.getByTestId('nickname').fill('StopB');await b.getByTestId('room-code').fill(joined.roomCode);await b.getByTestId('join-room').click();
  await waitFor(()=>b.evaluate('window.qa.joined && window.qa.state'),'B joined');
  check((await a.evaluate('window.qa.state.duration'))===180,'online production round defaults to 180 seconds');
  await gesture(a,'online-portrait',true);
  await a.setViewportSize({width:844,height:390});await a.waitForTimeout(200);
  await gesture(a,'online-landscape',true);
  const statesA=await a.evaluate('window.qa.states'),statesB=await b.evaluate('window.qa.states');
  check(statesA.some(x=>statesB.some(y=>x.tick===y.tick&&JSON.stringify(x)===JSON.stringify(y))),'independent browsers share identical authoritative state');
  await b.screenshot({path:`${output}/online-remote.png`});
  await aContext.close();await bContext.close();
  check(errors.length===0,'no application exceptions',errors);
  console.log('TOUCH_VISUAL_TEST_PASS',baseUrl);
}
try {await main();}catch(error){console.error('TOUCH_VISUAL_TEST_FAIL',error);process.exitCode=1;}
finally {await writeFile(`${output}/results.json`,JSON.stringify(checks,null,2));await browser?.close();child?.kill();}
