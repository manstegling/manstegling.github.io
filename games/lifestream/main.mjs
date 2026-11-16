import {Model, CONFIG, TAU, DT, TOTAL_TIME, BOSS_START, wrap, clamp} from './model.mjs';
import {createRenderer} from './render.mjs';

window.LifestreamGame={Model,CONFIG,TOTAL_TIME,DT};
const $=id=>document.getElementById(id);
let game,started=false,paused=true,selected=.45,artMode=false,sanctuaryArmed=false,sanctuaryDrag=null,suppressSanctuaryClick=false,lastQuickSanctuary=-Infinity,accumulator=0,last=0,lastUI=0,lastDraw=0,artTimer=0,toastTimer=0,helpWasPaused=true,lastPhase='',lastSanctuaryEarned=0,resultShown=false;
const renderer=createRenderer({getState:()=>({game,selected,artMode,sanctuaryArmed,paused,showTap:!started&&!isOverlayOpen(),showSelection:started||selectionShown}),isOverlayOpen});
const {canvas,resize}=renderer;
let drawRequested=true,uiRequested=false,selectionShown=false;
function requestDraw(){drawRequested=true;}
function requestPointerUpdate(){uiRequested=true;requestDraw();}

function announce(message){$('announcements').textContent=message;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2200);announce(message);}
function formatTime(t){t=Math.max(0,Math.ceil(t-1e-7));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function formatRequirement(value){return Math.abs(value-Math.round(value))<.05?String(Math.round(value)):value.toFixed(1);}
function isOverlayOpen(){return !$('welcome').hidden||!$('helpOverlay').hidden||!$('results').hidden;}
function ui(){
 const overlayOpen=isOverlayOpen();
 $('stage').inert=overlayOpen;
 const atEnd=game.endingAt!==null;
 const bossWarning=game.t>=BOSS_START-CONFIG.bossWarningLead&&game.t<BOSS_START;
 const bossActive=game.sinks.some(s=>s.boss),calm=game.t>=CONFIG.sunrise+CONFIG.disturbance;
 const earned=game.sanctuaryEarned(),available=game.sanctuaryAvailable();
 if(started&&earned>lastSanctuaryEarned){
  lastSanctuaryEarned=earned;
  if(available>0&&!atEnd)toast('A sanctuary is ready.');
 }
 if(atEnd)$('toast').classList.remove('visible');
 const sanctuaryDisabled=(started&&paused)||!game.canDeploySanctuary()||overlayOpen||artMode;
 if(sanctuaryDisabled)sanctuaryArmed=false;
 $('energy').textContent=game.created.toFixed(1);
 $('completed').textContent=game.completed;
 $('time').textContent=formatTime(TOTAL_TIME-game.t);
 $('runSeed').textContent='World '+currentSeed;
 $('plant').disabled=(started&&paused)||!game.canPlant()||overlayOpen||artMode;
 $('pause').disabled=!started||game.finished||overlayOpen;
 const pauseLabel=paused?'Resume':'Pause';
 $('pause').setAttribute('aria-label',pauseLabel);
 $('pause').title=pauseLabel;
 $('pause').dataset.paused=String(paused);
 $('art').disabled=!started||game.finished;
 $('sanctuaryButton').disabled=sanctuaryDisabled;
 $('sanctuaryButton').setAttribute('aria-pressed',String(sanctuaryArmed));
 $('sanctuaryButton').setAttribute('aria-label','Sanctuary: '+available+' ready'+(sanctuaryArmed?'. Choose a place to protect.':'.'));
 $('sanctuaryCount').textContent=available;
 const untilCutoff=TOTAL_TIME-CONFIG.maturity-game.t,closed=game.t>=TOTAL_TIME-CONFIG.maturity-1e-8;
 let message='';
 if(atEnd)message='Gathered in light';
 else if(sanctuaryArmed)message='Place a sanctuary';
 else if(started&&paused)message='Paused';
 else if(started&&closed)message='Planting complete';
 else if(started&&untilCutoff<=3)message=String(Math.ceil(untilCutoff));
 $('stageStatus').textContent=message;
 $('stageStatus').hidden=!message||overlayOpen||artMode;
 if(!$('helpOverlay').hidden&&$('worldDetails').open){
  const totals=game.totals(),generation=game.generationAt();
  $('population').textContent=totals.people+' people · '+totals.embryos+' seeds';
  $('seedStatus').textContent=formatRequirement(generation.chunk)+' energy';
  $('sanctuaryStatus').textContent=game.sanctuaries.length+' placed · '+available+' ready';
  $('localEnergy').textContent=game.localSupply(selected).toFixed(1)+' energy';
  $('growth').textContent=game.growthAt(selected,null,generation.growthScale).toFixed(2)+'/s';
  $('balance').textContent='Cloud '+totals.cloud.toFixed(1)+' · Held '+totals.world.toFixed(1)+' · Lost to sinks '+game.destroyed.toFixed(1)+' · Lost seeds '+game.failedEnergy.toFixed(1);
 }
 const event=bossActive?'The final ring is active.':bossWarning?'Warning. The world is destabilizing.':calm?'The disturbance has passed.':'';
 if(started&&event&&event!==lastPhase){announce(event);lastPhase=event;}
 if(started&&closed&&!atEnd&&!cutoffAnnounced){announce('Planting is complete. Every seed has time to grow.');cutoffAnnounced=true;}
 if(game.finished&&!resultShown)showResults();
}
let currentSeed=73,cutoffAnnounced=false;
function setPause(value){paused=value;accumulator=0;last=0;ui();requestDraw();}
function begin(seed){
 if(artMode)applyArt(false);
 currentSeed=clamp(Math.trunc(Number(seed)||0),0,4294967295);
 game=new Model(currentSeed);
 started=false;paused=false;sanctuaryArmed=false;sanctuaryDrag=null;
 lastQuickSanctuary=-Infinity;lastSanctuaryEarned=0;accumulator=0;last=0;lastPhase='';
 resultShown=false;cutoffAnnounced=false;selectionShown=false;selected=.45;
 $('welcome').hidden=true;$('results').hidden=true;$('helpOverlay').hidden=true;
 resize();ui();requestDraw();canvas.focus({preventScroll:true});
 announce('Tap the band to begin a life. Time waits for you.');
}
function place(){if(artMode)return;if(game.finished||isOverlayOpen())return;if(started&&paused){toast('Resume when you are ready to plant.');return;}const life=game.plant(selected);if(!life){toast(game.t>=TOTAL_TIME-CONFIG.maturity?'Planting has closed for this world.':'The world is full. Give life a moment.');return;}if(!started){started=true;paused=false;accumulator=0;last=0;}announce('An embryo has begun. It needs '+formatRequirement(life.chunk)+' energy within six seconds.');ui();requestDraw();}
function deploySanctuary(theta=selected){if(artMode||game.finished||isOverlayOpen())return false;if(started&&paused){toast('Resume when you are ready to deploy a sanctuary.');return false;}const sanctuary=game.deploySanctuary(theta);if(!sanctuary){toast('Create '+CONFIG.sanctuaryCost+' energy to earn another sanctuary.');return false;}lastSanctuaryEarned=Math.max(lastSanctuaryEarned,game.sanctuaryEarned());selected=sanctuary.theta;sanctuaryArmed=false;toast('Sanctuary established.');ui();requestDraw();return true;}
function readRecords(){try{const value=JSON.parse(localStorage.getItem('lifestream-v4-records')||'{}');return{lives:Number.isFinite(value.lives)?value.lives:0,energy:Number.isFinite(value.energy)?value.energy:0};}catch{return{lives:0,energy:0};}}
function showResults(){resultShown=true;paused=true;if(artMode)toggleArt();const energy=game.created,records=readRecords(),best={lives:Math.max(records.lives,game.completed),energy:Math.max(records.energy,energy)};try{localStorage.setItem('lifestream-v4-records',JSON.stringify(best));}catch{}
 $('resultLives').textContent=game.completed;$('resultEnergy').textContent=energy.toFixed(1);$('bestLives').textContent='Personal best: '+best.lives;$('bestEnergy').textContent='Personal best: '+best.energy.toFixed(1);
 $('resultsIntro').textContent=game.completed?'A small world, carried through the disturbance.':'The cycle grew quiet. Another world offers a new beginning.';
 $('resultDetail').textContent=(game.completed-game.gathered)+' natural completions + '+game.gathered+' lives gathered in light. '+game.embryoDeaths+' embryos did not acquire a soul in time.';
 $('resultLedger').textContent='Energy: '+CONFIG.initial+' initial + '+game.created.toFixed(1)+' created − '+game.destroyed.toFixed(1)+' lost to sinks − '+game.failedEnergy.toFixed(1)+' lost to embryos = '+game.totals().total.toFixed(1)+' remaining. Gathering returned '+game.gatheredEnergy.toFixed(1)+' held energy without adding to the total.';
 $('results').hidden=false;$('stage').inert=true;$('replay').focus();announce('The world rests. '+game.completed+' completed lives and '+energy.toFixed(1)+' energy created.');
}
$('begin').addEventListener('click',()=>begin($('worldSeed').value));$('replay').addEventListener('click',()=>begin(currentSeed));
function openWorldPicker(){
 $('helpOverlay').hidden=true;
 $('results').hidden=true;
 $('welcome').hidden=false;
 $('worldSeed').value=currentSeed;
 ui();requestDraw();$('worldSeed').focus();
}
$('chooseWorld').addEventListener('click',openWorldPicker);
$('newWorld').addEventListener('click',()=>{
 try{const value=new Uint32Array(1);crypto.getRandomValues(value);$('worldSeed').value=value[0];}
 catch{$('worldSeed').value=Date.now()>>>0;}
 const seed=$('worldSeed').value;
 openWorldPicker();$('worldSeed').value=seed;
});
$('cancelWorld').addEventListener('click',()=>{
 $('welcome').hidden=true;
 if(game.finished){$('results').hidden=false;$('replay').focus();}
 else{paused=helpWasPaused;accumulator=0;last=0;}
 ui();requestDraw();
 if(!game.finished)canvas.focus();
});
$('pause').addEventListener('click',()=>setPause(!paused));$('plant').addEventListener('click',place);
function rotate(amount){selectionShown=true;selected=wrap(selected+amount);ui();requestDraw();}

$('sanctuaryButton').addEventListener('click',e=>{if(suppressSanctuaryClick){e.preventDefault();suppressSanctuaryClick=false;return;}sanctuaryArmed=!sanctuaryArmed;ui();requestDraw();if(sanctuaryArmed)announce('Choose a location for the sanctuary.');});
$('sanctuaryButton').addEventListener('pointerdown',e=>{if(e.button!==0||$('sanctuaryButton').disabled)return;sanctuaryDrag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};$('sanctuaryButton').setPointerCapture?.(e.pointerId);});
$('sanctuaryButton').addEventListener('pointermove',e=>{if(!sanctuaryDrag||e.pointerId!==sanctuaryDrag.id)return;if(!sanctuaryDrag.moved&&Math.hypot(e.clientX-sanctuaryDrag.x,e.clientY-sanctuaryDrag.y)>8){sanctuaryDrag.moved=true;sanctuaryArmed=true;}if(sanctuaryDrag.moved){e.preventDefault();if(selectFromClient(e.clientX,e.clientY))requestPointerUpdate();}});
$('sanctuaryButton').addEventListener('pointerup',e=>{if(!sanctuaryDrag||e.pointerId!==sanctuaryDrag.id)return;const moved=sanctuaryDrag.moved;sanctuaryDrag=null;if(!moved)return;e.preventDefault();suppressSanctuaryClick=true;setTimeout(()=>{suppressSanctuaryClick=false;},0);if(selectFromClient(e.clientX,e.clientY))deploySanctuary();else{sanctuaryArmed=false;toast('Drag the sanctuary onto the world.');ui();requestDraw();}});
$('sanctuaryButton').addEventListener('pointercancel',()=>{sanctuaryDrag=null;sanctuaryArmed=false;ui();requestDraw();});
$('help').addEventListener('click',()=>{helpWasPaused=paused;paused=true;accumulator=0;last=0;$('helpOverlay').hidden=false;ui();requestDraw();$('closeHelp').focus();});
function closeMenu(){ $('helpOverlay').hidden=true;paused=helpWasPaused;accumulator=0;last=0;ui();requestDraw();$('help').focus(); }
$('closeHelp').addEventListener('click',closeMenu);
$('worldDetails').addEventListener('toggle',ui);
function selectFromClient(clientX,clientY){const theta=renderer.selectionFromClient(clientX,clientY);if(theta===null)return false;selectionShown=true;selected=theta;return true;}
function selectFromPointer(e){return selectFromClient(e.clientX,e.clientY);}
function quickDeploySanctuary(e){e.preventDefault();if(e.timeStamp-lastQuickSanctuary<500)return;lastQuickSanctuary=e.timeStamp;deploySanctuary();}
canvas.addEventListener('pointermove',e=>{if(artMode){showArtExit();return;}if(selectFromPointer(e))requestPointerUpdate();});
canvas.addEventListener('click',e=>{if(artMode){showArtExit();return;}if(selectFromPointer(e)){if(e.ctrlKey)quickDeploySanctuary(e);else if(sanctuaryArmed)deploySanctuary();else place();}});
canvas.addEventListener('contextmenu',e=>{if(artMode){e.preventDefault();showArtExit();return;}if(selectFromPointer(e))quickDeploySanctuary(e);});
function showArtExit(){if(!artMode)return;$('stage').classList.add('art-ui');clearTimeout(artTimer);artTimer=setTimeout(()=>$('stage').classList.remove('art-ui'),2200);}
function applyArt(value){artMode=value;document.body.classList.toggle('art-mode',value);$('stage').classList.toggle('art-view',value);$('art').setAttribute('aria-pressed',String(value));if(value)showArtExit();else{clearTimeout(artTimer);$('stage').classList.remove('art-ui');}resize();requestDraw();}
async function toggleArt(){if(!started||isOverlayOpen())return;if(artMode){applyArt(false);if(document.fullscreenElement===$('stage'))try{await document.exitFullscreen();}catch{}}else{applyArt(true);if($('stage').requestFullscreen)try{await $('stage').requestFullscreen();}catch{/* Retain viewport art mode when native fullscreen is unavailable. */}}}
$('art').addEventListener('click',()=>{closeMenu();toggleArt();});$('exitArt').addEventListener('click',toggleArt);$('stage').addEventListener('pointermove',showArtExit);canvas.addEventListener('dblclick',()=>{if(artMode)toggleArt();});
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===$('stage'))applyArt(true);else if(artMode)applyArt(false);});
document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;if(document.hidden&&started&&!game.finished){paused=true;ui();}});
document.addEventListener('keydown',e=>{
 const active=document.activeElement,editing=['INPUT','SELECT','TEXTAREA'].includes(active.tagName);
 if(e.code==='Escape'){if(!$('welcome').hidden){$('cancelWorld').click();return;}if(artMode){toggleArt();return;}if(!$('helpOverlay').hidden){$('closeHelp').click();return;}if(sanctuaryArmed){sanctuaryArmed=false;ui();requestDraw();return;}}
 // Keep keyboard focus within the currently open dialog.
 if(e.code==='Tab'&&isOverlayOpen()){const panel=!$('helpOverlay').hidden?$('helpOverlay'):!$('results').hidden?$('results'):$('welcome'),focusable=[...panel.querySelectorAll('button,input,summary')].filter(el=>!el.disabled&&el.getClientRects().length);if(focusable.length){if(e.shiftKey&&active===focusable[0]){e.preventDefault();focusable.at(-1).focus();}else if(!e.shiftKey&&active===focusable.at(-1)){e.preventDefault();focusable[0].focus();}}return;}
 if(editing||isOverlayOpen())return;
 if(e.code==='KeyF'&&!e.repeat){e.preventDefault();toggleArt();}
 else if(e.code==='Space'&&(artMode||!['BUTTON','SUMMARY'].includes(active.tagName))){e.preventDefault();setPause(!paused);}
 else if(e.code==='ArrowLeft'){e.preventDefault();rotate(-TAU/24);}
 else if(e.code==='ArrowRight'){e.preventDefault();rotate(TAU/24);}
 else if(e.code==='Enter'&&!e.repeat&&active.tagName!=='BUTTON'){e.preventDefault();if(sanctuaryArmed)deploySanctuary();else place();}
});
function frame(now){
 const elapsed=last?Math.min(.1,(now-last)/1000):0;last=now;
 if(started&&!paused&&!game.finished&&!document.hidden){
  accumulator+=elapsed;
  while(accumulator>=DT){game.step();accumulator-=DT;drawRequested=true;}
 }
 // Input changes state immediately; paint and pointer HUD work coalesce here.
 const drawDue=!document.hidden&&now-lastDraw>=1000/30&&(drawRequested||started&&!paused);
 if((uiRequested&&drawDue)||(started&&!paused&&!document.hidden&&now-lastUI>120)){uiRequested=false;ui();lastUI=now;}
 if(drawDue){renderer.render();drawRequested=false;lastDraw=now;}
 requestAnimationFrame(frame);
}
new ResizeObserver(()=>{resize();requestDraw();}).observe($('stage'));
window.addEventListener('resize',()=>{resize();requestDraw();});
begin(73);requestAnimationFrame(frame);
window.lifestream={get model(){return game},begin,pause:()=>setPause(true),step(seconds){if(!started)return;paused=true;for(let i=0;i<Math.round(seconds/DT);i++)game.step();ui();renderer.render();drawRequested=false;},get selection(){return selected},get geometry(){return renderer.geometry}};

