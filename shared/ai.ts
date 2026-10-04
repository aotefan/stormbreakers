import type { BoatState, Difficulty, GameState, PlayerInput, Vec2 } from './protocol';

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const distance=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const unit=(x:number,z:number):Vec2=>{const d=Math.hypot(x,z)||1;return {x:x/d,z:z/d};};
const profiles={
  easy:{range:39,pace:.52,interval:7,lead:.25,error:.045,repair:30},
  normal:{range:31,pace:.65,interval:4.7,lead:.75,error:.018,repair:50},
  hard:{range:25,pace:.78,interval:3.05,lead:1,error:.004,repair:70},
};
interface Helm {targetId?:string;retargetAt:number;nextShot:number;orbit:number;sampleAt:number;sample:Vec2;escapeUntil:number;}
// Private controller state stays on the authority and never travels over the wire.
const controllers=new WeakMap<GameState,Map<string,Helm>>();

export function getAiInput(state:GameState,boat:BoatState,difficulty:Difficulty):PlayerInput {
  let fleet=controllers.get(state);if(!fleet){fleet=new Map();controllers.set(state,fleet);}
  const index=state.boats.indexOf(boat);
  let helm=fleet.get(boat.id);
  if(!helm){helm={retargetAt:0,nextShot:state.now+1+index*.37,orbit:index%2?1:-1,sampleAt:state.now,sample:{x:boat.x,z:boat.z},escapeUntil:0};fleet.set(boat.id,helm);}
  if(boat.hp<=0){fleet.delete(boat.id);return {seq:state.tick,throttle:0,turn:0};}
  const profile=profiles[difficulty]??profiles.normal;
  const enemies=state.boats.filter(b=>b.id!==boat.id&&b.hp>0);
  let enemy=enemies.find(b=>b.id===helm!.targetId);
  if(!enemy||state.now>=helm.retargetAt) {
    enemy=[...enemies].sort((a,b)=>distance(a,boat)*(a.ai?1:0.82)-distance(b,boat)*(b.ai?1:0.82))[0];
    helm.targetId=enemy?.id;helm.retargetAt=state.now+3.2;
  }
  if(state.now-helm.sampleAt>2) {
    if(distance(boat,helm.sample)<2){helm.escapeUntil=state.now+2.4;helm.orbit*=-1;}
    helm.sample={x:boat.x,z:boat.z};helm.sampleAt=state.now;
  }

  let goal:Vec2={x:Math.sin(state.now*.035+index*1.9)*54,z:Math.cos(state.now*.035+index*1.9)*54};
  let steering:Vec2;
  if(enemy) {
    const d=distance(enemy,boat),toward=unit(enemy.x-boat.x,enemy.z-boat.z);
    // Sail a broadside circle instead of driving into the enemy's centre.
    const radial=clamp((d-profile.range)/12,-1.7,1.7);
    steering={x:toward.x*radial+toward.z*helm.orbit,z:toward.z*radial-toward.x*helm.orbit};
    goal={x:boat.x+steering.x*22,z:boat.z+steering.z*22};
  } else steering=unit(goal.x-boat.x,goal.z-boat.z);
  const chest=[...state.chests].sort((a,b)=>distance(a,boat)-distance(b,boat))[0];
  if(state.mode==='treasure'&&chest&&(!enemy||distance(chest,boat)<distance(enemy,boat)*.85)) {
    goal=chest;steering=unit(goal.x-boat.x,goal.z-boat.z);
  }
  if(state.mode==='storm')for(const storm of state.storms)if(distance(storm,boat)<storm.radius+9) {
    const away=unit(boat.x-storm.x,boat.z-storm.z);steering={x:away.x*2,z:away.z*2};
    goal={x:boat.x+away.x*30,z:boat.z+away.z*30};break;
  }
  if(helm.escapeUntil>state.now) {
    steering={x:Math.sin(boat.angle+helm.orbit*1.4),z:Math.cos(boat.angle+helm.orbit*1.4)};
  }

  let avoiding=false;
  for(const island of state.islands) {
    const away=unit(boat.x-island.x,boat.z-island.z),d=distance(boat,island),safe=island.radius+8;
    const direction=unit(steering.x,steering.z),ox=island.x-boat.x,oz=island.z-boat.z;
    const along=ox*direction.x+oz*direction.z,across=Math.abs(ox*direction.z-oz*direction.x);
    if(d<safe+5||(along>0&&along<Math.max(25,Math.hypot(boat.vx,boat.vz)*1.4)&&across<safe)) {
      const cross=away.z*(goal.x-boat.x)-away.x*(goal.z-boat.z);
      const side=Math.abs(cross)>.2?Math.sign(cross):helm.orbit;
      const radial=clamp((safe+3-d)/5,-.25,2);
      steering={x:away.z*side+away.x*radial,z:-away.x*side+away.z*radial};avoiding=true;
    }
  }
  // Leave room for the actual 15m hulls, including when multiple AI converge.
  for(const other of enemies) {
    const d=distance(boat,other);
    if(d<19) {
      const away=d>.001?unit(boat.x-other.x,boat.z-other.z):{x:index%2?1:-1,z:1};
      const strength=(19-d)/6;
      steering.x+=away.x*strength;steering.z+=away.z*strength;avoiding=true;
    }
  }
  if(Math.abs(boat.x)>74)steering.x-=Math.sign(boat.x)*(Math.abs(boat.x)-74)/8;
  if(Math.abs(boat.z)>74)steering.z-=Math.sign(boat.z)*(Math.abs(boat.z)-74)/8;
  const course=unit(steering.x,steering.z);
  const desiredSpeed=12*profile.pace;
  // Counter sideways momentum so turning does not leave the boat sliding into shore.
  const desired=Math.atan2(course.x*desiredSpeed-boat.vx*.65,course.z*desiredSpeed-boat.vz*.65);
  const delta=angle(desired-boat.angle);
  const input:PlayerInput={seq:state.tick,turn:clamp(delta*1.5,-1,1),throttle:profile.pace*clamp(1-Math.abs(delta)/2,.12,1),repair:boat.hp<profile.repair};

  if(enemy) {
    const d=distance(boat,enemy),flight=Math.max(0,d-4.5)/58;
    const aimX=enemy.x+enemy.vx*flight*profile.lead-boat.x-boat.vx*.25*flight;
    const aimZ=enemy.z+enemy.vz*flight*profile.lead-boat.z-boat.vz*.25*flight;
    const aim=angle(Math.atan2(aimX,aimZ)-boat.angle+Math.sin(state.now*.8+index)*profile.error);
    const side=aim>0?'left':'right',error=Math.abs(Math.abs(aim)-Math.PI/2);
    if(!avoiding&&d>19&&d<72&&state.now>=helm.nextShot-.8) {
      const broadsideHeading=Math.atan2(aimX,aimZ)+(side==='left'?-Math.PI/2:Math.PI/2);
      input.turn=clamp(angle(broadsideHeading-boat.angle)*2,-1,1);
      input.throttle*=.45;
    }
    const line=unit(enemy.x-boat.x,enemy.z-boat.z);
    const clear=state.islands.every(island=>{
      const dx=island.x-boat.x,dz=island.z-boat.z,along=dx*line.x+dz*line.z;
      return along<=0||along>=d||Math.abs(dx*line.z-dz*line.x)>island.radius+1;
    });
    if(d>12&&d<72&&error<Math.atan2(3.8,d)&&clear&&state.now>=helm.nextShot&&boat[side==='left'?'cooldownLeft':'cooldownRight']<=0) {
      input.fireLeft=side==='left';input.fireRight=side==='right';helm.nextShot=state.now+profile.interval;
    }
    input.boost=difficulty==='hard'&&d>65&&!avoiding&&Math.abs(delta)<.2;
    input.supply=difficulty==='hard'&&d<45&&boat.cooldownLeft>1.5&&boat.cooldownRight>1.5;
  }
  return input;
}
