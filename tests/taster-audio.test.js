import test from 'node:test';
import assert from 'node:assert/strict';
import { M, parseFill } from '../src/engine.js';
import { AudioEngine, createAudioPlan, createTasterPlan } from '../src/audio.js';

const spec = (n=2, fill=Array(n).fill('4').join(' ')) => ({meter:M(n,4),fill:parseFill(fill)});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

function clockAudio(work,{state='running',supported=true,reject=false}={}) {
  const names=['AudioContext','webkitAudioContext','requestAnimationFrame','cancelAnimationFrame','performance'];
  const saved=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let wall=1000,next=0,contexts=0;
  const raf=new Map(),sources=[],params=[];
  const param=()=>{const p={value:0,values:[],setValueAtTime(v,t){this.values.push([v,t]);},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}};params.push(p);return p;};
  const node=kind=>{const n={kind,gain:param(),frequency:param(),Q:param(),starts:[],stops:[],connect(){},disconnect(){},addEventListener(){},start(t){this.starts.push(t);},stop(t){this.stops.push(t);}};if(kind==='tone'||kind==='noise')sources.push(n);return n;};
  class Context {
    constructor(){contexts++;this.currentTime=10;this.state=state;this.sampleRate=128;this.destination={};this.listeners={};this.resumeCalls=0;}
    createGain(){return node('gain');}createOscillator(){return node('tone');}createBufferSource(){return node('noise');}createBiquadFilter(){return node('filter');}
    createBuffer(){return{getChannelData:()=>new Float32Array(128)};}addEventListener(n,fn){this.listeners[n]=fn;}resume(){this.resumeCalls++;return reject?Promise.reject(new Error('denied')):new Promise(()=>{});}close(){this.state='closed';}
  }
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>wall}});
  if(supported)globalThis.AudioContext=Context;else delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  globalThis.requestAnimationFrame=fn=>{const id=++next;raf.set(id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>raf.delete(id);
  const controls={sources,params,raf,get contexts(){return contexts;},advance(ms){wall+=ms;const calls=[...raf.values()];raf.clear();calls.forEach(fn=>fn());}};
  const restore=()=>{for(const n of names){if(saved[n])Object.defineProperty(globalThis,n,saved[n]);else delete globalThis[n];}};
  try{const result=work(controls);if(result?.then)return result.finally(restore);restore();return result;}catch(error){restore();throw error;}
}

test('Q10 taster has zero prelude, one exact bar and no end-point note',()=>{
  for(const n of [2,3]){
    const p=createTasterPlan(spec(n)),tones=p.events.filter(e=>e.type==='tone'),beats=p.events.filter(e=>e.type==='click');
    assert.equal(p.lead,0);near(p.end,n*.6);assert.equal(tones.length,n);assert.equal(beats.length,n);
    tones.forEach((e,i)=>{near(e.time,i*.6);near(e.duration,.6);assert.ok(e.time<p.end);});
    assert.deepEqual(beats.map(e=>e.level),n===2?[0,1]:[0,1,1]);
  }
  const regular=createAudioPlan(spec(3));near(regular.lead,1.8);near(regular.end,5.6);assert.equal(regular.events.filter(e=>e.type==='tone').length,6);
});

test('Q10 slow taster stretches all sound and visual intervals by 1.5',()=>{
  const p=createTasterPlan(spec(3),{slow:true});near(p.end,2.7);
  p.beats.forEach((b,i)=>near(b.time,i*.9));p.events.filter(e=>e.type==='tone').forEach((e,i)=>{near(e.time,i*.9);near(e.duration,.9);});
});

test('Q11 muted and zero volume never construct audio or wait before visual completion',()=>{
  for(const options of [{muted:true},{volume:0}])clockAudio(c=>{
    const frames=[];let ended=0;const a=new AudioEngine({onFrame:f=>frames.push(f)});
    a.playTaster(spec(),{...options,onEnd:()=>ended++});
    assert.equal(c.contexts,0);assert.equal(a.run.perf,true);assert.equal(frames.at(-1).beatIndex,0);
    c.advance(600);assert.equal(frames.at(-1).beatIndex,1);c.advance(600);assert.equal(ended,1);assert.equal(a.run,null);assert.equal(c.raf.size,0);
    c.advance(1200);assert.equal(ended,1);a.destroy();
  });
});

test('Q11 absent Web Audio still shows all beats and completes',()=>clockAudio(c=>{
  const frames=[];let ended=0;const a=new AudioEngine({onFrame:f=>frames.push(f)});
  a.playTaster(spec(3),{onEnd:()=>ended++});assert.equal(a.run.perf,true);
  c.advance(600);assert.equal(frames.at(-1).noteIndex,1);c.advance(600);assert.equal(frames.at(-1).noteIndex,2);c.advance(600);assert.equal(ended,1);a.destroy();
},{supported:false}));

test('Q11 delayed activation cannot add late sound to a visual run',()=>clockAudio(c=>{
  let ended=0;const a=new AudioEngine();a.playTaster(spec(),{onEnd:()=>ended++});
  assert.ok(a.ctx.resumeCalls);assert.equal(c.sources.length,0);assert.equal(a.run.perf,true);
  a.ctx.state='running';a.ctx.listeners.statechange();assert.equal(c.sources.length,0);
  c.advance(1200);assert.equal(ended,1);a.destroy();
},{state:'suspended'}));

test('Q11 rejected activation cannot block a visual-only taster',async()=>{
  await clockAudio(async c=>{
    let ended=0;const a=new AudioEngine();a.playTaster(spec(),{onEnd:()=>ended++});
    await Promise.resolve();assert.equal(c.sources.length,0);c.advance(1200);assert.equal(ended,1);a.destroy();
  },{state:'suspended',reject:true});
});

test('Q10 audible taster schedules only one bar together and honors output latency',()=>clockAudio(c=>{
  const frames=[];const a=new AudioEngine({onFrame:f=>frames.push(f)});a.playTaster(spec(3),{requestId:7});
  assert.equal(c.sources.length,6);assert.ok(c.sources.every(n=>n.starts.length===1));
  const tones=c.sources.filter(n=>n.kind==='tone');tones.forEach((n,i)=>near(n.starts[0],10.04+i*.6));
  assert.equal(frames.at(-1).beatIndex,-1,'do not highlight before scheduled audible start');
  a.ctx.outputLatency=.1;a.ctx.currentTime=10.74;c.advance(100);
  assert.equal(frames.at(-1).owner,'taster');assert.equal(frames.at(-1).requestId,7);assert.equal(frames.at(-1).beatIndex,1);assert.equal(frames.at(-1).noteIndex,1);near(frames.at(-1).angle,90);
  a.destroy();
}));

test('Q12 stop cancels sources and RAF and never calls old completion',()=>clockAudio(c=>{
  const frames=[];let ended=0;const a=new AudioEngine({onFrame:f=>frames.push(f)});a.playTaster(spec(),{onEnd:()=>ended++});const source=c.sources.slice();
  a.stop();assert.ok(source.every(n=>n.stops.at(-1)===undefined));assert.equal(c.raf.size,0);assert.equal(frames.at(-1).owner,'taster');assert.equal(frames.at(-1).visible,false);
  c.advance(5000);assert.equal(ended,0);a.destroy();
}));

test('Q12 canceled delayed activation cannot restart playback or create sources',()=>clockAudio(c=>{
  let ended=0;const a=new AudioEngine();a.playTaster(spec(),{onEnd:()=>ended++});a.stop();
  a.ctx.state='running';a.ctx.listeners.statechange();c.advance(5000);
  assert.equal(c.sources.length,0);assert.equal(c.raf.size,0);assert.equal(ended,0);a.destroy();
},{state:'suspended'}));

test('Q12 background interruption identifies owner and does not complete the bar',()=>clockAudio(c=>{
  let ended=0;const interrupted=[];const a=new AudioEngine({onInterrupt:(...args)=>interrupted.push(args)});
  a.playTaster(spec(),{onEnd:()=>ended++});a._interrupt('hidden');
  assert.equal(interrupted[0][0],'hidden');assert.equal(interrupted[0][2],'taster');assert.equal(c.raf.size,0);c.advance(2000);assert.equal(ended,0);a.destroy();
}));

test('Q12 foreground audio freeze continues the remaining visual bar once',()=>clockAudio(c=>{
  let ended=0;const a=new AudioEngine();a.playTaster(spec(3),{onEnd:()=>ended++});
  c.advance(850);assert.equal(a.run.perf,true);assert.ok(a.run.lastElapsed>.7);assert.equal(ended,0);
  assert.ok(c.sources.every(n=>n.stops.at(-1)===undefined));
  c.advance(1000);assert.equal(ended,1);c.advance(2000);assert.equal(ended,1);a.destroy();
}));

test('Q13 a held long note keeps note index while beat index advances',()=>clockAudio(c=>{
  const frames=[];const a=new AudioEngine({onFrame:f=>frames.push(f)});a.playTaster(spec(2,'2'),{muted:true});
  c.advance(650);assert.equal(frames.at(-1).noteIndex,0);assert.equal(frames.at(-1).beatIndex,1);a.destroy();
}));

test('Q12 an already-queued stale frame cannot complete or animate a replacement run',()=>clockAudio(c=>{
  let oldEnd=0,newEnd=0;const frames=[];const a=new AudioEngine({onFrame:f=>frames.push(f)});
  a.playTaster(spec(),{muted:true,requestId:1,onEnd:()=>oldEnd++});const stale=[...c.raf.values()][0];
  a.playTaster(spec(3),{muted:true,requestId:2,onEnd:()=>newEnd++});const n=frames.length;stale();
  assert.equal(frames.length,n);assert.equal(oldEnd,0);assert.equal(newEnd,0);assert.equal(a.run.requestId,2);
  c.advance(1800);assert.equal(newEnd,1);assert.equal(oldEnd,0);a.destroy();
}));

test('Q12 closing sound check during delayed activation prevents its late test tone',async()=>clockAudio(async()=>{
  const a=new AudioEngine();let release,tones=0;a.unlock=()=>new Promise(resolve=>{release=resolve;});a._tone=()=>tones++;
  const pending=a.testTone();a.stop();release(true);
  assert.equal(await pending,false);assert.equal(tones,0);a.destroy();
}));

test('Q12 a replacement play or newer sound check invalidates pending test tone',async()=>clockAudio(async()=>{
  const a=new AudioEngine();const releases=[];let tones=0;a.unlock=()=>new Promise(resolve=>releases.push(resolve));a._tone=()=>tones++;
  const old=a.testTone();a.playTaster(spec(),{muted:true});releases.shift()(true);
  assert.equal(await old,false);assert.equal(tones,0);
  const first=a.testTone(),newer=a.testTone();a.ctx={currentTime:10,close(){}};
  releases.shift()(true);releases.shift()(true);
  assert.equal(await first,false);assert.equal(await newer,true);assert.equal(tones,1);a.destroy();
}));
