// Frozen renderer from commit 2d84360, for pixel equivalence and paired timings only.
import {CONFIG, TAU, N, R, BOSS_START, wrap, delta, clamp} from '../../model.mjs';

// Browser-only presentation. Reads state; never advances the simulation.
export function createRenderer({getState,isOverlayOpen}){
const $=id=>document.getElementById(id);
const canvas=$('world'),ctx=canvas.getContext('2d'),omens=$('omens'),ox=omens.getContext('2d'),bossWarningEl=$('bossWarning');
let lastDrain='';
let W=0,H=0,cx=0,cy=0,inner=0,outer=0;
const texture=document.createElement('canvas');texture.width=texture.height=320;
const tc=texture.getContext('2d'),image=tc.createImageData(320,320),samples=[];
for(let y=0;y<320;y++)for(let x=0;x<320;x++){
 const dx=(x+.5-160)/160,dy=(y+.5-160)/160,r=Math.hypot(dx,dy);if(r<=.65||r>=1)continue;
 const a=wrap(Math.atan2(dy,dx)+Math.PI/2)/TAU*N,i=Math.floor(a),fx=a-i,radial=(r-.65)/.35*(R+1)-1,j=Math.floor(radial),fy=radial-j;
 const index=(row,col)=>row<0||row>=R?-1:row*N+col%N;
 samples.push([(y*320+x)*4,index(j,i),index(j,i+1),index(j+1,i),index(j+1,i+1),fx,fy]);
}
function resize(){const b=$('stage').getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);W=b.width;H=b.height;canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);omens.width=canvas.width;omens.height=canvas.height;ox.setTransform(d,0,0,d,0,0);cx=W/2;cy=H/2;outer=Math.min(W*.445,(H-(getState().artMode?25:90))*.5);inner=outer*.65;}
function point(theta,r){return{x:cx+Math.sin(theta)*r,y:cy-Math.cos(theta)*r};}
function dot(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function circle(p,r,color,width=1,start=0,end=TAU){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(p.x,p.y,r,start-Math.PI/2,end-Math.PI/2);ctx.stroke();}
function text(value,x,y,color='#a8c8b6',size=10){ctx.fillStyle=color;ctx.font=size+'px system-ui';ctx.textAlign='center';ctx.fillText(value,x,y);}
function sanctuarySectorPath(theta,innerRadius,outerRadius){ctx.beginPath();ctx.arc(cx,cy,outerRadius,theta-CONFIG.sanctuaryHalfWidth-Math.PI/2,theta+CONFIG.sanctuaryHalfWidth-Math.PI/2);ctx.arc(cx,cy,innerRadius,theta+CONFIG.sanctuaryHalfWidth-Math.PI/2,theta-CONFIG.sanctuaryHalfWidth-Math.PI/2,true);ctx.closePath();}
function drawSanctuaryField(game,sanctuary,index,reduced,preview=false){
 const innerRadius=inner+5,outerRadius=outer-3,start=sanctuary.theta-CONFIG.sanctuaryHalfWidth,end=sanctuary.theta+CONFIG.sanctuaryHalfWidth,gradient=ctx.createRadialGradient(cx,cy,innerRadius,cx,cy,outerRadius);
 ctx.save();gradient.addColorStop(0,preview?'rgba(126,239,216,.16)':'rgba(111,235,210,.22)');gradient.addColorStop(1,'rgba(111,235,210,.025)');sanctuarySectorPath(sanctuary.theta,innerRadius,outerRadius);ctx.fillStyle=gradient;ctx.fill();
 if(preview){ctx.setLineDash([4,4]);circle({x:cx,y:cy},innerRadius,'rgba(151,247,226,.85)',1.5,start,end);circle({x:cx,y:cy},outerRadius,'rgba(151,247,226,.55)',1.5,start,end);}
 else{
  circle({x:cx,y:cy},innerRadius,'rgba(151,247,226,.95)',3,start,end);circle({x:cx,y:cy},outerRadius,'rgba(151,247,226,.32)',1,start,end);ctx.globalCompositeOperation='lighter';
  for(let n=0;n<14;n++){const base=(n*.61803398875+index*.193)%1,travel=reduced?base:(base+game.t*.055)%1,a=sanctuary.theta+CONFIG.sanctuaryHalfWidth*.82*Math.sin((n+1)*12.9898+index*3.1),r=innerRadius+6+travel*(outerRadius-innerRadius-10),alpha=.2+.65*Math.sin(travel*Math.PI),spark=point(a,r);dot(spark.x,spark.y,.7+(n%3)*.25,'rgba(155,255,232,'+alpha+')');}
 }
 ctx.restore();
}
function render(){
 const {game,selected,artMode,sanctuaryArmed,paused}=getState();
 ctx.clearRect(0,0,W,H);const q=game.q,ref=CONFIG.initial/N*.5,gather=game.endingAt===null?0:clamp((game.t-game.endingAt)/3,0,1),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 for(const [k,a,b,c,d,fx,fy] of samples){const lo=(a<0?0:q[a])*(1-fx)+(b<0?0:q[b])*fx,hi=(c<0?0:q[c])*(1-fx)+(d<0?0:q[d])*fx,mass=lo*(1-fy)+hi*fy;image.data[k]=Math.round(100+137*gather);image.data[k+1]=Math.round(228-8*gather);image.data[k+2]=Math.round(176-34*gather);image.data[k+3]=Math.round(220*(1-Math.exp(-mass/ref*1.4)));}
 tc.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(texture,cx-outer,cy-outer,outer*2,outer*2);
 circle({x:cx,y:cy},outer,'rgba(133,190,166,.17)');circle({x:cx,y:cy},outer*(.65+.35*7.5/9),'rgba(161,215,201,.16)',1);circle({x:cx,y:cy},inner,'rgba(177,201,183,.23)');
 for(let i=0;i<game.sanctuaries.length;i++)drawSanctuaryField(game,game.sanctuaries[i],i,reduced);
 if(sanctuaryArmed&&game.canDeploySanctuary()&&!artMode)drawSanctuaryField(game,{theta:selected},game.sanctuaries.length,reduced,true);
 // Sparse current traces express the field's clockwise advection; not extra energy.
 for(let i=0;i<12;i++){const a=wrap(i/12*TAU+game.t*CONFIG.current/N*TAU),p=point(a,outer+6),a1=point(a-.022,outer+10),a2=point(a-.022,outer+2);ctx.beginPath();ctx.moveTo(a1.x,a1.y);ctx.lineTo(p.x,p.y);ctx.lineTo(a2.x,a2.y);ctx.strokeStyle='rgba(159,208,181,.25)';ctx.lineWidth=1;ctx.stroke();}
 if(!artMode){text('SOUL CLOUD · PROTECTED',cx,cy-outer-18,'#77998a',9);text('WORLD PLANE',cx,cy+inner-19,'#78968c',9);}
 for(const sink of game.sinks){
  const online=clamp((game.t-sink.start)/CONFIG.sinkActivationGrow,0,1),ease=1-(1-online)**3,scale=reduced?1:CONFIG.sinkWarningEnd+(1-CONFIG.sinkWarningEnd)*ease;
  const p=point(sink.theta,inner+sink.fraction*(outer-inner)),r=outer*CONFIG.sinkRadius*scale,remaining=clamp((sink.end-game.t)/sink.duration,0,1),neutralized=sink.neutralized;
  const halo=ctx.createRadialGradient(p.x,p.y,r*.6,p.x,p.y,r*2.5);halo.addColorStop(0,neutralized?'rgba(168,181,178,.35)':'rgba(185,95,245,.48)');halo.addColorStop(1,neutralized?'rgba(90,105,102,0)':'rgba(85,30,130,0)');dot(p.x,p.y,r*2.5,halo);
  dot(p.x,p.y,r,neutralized?'#313a3a':'#030208');circle(p,r,neutralized?'#c3cecb':'#d5a5ff',2);circle(p,r+5,neutralized?'rgba(177,192,188,.2)':'rgba(171,117,214,.22)',2);circle(p,r+5,neutralized?'#aebbb8':'#ce92fb',2.5,0,TAU*remaining);
  for(let n=0;n<3;n++){const a=game.t*.7+n*TAU/3;circle(p,r+9+n*2,neutralized?'rgba(168,184,180,.2)':'rgba(178,103,237,.25)',1,a,a+.65);}
 }
 for(const tomb of game.tombs){const p=point(tomb.theta,inner),a=Math.min(1,(8-(game.t-tomb.t))/2);ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=a*.7;ctx.fillStyle=tomb.reason==='embryo'?'#827e89':'#819c90';ctx.beginPath();ctx.roundRect(-2.5,-4,5,7,[2.5,2.5,0,0]);ctx.fill();ctx.restore();}
 for(const pulse of game.pulses){const age=game.t-pulse.t;if(age>1.5)continue;const p=point(pulse.theta,inner),opacity=1-age/1.5,size=pulse.visualScale||1;circle(p,6*size+age*15,`rgba(255,221,157,${opacity*.7})`);if(!artMode&&age<1)text('Soul ready',p.x,p.y-13*size-age*9,`rgba(249,219,160,${opacity})`,9);}
 for(const e of game.lives){
  const p=point(e.theta,inner),size=e.visualScale||1;
  if(e.state==='waiting'){
   circle(p,4*size,'#e8be80',1.1);dot(p.x,p.y,Math.max(.5,3.6*size*Math.sqrt(e.soul/e.chunk)),'#e8be80');circle(p,8*size,'rgba(182,147,95,.14)');circle(p,8*size,'rgba(246,202,137,.58)',1,0,TAU*clamp(1-e.age/e.maturity,0,1));
  }else if(e.state==='souled'){dot(p.x,p.y,4*size,'#f1d3a1');circle(p,7*size,'rgba(249,214,156,.25)',1,0,TAU*clamp(1-e.age/e.maturity,0,1));}
  else{
   const f=clamp(e.soul/e.chunk,0,1),baseGrowth=e.growth/e.growthScale,growth=clamp((baseGrowth-CONFIG.growthMin)/(CONFIG.growthMax-CONFIG.growthMin),0,1),r=(2.5+2.1*Math.sqrt(f))*size;
   dot(p.x,p.y,r+(3+growth*2)*size,`rgba(150,231,177,${.05+.13*growth})`);dot(p.x,p.y,r,`rgb(${Math.round(145+45*(1-f))},${Math.round(196+39*growth)},${Math.round(157+23*growth)})`);
   const phase=(game.t*.32+e.id*.23)%1,ret=point(e.theta,inner+phase*(outer-inner));dot(ret.x,ret.y,Math.min(1.2,.8*Math.sqrt(size)),`rgba(170,226,190,${.3*Math.sin(phase*Math.PI)})`);
  }
 }
 if(!isOverlayOpen()&&!artMode&&!game.finished&&game.endingAt===null){const p=point(selected,inner);circle(p,13,sanctuaryArmed?'rgba(130,242,218,.8)':game.canPlant()&&!paused?'rgba(207,235,182,.6)':'rgba(160,179,160,.25)',1);const a=point(selected,inner-22),b=point(selected,inner-17);ctx.strokeStyle=sanctuaryArmed?'#8fead8':'#c3d8ad';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
 if(game.endingAt!==null){
  const elapsed=game.t-game.endingAt;
  for(let n=0;n<(game.gathering||[]).length;n++){
   const e=game.gathering[n];if(!e.person)continue;
   const f=clamp((elapsed-(n%5)*.12)/3.1,0,1),ease=f*f*(3-2*f),p=point(e.theta+.16*Math.sin(f*Math.PI),inner+ease*(outer-inner));
   const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,17);halo.addColorStop(0,`rgba(255,223,151,${(1-f)*.65})`);halo.addColorStop(1,'rgba(255,215,136,0)');dot(p.x,p.y,17,halo);dot(p.x,p.y,4*(1-f),`rgba(255,238,182,${1-f})`);
   if(f<1)circle(p,5+f*15,`rgba(255,219,150,${(1-f)*.5})`);
  }
  circle({x:cx,y:cy},inner+clamp(elapsed/4.5,0,1)*(outer-inner),'rgba(247,219,157,'+Math.max(0,.25-elapsed*.05)+')',1.5);
 }
 renderBossAlert(game,reduced);renderOmens(game,reduced);
}
function renderBossAlert(game,reduced){
 const age=game.t-(BOSS_START-CONFIG.bossWarningLead),duration=CONFIG.bossMessageDuration,visible=game.endingAt===null&&age>=0&&age<duration;
 if(!visible){bossWarningEl.style.visibility='hidden';bossWarningEl.style.opacity='0';return;}
 const fadeIn=.18,fadeOut=.75,opacity=reduced?1:age<fadeIn?age/fadeIn:age>duration-fadeOut?(duration-age)/fadeOut:1;
 bossWarningEl.style.visibility='visible';bossWarningEl.style.opacity=String(clamp(opacity,0,1));bossWarningEl.style.transform='translateY(-50%) scale('+(reduced?1:.98+.02*clamp(age/fadeIn,0,1))+')';
}
function renderOmens(game,reduced){
 ox.clearRect(0,0,W,H);
 const warnings=game.warnings(),latestStart=Math.max(-Infinity,...game.sinkSchedule.filter(s=>s.start<=game.t).map(s=>s.start));
 const since=game.t-latestStart;
 // Sharp inhale: accelerate into gray over the final .9s, with no held frame.
 let drain=0;
 for(const s of warnings){
  const fadeStart=Math.max(s.start-.9,latestStart+.15),duration=Math.max(.01,s.start-fadeStart);
  const x=clamp((game.t-fadeStart)/duration,0,1),ease=x*x*x;
  drain=Math.max(drain,ease);
 }
 if(game.endingAt!==null)drain=0;
 const drainValue=drain.toFixed(3);if(drainValue!==lastDrain){document.body.style.setProperty('--drain',drainValue);lastDrain=drainValue;}
 for(const s of warnings){
  const progress=clamp((game.t-s.warningAt)/(s.start-s.warningAt),0,1),ease=progress*progress*(3-2*progress),scale=reduced?CONFIG.sinkWarningEnd:CONFIG.sinkWarningStart+(CONFIG.sinkWarningEnd-CONFIG.sinkWarningStart)*ease;
  const p=point(s.theta,inner+s.fraction*(outer-inner)),r=outer*CONFIG.sinkRadius*scale,remaining=1-progress;
  const glow=ox.createRadialGradient(p.x,p.y,0,p.x,p.y,r*2.5);glow.addColorStop(0,'rgba(190,200,198,.24)');glow.addColorStop(1,'rgba(150,160,159,0)');ox.fillStyle=glow;ox.beginPath();ox.arc(p.x,p.y,r*2.5,0,TAU);ox.fill();
  ox.fillStyle='rgba(118,127,127,.3)';ox.beginPath();ox.arc(p.x,p.y,r,0,TAU);ox.fill();
  ox.lineWidth=2;ox.strokeStyle='#aeb8b7';ox.setLineDash([3,4]);ox.beginPath();ox.arc(p.x,p.y,r,-Math.PI/2,TAU*remaining-Math.PI/2);ox.stroke();ox.setLineDash([]);
  ox.font='bold '+Math.max(9,18*scale)+'px system-ui';ox.textAlign='center';ox.fillStyle='#d3d9d7';ox.fillText('!',p.x,p.y+Math.max(3,6*scale));
 }
 if(since>=0&&since<CONFIG.sinkActivationGrow&&game.endingAt===null){
  // One soft violet-white flash; no repeated strobe. Reduced motion omits it.
  if(!reduced&&since<.22&&game.sinks.some(s=>!s.neutralized&&game.t-s.start<CONFIG.sinkActivationGrow)){ox.fillStyle='rgba(233,216,255,'+(.34*(1-since/.22)**2)+')';ox.fillRect(0,0,W,H);}
  for(const s of game.sinks)if(game.t-s.start<CONFIG.sinkActivationGrow){const p=point(s.theta,inner+s.fraction*(outer-inner)),f=(game.t-s.start)/CONFIG.sinkActivationGrow,ease=1-(1-f)**3,scale=reduced?1:CONFIG.sinkWarningEnd+(1-CONFIG.sinkWarningEnd)*ease;ox.strokeStyle=s.neutralized?'rgba(205,216,213,'+(1-f)+')':'rgba(238,210,255,'+(1-f)+')';ox.lineWidth=2;ox.beginPath();ox.arc(p.x,p.y,outer*CONFIG.sinkRadius*scale+(reduced?0:f*35),0,TAU);ox.stroke();}
 }
}

function selectionFromClient(clientX,clientY){const rect=canvas.getBoundingClientRect(),x=clientX-rect.left-cx,y=clientY-rect.top-cy,r=Math.hypot(x,y);if(r<inner*.65||r>outer+24)return null;return wrap(Math.atan2(y,x)+Math.PI/2);}
return {canvas,resize,render,selectionFromClient};
}
