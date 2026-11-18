import { cmp, dur, lengthIn, keyOf, sameNote, eq } from './engine.js';
import { makeItem, makeOrder, METERS, PIECES, pickAnswer, pickRightText, pickWrongText, PICK_FIRST_TEXT, FULL_TEXT, FIXED_TEXT, BAKE_TEXT, BAKE_SLOT_TEXT, EXTRA_TEXT, FOUND_TEXT, ABORT_TEXT, judge, judgeText, solutions, menuSlot, meterKey, unfound, serveText, recordText, passNeed } from './orders.js';
import { DAYS } from './seeds.js';
import { freshSave } from './storage.js';

// The model is independent of DOM, wall clocks and audio scheduling.
export class Game {
  constructor(save = freshSave(), onChange = () => {}, persist = () => {}) {
    this.save = save; this.onChange = onChange; this.persist = persist;
    this.state = { screen:'title', day:'d0', queue:[], idx:0, phase:'build', sel:null, tries:0, assisted:false, fill:[], served:[], ghost:null, msg:null, playing:'', extra:false, st:0, results:[], last:null, fresh:0, freshShelf:0, menu:save.menu, shelf:save.shelf };
    this.dayItems = []; this.pendingJudge = null;
  }
  setState(patch) { this.state = {...this.state, ...patch}; this.onChange(this.state); }
  loadDay(id) { const day = DAYS.find(d=>d.id===id); if (!day) return false; this.dayItems=day.items.map(makeItem); return day; }
  entry() { return this.state.queue[this.state.idx]; }
  item() {
    if(this.state.screen==='free') return this.freeOrder;
    const e=this.entry(); if(!e) return null; const it=this.dayItems[e.i];
    return e.redo && it.fresh ? {...it,fresh:false} : it;
  }
  enter(idx, more={}) {
    const q=more.queue||this.state.queue, it=this.dayItems[q[idx].i];
    this.pendingJudge=null;
    this.setState({idx, phase:it.kind==='scene'?'scene':it.pick?'pick':'build',sel:null,tries:0,assisted:false,fill:[],served:[],ghost:null,msg:null,playing:'',extra:false,st:0,...more});
  }
  startDay(id) {
    const day=this.loadDay(id); if(!day) return;
    this.enter(0,{screen:'shift',day:id,queue:this.dayItems.map((_,i)=>({i,redo:false})),results:[],last:null,fresh:0,freshShelf:0}); this.checkpoint();
  }
  resume() {
    const a=this.save.active; if(!a||!this.loadDay(a.day)) return false;
    this.enter(a.idx,{...a,screen:'shift'}); return true;
  }
  checkpoint() {
    const s=this.state;
    this.save.menu=s.menu;this.save.shelf=s.shelf;
    if(s.screen==='shift') this.save.active={day:s.day,queue:s.queue,idx:s.idx,results:s.results,last:s.last,fresh:s.fresh,freshShelf:s.freshShelf};
    this.persist(this.save);
  }
  choose(k) { const o=this.item(); if(this.state.phase!=='pick'||!o) return; const n=o.pick==='dough'?3:METERS.length;if(k>=0&&k<n)this.setState({sel:k,msg:null}); }
  confirmPick() {
    const s=this.state,o=this.item();if(s.phase!=='pick')return null;
    if(s.sel===null) {this.setState({msg:{tone:'warn',text:PICK_FIRST_TEXT}});return null;}
    if(s.sel!==pickAnswer(o)) {
      const tries=s.tries+1;this.setState({tries,assisted:true,sel:tries>=2?pickAnswer(o):s.sel,msg:{tone:'warn',text:pickWrongText(o,s.sel,tries)}});return null;
    }
    if(o.ask==='sound') {this.setState({phase:'bake',tries:0,fill:o.target,playing:'bake',msg:{tone:'good',text:pickRightText(o)}});this.pendingJudge={ok:true};return {play:true};}
    this.setState({phase:'build',tries:0,playing:'',msg:{tone:'good',text:pickRightText(o)}});return null;
  }
  place(note) {
    const s=this.state,o=this.item();if(s.phase!=='build'||s.playing||!o||!o.tray.some(n=>sameNote(n,note)))return;
    const len=lengthIn(o.len,s.fill);
    if(len.state==='exact')return this.setState({ghost:null,msg:{tone:'',text:FULL_TEXT}});
    if(cmp(dur(note),len.diff)>0)return this.setState({ghost:note,msg:null});
    this.setState({fill:s.fill.concat([note]),ghost:null,msg:null});
  }
  removeAt(i) {const s=this.state;if(s.phase==='build'&&!s.playing)this.setState({fill:s.fill.filter((_,k)=>k!==i),ghost:null,msg:null});}
  clear() {if(this.state.phase==='build'&&!this.state.playing)this.setState({fill:[],ghost:null,msg:null});}
  bakePress() {
    const s=this.state,o=this.item();if(s.phase!=='build'||s.playing)return null;
    const j=judge(o,s.fill,s.last);
    if(j.why==='length'){this.setState({ghost:null,msg:{tone:'warn',text:judgeText(o,j)}});return null;}
    if(s.extra&&j.ok&&this.found(o).includes(keyOf(s.fill))){this.setState({msg:{tone:'warn',text:FOUND_TEXT}});return null;}
    if(!j.ok&&j.why!=='group'){this.wrong(j);return null;}
    this.pendingJudge=j;this.setState({phase:'bake',ghost:null,playing:'bake',msg:{tone:'',text:o.slot?BAKE_SLOT_TEXT:BAKE_TEXT}});return {play:true};
  }
  wrong(j) {
    const s=this.state,o=this.item();if(s.extra)return this.setState({msg:{tone:'warn',text:judgeText(o,j)}});
    const tries=s.tries+1, patch={tries,assisted:true,msg:{tone:'warn',text:judgeText(o,j)}};
    if(tries>=2) { const answer=solutions(o,s.last)[0];if(!answer)throw new Error('Order has no solution: '+o.id);patch.fill=answer;patch.ghost=null;patch.msg={tone:'warn',text:FIXED_TEXT}; }
    this.setState(patch);
  }
  completeBake() {
    if(this.state.phase!=='bake')return;
    if(this.pendingJudge&&!this.pendingJudge.ok){const j=this.pendingJudge;this.setState({phase:'build',playing:''});this.wrong(j);}
    else this.serve(); this.pendingJudge=null;
  }
  serve() {
    const s=this.state,o=this.item(),key=keyOf(s.fill),slot=menuSlot(o,s.fill);let menu=s.menu,shelf=s.shelf,isNew=false;
    if(slot){const mk=meterKey(o.m),book=slot==='menu'?menu:shelf,have=book[mk]||[];if(!have.includes(key)){isNew=slot;const next={...book,[mk]:have.concat([key])};if(slot==='menu')menu=next;else shelf=next;}}
    this.save.stats.bakes++;
    this.setState({phase:s.screen==='free'?'build':'serve',playing:'',extra:false,served:s.fill,last:key,menu,shelf,fresh:s.fresh+(isNew==='menu'?1:0),freshShelf:s.freshShelf+(isNew==='shelf'?1:0),msg:{tone:'good',text:serveText(o,s.fill,isNew)}});this.checkpoint();
  }
  stopBake(interrupted=false) {
    const s=this.state,o=this.item();if(s.phase!=='bake'){this.setState({playing:''});return;}
    this.pendingJudge=null;
    this.setState({phase:o.ask==='sound'?(interrupted?'pick':'serve'):'build',playing:'',msg:interrupted?{tone:'warn',text:ABORT_TEXT}:null});
    if(!interrupted&&o.ask==='sound')this.serve();
  }
  nextItem() {
    const s=this.state,it=this.item(),e=this.entry();if(!it||!['serve','scene'].includes(s.phase))return;
    let results=s.results,queue=s.queue,mark=s.assisted?'half':'full';
    if(it.kind==='scene') {if(!this.save.scenes.includes(it.id))this.save.scenes.push(it.id);}
    else if(!e.redo){results=results.concat([{id:it.id,text:recordText(it),recipe:mark}]);this.save.stats.orders++;if(mark==='full')this.save.stats.clean++;
      if(s.assisted&&!it.final){queue=queue.slice();const at=this.dayItems[queue[queue.length-1].i].final?queue.length-1:queue.length;queue.splice(at,0,{i:e.i,redo:true});}}
    else results=results.map(r=>r.id===it.id?{...r,again:mark}:r);
    if(s.idx+1>=queue.length){this.close(results,queue);}else{this.enter(s.idx+1,{results,queue});this.checkpoint();}
  }
  close(results,queue) {
    const clean=results.filter(r=>r.recipe==='full').length,passed=clean>=passNeed(results.length),id=this.state.day,prev=this.save.days[id]||{passed:false,best:0,runs:0};
    this.save.days[id]={passed:prev.passed||passed,best:Math.max(prev.best,clean),runs:prev.runs+1};this.save.active=null;
    this.setState({screen:'close',results,queue,playing:'',msg:null});this.persist(this.save);
  }
  found(o) {return (this.state.menu[meterKey(o.m)]||[]).concat(this.state.shelf[meterKey(o.m)]||[]);}
  canOther() {const o=this.item();return !!o?.m&&unfound(o,this.found(o)).length>0;}
  otherFill() {if(this.state.phase!=='serve'||!this.canOther())return;this.setState({phase:'build',extra:true,fill:[],ghost:null,playing:'',msg:{tone:'',text:EXTRA_TEXT}});}
  quitExtra() {if(!this.state.extra)return;const s=this.state;this.setState({phase:'serve',extra:false,fill:s.served,ghost:null,playing:'',msg:{tone:'good',text:serveText(this.item(),s.served)}});}
  startFree(index=0) {this.freeOrder={...makeOrder({id:'free',ask:'cond',meter:[METERS[index].num,METERS[index].den]}),tray:PIECES};this.setState({screen:'free',phase:'build',playing:'',fill:[],ghost:null,msg:null,extra:false});}
  changeMeter(index) {if(this.state.screen!=='free'||!METERS[index])return;const old=this.freeOrder, m=METERS[index];this.freeOrder={...makeOrder({id:'free',ask:'cond',meter:[m.num,m.den]}),tray:PIECES};this.setState({phase:'build',playing:'',fill:eq(old.len,this.freeOrder.len)?this.state.fill:[],ghost:null,msg:null});}
}
