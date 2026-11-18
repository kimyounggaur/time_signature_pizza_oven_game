import { F, N, num, cells, dur, lengthIn, parseFill, keyOf, shortKo, noteKo, meterKo, capacity, defaultGroups, eq, sameNote } from './engine.js';
import { PIECES, METERS, makeOrder, makeItem, meterKey, menuKeys, orderText, tagKo, buildText, pickPrompt, pickOptions, sceneText, stateLabels, closeText, newText, passNeed, scoreAlt } from './orders.js';
import { DAYS } from './seeds.js';
import { loadSave, writeSave } from './storage.js';
import { Game } from './game.js';
import { boardSVG, rhythmSVG, traySVG, doughSVG, timerSVG, ovenSceneSVG, stampSVG } from './render.js';
import { AudioEngine } from './audio.js';
import { selfTests } from './selftest.js';

const $=id=>document.getElementById(id), esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loaded=loadSave();let persistent=loaded.persistent, boardKey='', stripKey='', cardKey='', screenKey='', menuTab=0, replayScene=false, inRender=false, activeIndex=-1, menuRun=false,playRequest=0;
const store=save=>{persistent=writeSave(save)&&persistent;};
const game=new Game(loaded.save,()=>render(),store), tests=selfTests();
window.__tests=tests;
const audio=new AudioEngine({onState:()=>updateSound(),onFrame:frame=>{
  const s=game.state;
  if(s.playing==='hear')return;
  const hand=$('hand');if(hand){hand.setAttribute('visibility',frame.visible===false?'hidden':'visible');hand.setAttribute('transform',`rotate(${frame.angle} 170 170)`);}
  if(activeIndex!==frame.index||frame.all){document.querySelectorAll('.slice,.sn').forEach(el=>el.classList.toggle('on',frame.all||Number(el.dataset.i)===frame.index));activeIndex=frame.index;}
},onInterrupt:(reason,message)=>{if(menuRun){menuRun=false;menuRender();}else{game.stopBake(true);game.setState({playing:'',msg:{tone:'warn',text:message||'소리가 멈춰서 중단했어요. 소리를 켜고 다시 해 주세요.'}});updateSound();}}});
const soundSpec=()=>{const it=game.item();if(it.kind==='scene'){const st=it.states[game.state.st];return {...st,meter:st.m,groups:st.g};}return {...it,meter:it.m,groups:it.g,fill:game.state.playing==='hear'?it.target:game.state.fill};};
function clearVisual(){const hand=$('hand');if(hand)hand.setAttribute('visibility','hidden');document.querySelectorAll('.on').forEach(el=>el.classList.remove('on'));activeIndex=-1;}
function stopAudio(){playRequest++;audio.stop();menuRun=false;clearVisual();}
function updateSound(){if($('sound')){$('sound').hidden=audio.available&&!game.save.settings.muted;$('sound').textContent=game.save.settings.muted?'소리 꺼짐':'소리 켜기';}}
async function unlock(){const ok=await audio.unlock();if(!ok)game.setState({msg:{tone:'warn',text:'소리를 쓰기 어려워요. 화면으로 이어갈 수 있어요.'}});updateSound();return ok;}
async function play(kind='bake') {
  stopAudio(); const request=playRequest;await unlock();if(request!==playRequest)return;
  const options={...game.save.settings,kind,onEnd:()=>{clearVisual();if(kind==='bake')game.completeBake();else game.setState({playing:''});}};
  if(kind!=='bake')game.setState({playing:kind});
  audio.play(soundSpec(),options);
}
async function bake(){const result=game.bakePress();if(result?.play)await play();}
function go(screen){if(location.hash==='#test')history.replaceState(null,'',location.pathname);stopAudio();if(game.state.screen==='shift'&&!replayScene){if(game.state.phase==='bake')game.stopBake(true);game.checkpoint();}replayScene=false;game.setState({screen,playing:''});$('screen').focus();}
function start(id){stopAudio();replayScene=false;game.startDay(id);if(id==='d0'&&!game.save.settings.soundChecked)soundCheck();}

