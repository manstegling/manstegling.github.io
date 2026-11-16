// Deterministic simulation. No DOM, canvas, wall clock, or persistence dependencies.
const TAU=Math.PI*2, N=144, R=8, DT=1/60, CAP=250;
const CONFIG=Object.freeze({sunrise:17,disturbance:160,sunset:14,initial:135,chunk:12,maturity:6,lifespan:100,growthMin:.12,growthMax:.34,crowdingScale:1.4,neighbourhood:.24,intakeRate:8,absorptionRate:6,advancementEnergy:500,chunkExponent:.9,growthExponent:.45,lifespanExponent:.15,maxVisualScale:1.7,warning:20,current:1.35,diffusion:.18,sinkPull:.92,sinkPullWidth:.18,sinkRadius:.075,sinkWarningStart:.24,sinkWarningEnd:.68,sinkActivationGrow:.4,sinkPopPeakTime:.03,sinkPopSettleTime:.24,sinkPopPeakScale:1.44,sinkWarningCountdown:3,lateSinkFractions:Object.freeze([.64,.77,.8]),sanctuaryCost:150,sanctuaryHalfWidth:.3054,bossCount:16,bossInterval:.04,bossDuration:7,bossFraction:.46,bossWarningLead:6,bossMessageDuration:2.4});
const TOTAL_TIME=CONFIG.sunrise+CONFIG.disturbance+CONFIG.sunset,BOSS_START=CONFIG.sunrise+CONFIG.disturbance-CONFIG.bossDuration;
const DEFAULTS={chunk:CONFIG.chunk,lifespan:CONFIG.lifespan,attraction:1,gravity:.36,diffusion:CONFIG.diffusion,maturity:CONFIG.maturity,sinkPull:CONFIG.sinkPull};
const wrap=a=>((a%TAU)+TAU)%TAU;
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const sum=a=>a.reduce((s,x)=>s+x,0);
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const growthFor=(neighbours,growthScale)=>growthScale*(CONFIG.growthMin+(CONFIG.growthMax-CONFIG.growthMin)/(1+neighbours/CONFIG.crowdingScale));
class Model {
 constructor(seed=73,initial=CONFIG.initial,params={}) {
  this.p={...DEFAULTS,...params};this.rng=seed>>>0;this.initial=initial;this.t=0;this.created=0;this.destroyed=0;this.failedEnergy=0;this.completed=0;this.gathered=0;this.gatheredEnergy=0;this.finished=false;this.endingAt=null;this.actions=[];this.plantTimes=[];this.peakPlacements15=0;this.born=0;this.deaths=0;this.embryoDeaths=0;this.id=0;
  this.q=new Float64Array(N*R);this.next=new Float64Array(N*R);this.well=new Float64Array(N);this.peak=new Float64Array(N);this.angular=new Float64Array(N);
  this.sanctuaries=[];
  this.sinks=[];this.sinkSchedule=[];this.hazardRng=(seed^0xA341316C)>>>0;this.buildSchedule();this.sinkAngular=new Float64Array(N*R);this.sinkRadial=new Float64Array(N*R);
  for(const sink of this.sinkSchedule)this.prepareSink(sink);
  this.lives=[];this.tombs=[];this.pulses=[];this.history=[];this.nextSample=0;
  let total=0;
  for(let j=0;j<R;j++)for(let i=0;i<N;i++){const angle=i/N*TAU,patch=Math.exp(2.3*Math.cos(angle-.45))+.72*Math.exp(2.1*Math.cos(angle-3.7));const w=Math.exp((j-(R-1))*1.4)*(.10+patch);this.q[j*N+i]=w;total+=w;}
  for(let k=0;k<this.q.length;k++)this.q[k]*=initial/total;
  this.record();
 }
 random(){let t=this.rng+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);this.rng>>>=0;return((t^(t>>>14))>>>0)/4294967296;}
 generationAt(created=this.created){
  // A soft knee leaves room for the first population to form, then approaches
  // linear pressure as created energy grows: p²/(1+p) tends toward p-1.
  const progress=created/CONFIG.advancementEnergy,advancement=1+progress*progress/(1+progress),chunkScale=advancement**CONFIG.chunkExponent,growthScale=advancement**CONFIG.growthExponent,lifespanScale=advancement**CONFIG.lifespanExponent;
  const chunk=this.p.chunk*chunkScale,lifespan=this.p.lifespan*lifespanScale;
  return{advancement,chunk,growthScale,lifespan,depletionRate:chunk/lifespan,intakeRate:CONFIG.intakeRate*chunkScale,visualScale:Math.min(CONFIG.maxVisualScale,Math.sqrt(chunkScale))};
 }
 addEmbryo(theta=undefined){
  if(this.lives.length>=CAP)return null;
  const generation=this.generationAt();
  const life={id:++this.id,state:'waiting',theta:theta===undefined?this.random()*TAU:wrap(theta),age:0,soul:0,maturity:this.p.maturity,personAge:0,velocity:0,target:0,nextTurn:0,acquired:null,...generation};
  life.intake=0;life.created=0;life.growth=CONFIG.growthMax*life.growthScale;life.neighbours=0;this.lives.push(life);return life;
 }
 hazardRandom(){let t=this.hazardRng+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);this.hazardRng>>>=0;return((t^(t>>>14))>>>0)/4294967296;}
 buildSchedule(){
  let warningAt=CONFIG.sunrise;
  const bossEnd=CONFIG.sunrise+CONFIG.disturbance,bossStart=BOSS_START,bossWarningAt=bossStart-CONFIG.bossWarningLead;
  const stop=bossStart-CONFIG.warning;
  const chooseTheta=at=>{
   let theta=0,best=-1;const near=this.sinkSchedule.filter(x=>x.end>at);
   for(let attempt=0;attempt<10;attempt++){
    const candidate=this.hazardRandom()*TAU,distance=near.length?Math.min(...near.map(x=>Math.abs(delta(candidate,x.theta)))):Math.PI;
    if(distance>best){best=distance;theta=candidate;}if(distance>.6)break;
   }
   return theta;
  };
  while(warningAt+CONFIG.warning+18<stop){
   const progress=(warningAt-CONFIG.sunrise)/CONFIG.disturbance;
   const duration=18+this.hazardRandom()*9;
   if(warningAt+CONFIG.warning+duration>stop)break;
   const theta=chooseTheta(warningAt);
   const fraction=.21+.17*this.hazardRandom();
   this.sinkSchedule.push({id:this.sinkSchedule.length+1,theta,fraction,layer:fraction*(R+1)-1,warningAt,start:warningAt+CONFIG.warning,end:warningAt+CONFIG.warning+duration,duration,destroyed:0});
   warningAt+=(29-17*progress)*(.84+.32*this.hazardRandom());
  }
  // Seeded late-wave sinks intensify the final third without reacting to
  // sanctuary placement. The final one clears as the boss warning arrives.
  for(let i=0;i<CONFIG.lateSinkFractions.length;i++){
   const progress=CONFIG.lateSinkFractions[i];
   const start=CONFIG.sunrise+CONFIG.disturbance*progress,warningAt=start-CONFIG.warning,maxDuration=bossWarningAt-start;
   const rolledDuration=18+this.hazardRandom()*5,duration=i===CONFIG.lateSinkFractions.length-1?maxDuration:Math.min(rolledDuration,maxDuration),theta=chooseTheta(warningAt),fraction=.21+.17*this.hazardRandom();
   this.sinkSchedule.push({id:0,late:true,theta,fraction,layer:fraction*(R+1)-1,warningAt,start,end:start+duration,duration,destroyed:0});
  }
  this.sinkSchedule.sort((a,b)=>a.start-b.start);for(let i=0;i<this.sinkSchedule.length;i++)this.sinkSchedule[i].id=i+1;
  for(let i=0;i<CONFIG.bossCount;i++){
   const fraction=CONFIG.bossFraction;
   this.sinkSchedule.push({id:this.sinkSchedule.length+1,boss:true,theta:wrap(-i/CONFIG.bossCount*TAU),fraction,layer:fraction*(R+1)-1,warningAt:bossWarningAt,start:bossStart,end:bossEnd,duration:CONFIG.bossDuration,destroyed:0});
  }
 }
 phase(){return this.t<CONFIG.sunrise?'Sunrise':this.t<CONFIG.sunrise+CONFIG.disturbance?'Disturbance':this.t<TOTAL_TIME?'Sunset':'Gathering';}
 canPlant(){return !this.finished&&this.endingAt===null&&this.t<TOTAL_TIME-CONFIG.maturity-1e-8&&this.lives.length<CAP;}
 plant(theta){if(!this.canPlant())return null;const e=this.addEmbryo(theta);if(e){this.actions.push({t:this.t,theta:e.theta,chunk:e.chunk});this.plantTimes.push(this.t);let recent=0;for(let i=this.plantTimes.length-1;i>=0&&this.plantTimes[i]>=this.t-15;i--)recent++;this.peakPlacements15=Math.max(this.peakPlacements15,recent);}return e;}
 sanctuaryEarned(){return Math.floor((this.created+1e-9)/CONFIG.sanctuaryCost);}
 sanctuaryAvailable(){return Math.max(0,this.sanctuaryEarned()-this.sanctuaries.length);}
 canDeploySanctuary(){return !this.finished&&this.endingAt===null&&this.sanctuaryAvailable()>0;}
 deploySanctuary(theta){
  if(!this.canDeploySanctuary())return null;
  const sanctuary={theta:wrap(theta),t:this.t};this.sanctuaries.push(sanctuary);this.actions.push({t:this.t,theta:sanctuary.theta,sanctuary:true});
  for(const sink of this.sinkSchedule)if(this.sinkOverlapsSanctuary(sink,sanctuary.theta))sink.neutralized=true;
  this.cacheSinkForces();
  return sanctuary;
 }
 sinkOverlapsSanctuary(sink,theta){const centerRadius=.65+.35*sink.fraction,angularRadius=Math.asin(Math.min(1,CONFIG.sinkRadius/centerRadius));return Math.abs(delta(sink.theta,theta))<=CONFIG.sanctuaryHalfWidth+angularRadius;}
 warnings(){return this.sinkSchedule.filter(s=>!s.boss&&this.t>=s.warningAt&&this.t<s.start);}
 updateSinks(){
  const active=this.sinkSchedule.filter(s=>this.t>=s.start&&this.t<s.end);
  if(active.length!==this.sinks.length||active.some((s,i)=>s!==this.sinks[i])){this.sinks=active;this.cacheSinkForces();}
 }
 neighbourhoodAt(theta,excluded=null){let count=0;for(const other of this.lives)if(other.state==='person'&&other.id!==excluded){const d=delta(other.theta,theta)/CONFIG.neighbourhood;count+=Math.exp(-.5*d*d);}return count;}
 growthAt(theta,excluded=null,growthScale=1){return growthFor(this.neighbourhoodAt(theta,excluded),growthScale);}
 localSupply(theta){const mid=Math.round(wrap(theta)/TAU*N);let amount=0;for(let j=0;j<2;j++)for(let off=-4;off<=4;off++){const k=j*N+(mid+off+N)%N;if(!this.blockedIntake(theta,k))amount+=this.q[k];}return amount;}
 gather(){
  if(this.endingAt!==null)return;
  this.t=TOTAL_TIME;this.endingAt=this.t;this.sinks=[];this.cacheSinkForces();
  this.gathering=this.lives.map(e=>({theta:e.theta,energy:e.soul,person:e.state==='person'}));
  for(const e of this.lives){if(e.state==='person'){this.deposit(e.theta,e.soul);this.completed++;this.gathered++;this.gatheredEnergy+=e.soul;}else{this.embryoDeaths++;this.failedEnergy+=e.soul;}e.soul=0;}
  this.lives=[];this.record();
 }
 prepareSink(sink){
  if(sink.physics)return sink.physics;
  const angular=new Float64Array(N*R),radial=new Float64Array(N*R),center=this.sinkPosition(sink),captureCells=[];
  for(let j=0;j<R-1;j++)for(let i=0;i<N;i++){
   const k=j*N+i,d=delta(sink.theta,i/N*TAU),dr=sink.layer-(j+.5);
   // The displayed rings compress the world's circumference: keep suction in a narrow radial column.
   const across=d/CONFIG.sinkPullWidth,falloff=Math.exp(-.5*(across**2+((sink.layer-j)/3)**2));
   angular[k]=14*falloff*across;
   // Never let sink force cross the protected cloud boundary.
   if(j<R-2)radial[k]=18*Math.exp(-.5*(across**2+(dr/3)**2))*dr/3;
   const p=this.cellPosition(k);if((p.x-center.x)**2+(p.y-center.y)**2<=CONFIG.sinkRadius**2)captureCells.push(k);
  }
  Object.defineProperty(sink,'physics',{value:{angular,radial,center},enumerable:false});sink.captureCells=captureCells;return sink.physics;
 }
 cacheSinkForces(){
  this.sinkAngular.fill(0);this.sinkRadial.fill(0);
  // Activation only adds precomputed arrays; no trigonometry, exponentials or geometry scan.
  for(const sink of this.sinks)if(!sink.neutralized){const f=this.prepareSink(sink);for(let k=0;k<N*R;k++){this.sinkAngular[k]+=f.angular[k];this.sinkRadial[k]+=f.radial[k];}}
 }
 sinkPosition(sink){const r=.65+.35*(sink.fraction??((sink.layer+1)/(R+1)));return{x:Math.sin(sink.theta)*r,y:-Math.cos(sink.theta)*r};}
 cellPosition(k){const r=.65+.35*(Math.floor(k/N)+1)/(R+1),a=(k%N)/N*TAU;return{x:Math.sin(a)*r,y:-Math.cos(a)*r};}
 blockedIntake(theta,k){
  const a={x:Math.sin(theta)*.65,y:-Math.cos(theta)*.65},b=this.cellPosition(k),dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  return this.sinks.some(sink=>{if(sink.neutralized)return false;const c=this.prepareSink(sink).center,f=len?clamp(((c.x-a.x)*dx+(c.y-a.y)*dy)/len,0,1):0;return (a.x+f*dx-c.x)**2+(a.y+f*dy-c.y)**2<=CONFIG.sinkRadius**2;});
 }
 absorbSinks(){
  for(const sink of this.sinks){
   if(sink.neutralized)continue;
   this.prepareSink(sink);
   for(const k of sink.captureCells){const energy=this.q[k];this.q[k]=0;this.destroyed+=energy;sink.destroyed+=energy;}
  }
 }
 fieldStep(dt){
  this.well.fill(0);this.peak.fill(0);this.angular.fill(0);
  const sigma=.19;
  for(const e of this.lives)if(e.state==='waiting'){
   const mid=Math.round(e.theta/TAU*N), reach=15;
   for(let off=-reach;off<=reach;off++){
    const i=(mid+off+N)%N,d=delta(e.theta,i/N*TAU),w=Math.exp(-.5*(d/sigma)**2);
    this.well[i]+=w;this.peak[i]=Math.max(this.peak[i],w);this.angular[i]+=w*d/sigma;
   }
  }
  for(let i=0;i<N;i++){
   const weight=this.well[i];
   this.well[i]=1-Math.exp(-1.9*this.peak[i]);
   this.angular[i]=weight?10*this.p.attraction*this.angular[i]/weight*this.well[i]:0;
  }
  this.next.set(this.q);
  // Conservative upwind drift plus symmetric diffusion. DT satisfies the
  // outgoing-flux bound at every allowed control setting; no mass clipping.
  const diff=this.p.diffusion*.65;
  for(let j=0;j<R;j++){
   // Layer geometry is identical for all angular cells; preserve flux arithmetic.
   const reach=.20+.80*Math.exp(-j/2.1),current=CONFIG.current*(j/(R-1))**2;
   const radialReach=.20+.80*Math.exp(-(j+.5)/2.1);
   for(let i=0;i<N;i++){
    const a=j*N+i,b=j*N+(i+1)%N;
    const v=clamp(current+reach*(this.angular[i]+this.angular[(i+1)%N])*.5+this.p.sinkPull*(this.sinkAngular[a]+this.sinkAngular[b])*.5,-12,12);
    const flux=dt*(diff*(this.q[a]-this.q[b])+v*(v>=0?this.q[a]:this.q[b]));
    this.next[a]-=flux;this.next[b]+=flux;
    if(j<R-1){
     const c=a+N,vr=clamp(2.5*this.p.gravity-13*radialReach*this.p.attraction*this.well[i]+this.p.sinkPull*this.sinkRadial[a],-12,12);
     // The outermost layer is a resting reservoir. No passive inward leak:
     // only net embryo attraction can withdraw it; return flow remains free.
     const mixing=j===R-2?Math.max(0,this.q[a]-this.q[c]):this.q[a]-this.q[c];
     const radial=dt*(diff*mixing+vr*(vr>=0?this.q[a]:this.q[c]));
     this.next[a]-=radial;this.next[c]+=radial;
    }
   }
  }
  const swap=this.q;this.q=this.next;this.next=swap;
 }
 absorbEmbryos(dt){
  // Simultaneous cell sharing: neither array order nor embryo count can
  // multiply a cell's available intake flux. Unused shares remain in the cloud.
  const demand=new Uint16Array(N*2),requests=[];
  for(const e of this.lives)if(e.state==='waiting'&&e.age<=e.maturity+1e-9){
   const cells=[],mid=Math.round(e.theta/TAU*N);
   for(let j=0;j<2;j++)for(let off=-4;off<=4;off++){
    const k=j*N+(mid+off+N)%N;if(!this.blockedIntake(e.theta,k)){cells.push(k);demand[k]++;}
   }
   requests.push({e,cells});
  }
  const flux=1-Math.exp(-CONFIG.absorptionRate*dt),removed=new Float64Array(N*2);
  for(const {e,cells} of requests){
   let available=0;for(const k of cells)available+=this.q[k]*flux/demand[k];
   const take=Math.min(available,e.intakeRate*dt,e.chunk-e.soul);
   const scale=available>0?take/available:0;
   for(const k of cells)removed[k]+=this.q[k]*flux/demand[k]*scale;
   e.soul+=take;e.intake+=(take/dt-e.intake)*(1-Math.exp(-dt/0.6));
   if(e.soul>=e.chunk-1e-10){e.state='souled';e.acquired=this.t;this.pulses.push({theta:e.theta,t:this.t,chunk:e.chunk,visualScale:e.visualScale});}
  }
  for(let k=0;k<removed.length;k++)this.q[k]-=removed[k];
 }
 deposit(theta,energy){
  const pos=wrap(theta)/TAU*N,i=Math.floor(pos),f=pos-i;
  this.q[i]+=energy*(1-f);this.q[(i+1)%N]+=energy*f;
 }
 step(dt=DT){
  if(this.finished)return;
  if(this.endingAt!==null){this.t+=dt;if(this.t>=this.endingAt+4.5)this.finished=true;return;}
  this.t+=dt;
  this.updateSinks();
  this.absorbSinks();this.fieldStep(dt);this.absorbSinks();
  // No life changes between these reads; reuse the same neighbourhood sum.
  for(const e of this.lives)if(e.state==='person'){e.neighbours=this.neighbourhoodAt(e.theta,e.id);e.growth=growthFor(e.neighbours,e.growthScale);}
  for(const e of this.lives)if(e.state!=='person')e.age+=dt;
  this.absorbEmbryos(dt);
  for(const e of this.lives){
   if(e.state==='waiting'&&e.age>=e.maturity-1e-9)e.state='failed';
   if(e.state==='souled'&&e.age>=e.maturity-1e-9){e.state='person';e.personAge=0;e.velocity=(this.random()-.5)*.025;e.target=e.velocity;e.growth=this.growthAt(e.theta,e.id,e.growthScale);e.nextTurn=this.t+1+this.random()*3;this.born++;}
  }
  const living=[];
  for(const e of this.lives){
   if(e.state==='failed'){this.failedEnergy+=e.soul;e.soul=0;this.deaths++;this.embryoDeaths++;this.tombs.push({id:e.id,theta:e.theta,t:this.t,reason:'embryo'});continue;}
   if(e.state==='person'){
    // Creation is returned alongside a fixed share of stored soul, so
    // crowding changes productivity without accidentally shortening life.
    const net=e.depletionRate,drain=e.growth+net;
    const active=net>0?Math.min(dt,e.soul/net):dt;
    const creation=e.growth*active,returned=drain*active;
    this.created+=creation;e.created+=creation;e.soul+=creation-returned;e.personAge+=active;
    if(this.t>=e.nextTurn){e.target=(this.random()-.5)*.035;e.nextTurn=this.t+2+this.random()*3;}
    e.velocity+=(e.target-e.velocity)*(1-Math.exp(-active*.75));e.theta=wrap(e.theta+e.velocity*active);
    this.deposit(e.theta,returned);
    if(net>0&&e.soul<=1e-10){
     // Send the rounding remainder back as well to preserve the ledger.
     this.deposit(e.theta,e.soul);e.soul=0;this.deaths++;this.completed++;this.tombs.push({id:e.id,theta:e.theta,t:this.t});continue;
    }
   }
   living.push(e);
  }
  this.absorbSinks();this.lives=living;this.tombs=this.tombs.filter(e=>this.t-e.t<8);this.pulses=this.pulses.filter(e=>this.t-e.t<1.5);
  if(this.t>=TOTAL_TIME-1e-8){this.gather();return;}
  if(this.t>=this.nextSample){this.record();this.nextSample=this.t+.5;}
 }
 totals(){const cloud=sum(this.q);let world=0,people=0,waiting=0,embryos=0;for(const e of this.lives){world+=e.soul;if(e.state==='person')people++;else{embryos++;if(e.state==='waiting')waiting++;}}return{cloud,world,total:cloud+world,people,waiting,embryos,destroyed:this.destroyed,failedEnergy:this.failedEnergy,error:cloud+world-this.initial-this.created+this.destroyed+this.failedEnergy};}
 record(){const s=this.totals();this.history.push({t:this.t,cloud:s.cloud,world:s.world,total:s.total});if(this.history.length>361)this.history.shift();}
}

export { Model, CONFIG, DEFAULTS, TAU, N, R, DT, CAP, TOTAL_TIME, BOSS_START, wrap, delta, sum, clamp };