// Keep the board and the six tray controls alive throughout playback.
function boardView(){
  const s=game.state,it=game.item();if(!it)return {};
  if(it.kind==='scene'){const st=it.states[s.st];return {meter:st.m,groups:st.g,fill:st.fill,interactive:false};}
  const base={meter:it.m,slot:it.slot,fill:s.fill,help:!it.final||s.assisted,interactive:s.phase==='build',ghost:s.ghost};
  if(s.phase==='pick'){
    if(it.pick==='dough')return {...base,fill:[],len:s.sel===null?null:F(pickOptions(it)[s.sel],8),groups:[],hub:{m:it.m},preview:true,previewLabel:s.sel===null?'':pickOptions(it)[s.sel]+'칸'};
    return s.sel===null?{len:null,fill:[],interactive:false,hub:{text:'?'}}:{meter:METERS[s.sel],fill:[],interactive:false,preview:true};
  }
  return base;
}
function renderBoard(){const view=boardView(),key=JSON.stringify(view);if(key===boardKey)return;const focus=document.activeElement?.closest?.('.slice'),i=focus?Number(focus.dataset.i):null;boardKey=key;$('boardwrap').innerHTML=boardSVG(view);if(i!==null){const pieces=$('boardwrap').querySelectorAll('.slice');(pieces[Math.min(i,pieces.length-1)]||$('bake')).focus();}}
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function gameRender(){
  const s=game.state,it=game.item();if(!it)return;
  const free=s.screen==='free',scene=it.kind==='scene',day=DAYS.find(d=>d.id===s.day);
  $('app').hidden=false;$('screen').hidden=true;
  setText('dayname',free?'자유 화덕':replayScene?'발견 장면':`${s.day.slice(1)}단 · ${day.name}`);
  const dots=free||replayScene?'':game.dayItems.filter(x=>x.kind==='order').map(o=>{const r=s.results.find(x=>x.id===o.id),current=it.id===o.id;return `<span class="dot ${current?'current':''} ${r?.recipe||''}" aria-label="${o.id} ${r?r.recipe==='full'?'한 번에 맞힘':'안내를 받고 맞힘':'아직'}${current?' 현재 주문':''}">${r?r.recipe==='full'?'●':'◐':'○'}</span>`;}).join('');
  if($('dots').innerHTML!==dots)$('dots').innerHTML=dots;
  const ck=free?'free'+meterKey(it.m):s.day+it.id+!!game.entry()?.redo;
  if(cardKey!==ck){cardKey=ck;
    $('scoreCard').hidden=true;$('card').classList.toggle('free-card',free);
    if(free){setText('tag','자유 화덕');$('order').innerHTML=METERS.map((m,i)=>`<button data-meter="${i}" aria-label="${meterKo(m)}" aria-pressed="${eq(capacity(m),it.len)&&meterKey(m)===meterKey(it.m)}">${m.num}<span class="meter-line"></span>${m.den}</button>`).join('');}
    else{setText('tag',scene?'발견 장면':tagKo(it,game.entry().redo));setText('order',scene?it.title:orderText(it));if(it.ask==='score'){$('scoreCard').hidden=false;$('scoreCard').innerHTML=rhythmSVG({fill:it.target,meter:it.m,width:150,height:34,plain:true,label:scoreAlt(it)});}}
  }
  renderBoard();
  const build=s.phase==='build',pick=s.phase==='pick',strip=['bake','serve'].includes(s.phase);
  $('tray').hidden=!build;$('choices').hidden=!(pick||scene);$('stripbox').hidden=!strip;
  for(const [i,button]of [...$('tray').querySelectorAll('button')].entries()){const n=PIECES[i];if(!button.dataset.ready){button.innerHTML=traySVG(n)+`<span>${shortKo(n)}</span><small>${num(cells(dur(n)))}칸</small>`;button.dataset.ready='1';button.setAttribute('aria-label',`${noteKo(n)}, ${num(cells(dur(n)))}칸`);}button.disabled=!it.tray?.some(x=>sameNote(x,n));}
  if(pick||scene){const options=scene?stateLabels(it):pickOptions(it);[...$('choices').querySelectorAll('button')].forEach((b,i)=>{b.hidden=i>=options.length;if(b.hidden)return;const text=scene?options[i]:it.pick==='dough'?options[i]+'칸':meterKo(options[i]);b.innerHTML=!scene&&it.pick==='meter'?`<span class="meter-choice">${options[i].num}<i></i>${options[i].den}</span>`:!scene&&it.pick==='dough'?doughSVG(options[i])+`<span>${esc(text)}</span>`:esc(text);b.setAttribute('aria-label',text);b.setAttribute('aria-pressed',String(i===(scene?s.st:s.sel)));});}
  if(strip){const key=keyOf(s.fill)+JSON.stringify(it.m)+$('stripbox').clientWidth;if(stripKey!==key){stripKey=key;$('stripbox').innerHTML=rhythmSVG({fill:s.fill,meter:it.m,slot:it.slot,len:it.len,width:Math.max(280,$('stripbox').clientWidth),height:68});}}
  ['build','pick','bake','serve','scene'].forEach(p=>{$('act-'+p).hidden=s.phase!==p;});
  if(s.phase==='build'){$('undo').disabled=!s.fill.length;$('clear').disabled=!s.fill.length&&!s.extra;setText('clear',s.extra?'그만하기':'비우기');}
  if(s.phase==='serve'){$('other').disabled=!game.canOther();setText('next',s.idx===s.queue.length-1?'마감하기':'다음 주문');setText('again',s.playing?'멈추기':'다시 듣기');}
  $('hear').hidden=it.ask!=='sound';setText('hear',s.playing?'멈추기':'주문 듣기');setText('sceneHear',s.playing?'멈추기':'들어 보기');setText('sceneNext',replayScene?'메뉴판으로':'알겠어요');
  let msg=s.msg||(scene?{text:sceneText(it)}:pick?{text:pickPrompt(it)}:build?buildText(s.assisted?{...it,final:false}:it,s.fill,s.ghost):{text:''});
  const tip=inlineTip();if(tip&&!s.msg)msg={text:tip};
  setText('readout',msg.text);$('readout').className='readout '+(msg.tone||'');
  updateSound();
}
function shellScreen(html,key){$('app').hidden=true;$('screen').hidden=false;if(screenKey!==key){screenKey=key;$('screen').innerHTML=html;}}
const header=(name,subtitle='')=>`<header class="screen-head"><button data-go="title" class="icon-button" aria-label="처음으로">←</button><div><p class="eyebrow">똑딱 화덕</p><h1 class="screen-title">${name}</h1></div><button data-settings class="icon-button" aria-label="설정">설정</button></header>${subtitle?`<p class="lead">${subtitle}</p>`:''}`;
function titleRender(){const save=game.save,count=Object.values(save.menu).reduce((n,a)=>n+a.length,0);shellScreen(`<div class="title-screen"><p class="eyebrow">한 조각씩, 박자가 들려요</p><h1>박자표<br><span>피자 화덕</span></h1><div class="hero">${ovenSceneSVG()}</div><p class="lead">같은 크기의 조각, 서로 다른 리듬.<br>피자를 만들며 박자표를 배워요.</p><div class="title-actions">${save.active?'<button class="primary" data-resume>이어서 영업</button>':''}<button class="${save.active?'secondary':'primary'}" data-go="map">영업일 지도</button><div class="two-actions"><button data-free>자유 화덕</button><button data-go="menu">메뉴판 <small>${count}/69</small></button></div></div><p class="caption">재촉하지 않아요. 만들고, 듣고, 다시 해 봐요.</p><button class="quiet" data-settings>소리와 화면 설정</button></div>`,'title'+JSON.stringify(save));}
function mapRender(){shellScreen(header('영업일 지도','도장을 모으며 새로운 주문을 만나 봐요.')+`<div class="day-list">${DAYS.map((d,i)=>{const unlocked=i===0||game.save.days[DAYS[i-1].id].passed,r=game.save.days[d.id],n=d.items.filter(x=>!x.states).length;return `<button class="day-card ${unlocked?'':'locked'}" data-day="${d.id}" ${unlocked?'':'aria-disabled="true"'}><span class="day-num">${i}</span><span><strong>${d.name}</strong><small>${unlocked?`주문 ${n}개 · ● ${r.best}/${n}`:'앞 영업일을 통과하면 열려요.'}</small></span><span class="stamp">${r.passed?stampSVG(i):unlocked?'→':'잠김'}</span></button>`;}).join('')}</div><button class="secondary wide" data-free>수업에서 자유롭게 · 자유 화덕</button>`,'map'+JSON.stringify(game.save.days));}
function menuRender(){const m=METERS[menuTab],mk=meterKey(m),have=game.state.menu[mk]||[],keys=menuKeys(m),shelf=game.state.shelf[mk]||[],scenes=DAYS.flatMap(d=>d.items.filter(i=>i.states&&game.save.scenes.includes(i.id)));shellScreen(header('나의 메뉴판',`묶음이 보이는 리듬을 모아요. ${Object.values(game.state.menu).reduce((n,a)=>n+a.length,0)}/69칸을 찾았어요.`)+`<nav class="menu-tabs" aria-label="박자표">${METERS.map((x,i)=>`<button data-tab="${i}" aria-pressed="${i===menuTab}">${meterKey(x)}<small>${(game.state.menu[meterKey(x)]||[]).length}/${menuKeys(x).length}</small></button>`).join('')}</nav><div class="menu-grid">${keys.map((k,i)=>have.includes(k)?`<button class="recipe" data-recipe="${esc(k)}" data-mk="${menuTab}" aria-label="리듬 ${i+1} 듣기: ${parseFill(k).map(noteKo).join(', ')}">${rhythmSVG({fill:parseFill(k),meter:m,width:190,height:70})}<small>${menuRun?'다른 리듬 듣기':'듣기'}</small></button>`:`<div class="recipe unknown" aria-label="아직 찾지 않은 리듬">${i+1}<small>새 리듬을 찾아요</small></div>`).join('')}</div><section class="shelf"><h2>엇박 선반</h2><p>박 경계를 걸친 리듬도 소중하게 모아요.</p>${shelf.length?shelf.map(k=>`<button class="recipe" data-recipe="${esc(k)}" data-mk="${menuTab}">${rhythmSVG({fill:parseFill(k),meter:m,width:280,height:68})}<small>듣기</small></button>`).join(''):'<p class="caption">조각 음과 큰 박이 어긋나는 소리를 찾아보세요.</p>'}</section><section><h2>다시 보는 발견</h2>${scenes.length?scenes.map(sc=>`<button class="scene-link" data-scene="${sc.id}">${sc.title} →</button>`).join(''):'<p class="caption">영업 중 만난 발견 장면이 여기에 모여요.</p>'}</section><button class="secondary wide" data-free>자유 화덕에서 새 리듬 찾기</button>${menuRun?'<button class="primary floating-stop" data-menu-stop>멈추기</button>':''}`,'menu'+menuTab+JSON.stringify(game.state.menu)+JSON.stringify(game.state.shelf)+menuRun+game.save.scenes.join());}
function closeRender(){const s=game.state,clean=s.results.filter(r=>r.recipe==='full').length,pass=clean>=passNeed(s.results.length);shellScreen(header('오늘의 영업 마감')+`<div class="close-stat">${pass?stampSVG(Number(s.day.slice(1))):timerSVG('calm')}<h2>${pass?'도장을 받았어요':'한 번 더 익혀 봐요'}</h2><p>${closeText(clean,s.results.length)}</p>${s.fresh||s.freshShelf?`<p>${newText(s.fresh,s.freshShelf)}</p>`:''}</div><div class="title-actions"><button class="primary" data-go="map">영업일 지도로</button><div class="two-actions"><button data-day="${s.day}">다시 영업하기</button><button data-go="menu">메뉴판 보기</button></div></div><h2>주문 기록</h2><div class="records">${s.results.map(r=>`<p class="record"><span>${r.recipe==='full'?'●':'◐'}</span><span>${esc(r.text)}${r.recipe==='half'?'<small>안내를 받고 맞힘'+(r.again==='full'?' · 다시 내서는 한 번에 맞힘':'')+'</small>':''}</span></p>`).join('')}</div>`,'close'+JSON.stringify(s.results));}
function render(){if(inRender)return;inRender=true;try{const s=game.state;document.documentElement.dataset.motion=game.save.settings.motion;const gaming=['shift','free'].includes(s.screen);if(!gaming){boardKey='';cardKey='';}if(gaming)gameRender();else if(s.screen==='map')mapRender();else if(s.screen==='menu')menuRender();else if(s.screen==='close')closeRender();else titleRender();}finally{inRender=false;}}

function markTip(name){if(!game.save.settings.tips.includes(name)){game.save.settings.tips.push(name);store(game.save);}}
function inlineTip(){document.querySelectorAll('.tutorial-point').forEach(el=>el.classList.remove('tutorial-point'));const s=game.state,o=game.item();if(s.screen!=='shift'||!o||o.kind!=='order')return '';const tips=game.save.settings.tips,point=(id)=>$(id)?.classList.add('tutorial-point');
  if(o.id==='d0-01'&&s.phase==='build'){if(!s.fill.length&&!tips.includes('tray'))point('tray');else if(s.fill.length)markTip('tray');if(lengthIn(o.len,s.fill).state==='exact'&&!tips.includes('bake'))point('bake');}
  if(o.id==='d0-02'&&s.phase==='build'&&s.fill.length&&!tips.includes('remove')){point('boardwrap');return '조각을 누르면 빠져요.';}
  if(o.id==='d1-01'&&s.phase==='build'&&!tips.includes('groups')){point('boardwrap');return '큰 점이 박, 작은 점이 박을 나눈 자리예요.';}
  if(o.id==='d1-03'&&s.phase==='pick'&&!tips.includes('pick'))point('choices');
  if(s.day==='d2'&&s.phase==='serve'&&!tips.includes('other')){point('other');return '다른 리듬을 찾으면 메뉴판에 올라가요.';}return '';
}
function settings(){stopAudio();if(game.state.phase==='bake')game.stopBake(true);else if(game.state.playing)game.setState({playing:''});const set=game.save.settings;
  $('settingsBody').innerHTML=`<p class="eyebrow">편안하게 배워요</p><h2>소리와 화면</h2><label class="setting-row"><span>전체 음량</span><input id="volume" type="range" min="0" max="1" step="0.05" value="${set.volume}" aria-label="전체 음량"></label>${[['muted','소리 끄기'],['slow','느리게 듣기'],['subs','분할 클릭 듣기']].map(([key,label])=>`<label class="setting-row"><span>${label}</span><input type="checkbox" data-setting="${key}" ${set[key]?'checked':''}></label>`).join('')}<label class="setting-row"><span>움직임</span><select id="motion"><option value="system">기기 설정 따르기</option><option value="reduced">줄이기</option><option value="full">모두 보기</option></select></label><button data-tips class="secondary wide">조작 안내 다시 보기</button><button data-soundcheck class="secondary wide">소리 확인하기</button><p class="caption">${persistent?'이 기기에 학습 기록을 저장해요.':'이 기기에서는 기록이 저장되지 않아요.'}</p><p class="caption">자가검사 ${tests.passed}/${tests.total} · <a href="#test">결과 보기</a></p><p class="caption">키보드: 숫자 1~6 조각 · Backspace 하나 빼기 · Enter 굽기/확정 · 0 전체화면</p>`;$('motion').value=set.motion;$('settingsDialog').showModal();
}
async function soundCheck(){stopAudio();$('tipBody').innerHTML=`${timerSVG('happy')}<h2>소리가 들리나요?</h2><p>기기의 음량과 무음 설정을 확인해 주세요.</p><button data-check-play class="secondary wide">음 하나 다시 듣기</button><div class="two-actions"><button data-check-yes class="primary">들려요</button><button data-check-no>안 들려요</button></div><p id="soundHelp" class="caption"></p>`;$('tipNext').textContent='지금은 건너뛰기';$('tipDialog').showModal();await checkTone();}
async function checkTone(){audio.setVolume(game.save.settings.volume,game.save.settings.muted);await audio.testTone();}
function endSoundCheck(checked){stopAudio();game.save.settings.soundChecked=checked;store(game.save);$('tipDialog').close();}

// Persistent controls: attach listeners once, with delegation only for screen cards.
$('back').onclick=()=>go(replayScene?'menu':game.state.screen==='free'?'title':'map');$('sound').onclick=async()=>{game.save.settings.muted=false;store(game.save);audio.setVolume(game.save.settings.volume,false);await unlock();render();};$('settings').onclick=settings;
$('tray').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;game.place(PIECES[[...$('tray').querySelectorAll('button')].indexOf(b)]);};
$('boardwrap').onclick=e=>{const p=e.target.closest('.slice');if(p){markTip('remove');game.removeAt(Number(p.dataset.i));}};
$('boardwrap').onkeydown=e=>{const p=e.target.closest('.slice');if(p&&['Enter',' '].includes(e.key)){e.preventDefault();markTip('remove');game.removeAt(Number(p.dataset.i));}};
$('choices').onclick=e=>{const b=e.target.closest('button');if(!b)return;const i=Number(b.dataset.choice);if(game.state.phase==='scene'){stopAudio();game.setState({st:i,playing:'',msg:null});}else{markTip('pick');game.choose(i);}};
$('card').onclick=e=>{const b=e.target.closest('[data-meter]');if(b){stopAudio();game.changeMeter(Number(b.dataset.meter));}};
$('undo').onclick=()=>{markTip('remove');game.removeAt(game.state.fill.length-1);};$('clear').onclick=()=>game.state.extra?game.quitExtra():game.clear();$('bake').onclick=()=>{markTip('bake');if(game.item()?.id==='d1-01')markTip('groups');bake();};
$('confirm').onclick=()=>{stopAudio();if(game.state.playing)game.setState({playing:''});const result=game.confirmPick();if(result?.play)play();};$('stop').onclick=()=>{stopAudio();game.stopBake();};
$('hear').onclick=()=>game.state.playing?(stopAudio(),game.setState({playing:''})):play('hear');$('again').onclick=()=>game.state.playing?(stopAudio(),game.setState({playing:''})):play('listen');
$('other').onclick=()=>{stopAudio();markTip('other');game.otherFill();};$('next').onclick=()=>{stopAudio();if(game.state.day==='d2'&&game.state.phase==='serve')markTip('other');game.nextItem();};$('sceneHear').onclick=()=>game.state.playing?(stopAudio(),game.setState({playing:''})):play('scene');$('sceneNext').onclick=()=>{stopAudio();if(replayScene)go('menu');else game.nextItem();};
$('screen').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.go)go(b.dataset.go);else if(b.hasAttribute('data-resume')){stopAudio();game.resume();}else if(b.hasAttribute('data-free')){stopAudio();replayScene=false;game.startFree();}else if(b.dataset.day){const i=DAYS.findIndex(d=>d.id===b.dataset.day);if(i===0||game.save.days[DAYS[i-1].id].passed)start(b.dataset.day);else{b.setAttribute('aria-label','앞 영업일을 통과하면 열려요.');}}else if(b.hasAttribute('data-settings'))settings();else if(b.dataset.tab){stopAudio();menuTab=Number(b.dataset.tab);render();}else if(b.dataset.recipe){stopAudio();const request=playRequest;await unlock();if(request!==playRequest)return;menuRun=true;const m=METERS[Number(b.dataset.mk)];audio.play({meter:m,fill:parseFill(b.dataset.recipe)},{...game.save.settings,kind:'listen',onEnd:()=>{menuRun=false;render();}});render();}else if(b.hasAttribute('data-menu-stop')){stopAudio();render();}else if(b.dataset.scene){const day=DAYS.find(d=>d.items.some(i=>i.id===b.dataset.scene));game.loadDay(day.id);replayScene=true;const index=game.dayItems.findIndex(i=>i.id===b.dataset.scene);game.enter(0,{screen:'shift',day:day.id,queue:[{i:index,redo:false}]});}};
$('closeSettings').onclick=()=>$('settingsDialog').close();$('settingsDialog').onchange=e=>{const t=e.target,s=game.save.settings;if(t.dataset.setting)s[t.dataset.setting]=t.checked;else if(t.id==='volume')s.volume=Number(t.value);else if(t.id==='motion')s.motion=t.value;audio.setVolume(s.volume,s.muted);store(game.save);render();};
$('settingsDialog').onclick=e=>{if(e.target.closest('[data-tips]')){game.save.settings.tips=[];store(game.save);$('settingsDialog').close();render();}if(e.target.closest('[data-soundcheck]')){$('settingsDialog').close();soundCheck();}};
$('tipNext').onclick=()=>endSoundCheck(false);$('tipDialog').onclick=e=>{if(e.target.closest('[data-check-play]'))checkTone();if(e.target.closest('[data-check-yes]'))endSoundCheck(true);if(e.target.closest('[data-check-no]')){setText('soundHelp','음량을 올리고 무음 설정을 풀어 주세요. 다시 듣거나 건너뛸 수 있어요.');checkTone();}};
$('tipDialog').addEventListener('cancel',()=>stopAudio());$('settingsDialog').addEventListener('cancel',()=>render());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audio.playing){stopAudio();game.stopBake(true);}});
window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const s=game.state;if(e.key==='0'){e.preventDefault();if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});return;}if(!['shift','free'].includes(s.screen))return;if(/^[1-6]$/.test(e.key)){e.preventDefault();const i=Number(e.key)-1;if(s.phase==='build')game.place(PIECES[i]);else if(s.phase==='pick')game.choose(i);}else if(e.key==='Backspace'&&s.phase==='build'){e.preventDefault();game.removeAt(s.fill.length-1);}else if(e.key==='Enter'&&e.target===document.body){e.preventDefault();if(s.phase==='build')bake();else if(s.phase==='pick')$('confirm').click();else if(['serve','scene'].includes(s.phase))$('next').click();}else if(e.key==='Escape'&&s.playing){stopAudio();game.stopBake();}});
window.addEventListener('error',e=>{console.error(e.error||e.message);$('fatal').hidden=false;});window.addEventListener('unhandledrejection',e=>{console.error(e.reason);$('fatal').hidden=false;});
function testScreen(){stopAudio();$('settingsDialog').close();$('tipDialog').close();game.setState({screen:'test',playing:''});$('app').hidden=true;$('screen').hidden=false;$('screen').innerHTML=header('자가검사')+`<p class="lead">${tests.passed}/${tests.total} 통과</p>${tests.groups.map(g=>`<section><h2>${g.name} · ${g.passed}/${g.total}</h2>${g.results.filter(r=>!r.ok).map(r=>`<p>${esc(r.name)}: ${esc(r.error)}</p>`).join('')}</section>`).join('')}<p class="caption">실기기 청취·강사·학습자 검수는 별도 확인이 필요해요.</p>`;window.__state=()=>structuredClone(game.state);window.__item=()=>game.item();window.__t={game,audio,startDay:id=>start(id),solutions:undefined};}
window.addEventListener('hashchange',()=>{if(location.hash==='#test')testScreen();else {screenKey='';render();}});
if(location.hash==='#test')testScreen();else if(/^#d[0-4]$/.test(location.hash))start(location.hash.slice(1));else render();
