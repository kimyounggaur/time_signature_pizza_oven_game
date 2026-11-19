import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {freshSave} from '../src/storage.js';

// This is a tiny structural DOM double for app wiring, not a layout engine,
// browser emulation, accessibility tree, or claim about real DOM behavior.
function appFixture(initialSave) {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const markup=html.slice(0,html.lastIndexOf('<script>'));
  const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
  const ids=new Map(), raf=new Map(), errors=[], storage=new Map();
  let now=0, nextRaf=1, document;
  if(initialSave)storage.set('pzo_save_v1',JSON.stringify(initialSave));
  const attrKey=name=>name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
  const matches=(element,selector)=>selector.split(',').some(s=>{
    s=s.trim();if(s.startsWith('.'))return element.classList.contains(s.slice(1));
    if(s.startsWith('#'))return element.id===s.slice(1);
    if(s==='dialog[open]')return element.tagName==='DIALOG'&&element.open;
    if(/^\[data-[\w-]+\]$/.test(s))return element.hasAttribute(s.slice(1,-1));
    return element.tagName===s.toUpperCase();
  });
  class Element {
    constructor(tag,attributes={}) {
      this.tagName=tag.toUpperCase();this.attributes={};this.dataset={};this.children=[];this.parentElement=null;
      this._text='';this._html='';this.hidden=false;this.disabled=false;this.open=false;this.style={};this.clientWidth=296;this.listeners={};
      const classes=new Set();this.classList={add:(...list)=>list.forEach(x=>classes.add(x)),remove:(...list)=>list.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,value)=>{const enabled=value??!classes.has(x);if(enabled)classes.add(x);else classes.delete(x);return enabled;}};
      for(const [name,value]of Object.entries(attributes))this.setAttribute(name,value);
    }
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='id'){this.id=String(value);ids.set(this.id,this);}if(name==='class'){this.className=String(value);String(value).split(/\s+/).filter(Boolean).forEach(c=>this.classList.add(c));}if(name.startsWith('data-'))this.dataset[attrKey(name.slice(5))]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;}
    getAttribute(name){return this.attributes[name]??null;}
    hasAttribute(name){return Object.hasOwn(this.attributes,name);}
    get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    set textContent(value){this._text=String(value);this.children=[];}
    get innerHTML(){return this._html;}
    set innerHTML(value){this._html=String(value);this._text='';this.children=[];parse(this._html,this);}
    querySelectorAll(selector){const found=[];const walk=node=>{for(const child of node.children){if(matches(child,selector))found.push(child);walk(child);}};walk(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){for(let element=this;element;element=element.parentElement)if(matches(element,selector))return element;return null;}
    hasChildNodes(){return this.children.length>0||this._text.length>0;}
    focus(){document.activeElement=this;}
    addEventListener(name,callback){(this.listeners[name]||=[]).push(callback);}
    showModal(){this.open=true;}
    close(){this.open=false;for(const callback of this.listeners.close||[])callback();}
    scrollIntoView(){}
    click(){if(this.disabled)return;const event={target:this,preventDefault(){}};for(let element=this;element;element=element.parentElement)element.onclick?.(event);}
  }
  const voids=new Set(['META','LINK','INPUT','BR','HR','IMG','AREA','BASE','SOURCE','WBR']);
  function parse(value,parent){const stack=[parent];for(const match of value.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g)){const token=match[0];if(token.startsWith('<!--'))continue;if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(!token.startsWith('<')){stack.at(-1)._text+=token;continue;}const tag=token.match(/^<([\w-]+)/)[1],attributes={};for(const a of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g))attributes[a[1]]=a[2]??a[3]??a[4]??'';const element=new Element(tag,attributes),p=stack.at(-1);element.parentElement=p;p.children.push(element);if(!voids.has(element.tagName)&&!token.endsWith('/>'))stack.push(element);}}
  const root=new Element('root');parse(markup,root);
  document={documentElement:root.querySelector('html'),body:root.querySelector('body'),activeElement:null,hidden:false,fullscreenElement:null,listeners:{},getElementById:id=>ids.get(id)||null,querySelector:selector=>root.querySelector(selector),querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener(name,callback){(this.listeners[name]||=[]).push(callback);},removeEventListener(name,callback){this.listeners[name]=(this.listeners[name]||[]).filter(x=>x!==callback);}};
  document.activeElement=document.body;
  const context={document,location:{hash:'',pathname:'/'},history:{replaceState(){}},performance:{now:()=>now},structuredClone,console:{log(){},warn(){},error(...args){errors.push(args);}},requestAnimationFrame:callback=>{const id=nextRaf++;raf.set(id,callback);return id;},cancelAnimationFrame:id=>raf.delete(id),localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},matchMedia:()=>({matches:false})};
  context.window=context;
  vm.runInNewContext(script,context,{timeout:10000});
  return {context,document,errors,storage,raf,get:id=>ids.get(id),advance(ms){now+=ms;const callbacks=[...raf.values()];raf.clear();callbacks.forEach(callback=>callback(now));},click(id){const node=ids.get(id);assert.ok(node,id);node.click();},action(name){const node=ids.get('taster').querySelector(`[data-taster-action]`);const buttons=ids.get('taster').querySelectorAll('button');const target=buttons.find(x=>x.dataset.tasterAction===name);assert.ok(node&&target,name);target.click();}};
}

test('Q01/Q02/Q03/Q04 app bundle wires a silent taster to one additional beat then regular first order',()=>{
  const app=appFixture();
  assert.equal(app.context.__tests.fail,0,JSON.stringify(app.context.__tests.results.filter(x=>!x.ok)));
  assert.equal(app.get('taster').hidden,false);
  assert.equal(app.get('app').hidden,true);
  assert.equal(app.get('tasterTitle').textContent,'두 박 피자를 만들어요');
  assert.equal(app.get('tipDialog').open,false);
  assert.equal(app.storage.has('pzo_save_v1'),false);
  assert.equal(app.get('tasterBake').disabled,true);
  app.click('tasterAdd');assert.match(app.get('tasterStatus').textContent,/1박 남았어요/);
  app.click('tasterUndo');assert.match(app.get('tasterSummary').textContent,/0자리 채움/);
  app.click('tasterAdd');app.click('tasterAdd');app.click('tasterAdd');
  assert.match(app.get('tasterSummary').textContent,/2자리 중 2자리 채움/);
  assert.equal(app.get('tasterAdd').disabled,true);assert.equal(app.get('tasterBake').disabled,false);
  app.click('tasterBake');assert.equal(app.get('tasterPlayback').hidden,false);assert.ok(app.raf.size>0);
  app.advance(1201);
  assert.equal(app.get('tasterTitle').textContent,'세 박 피자로 바꿔요');
  assert.match(app.get('tasterSummary').textContent,/3자리 중 2자리 채움/);
  assert.equal(app.storage.has('pzo_save_v1'),false);
  app.click('tasterAdd');assert.equal(app.get('tasterComparison').hidden,false);
  const completed=JSON.parse(app.storage.get('pzo_save_v1'));
  assert.equal(completed.settings.tasterSeenV1,true);assert.equal(completed.active,null);
  assert.deepEqual(completed.stats,{orders:0,clean:0,bakes:0});assert.deepEqual(completed.menu,{});assert.deepEqual(completed.shelf,{});assert.deepEqual(completed.scenes,[]);
  app.click('tasterNext');
  assert.equal(app.get('taster').hidden,true);assert.equal(app.get('app').hidden,false);assert.equal(app.get('tipDialog').open,false);
  assert.match(app.get('order').textContent,/2분음표.*길이/);
  assert.match(app.get('readout').textContent,/①.*4분음표/);
  const regular=JSON.parse(app.storage.get('pzo_save_v1'));
  assert.equal(regular.active.day,'d0');assert.equal(regular.active.idx,0);assert.equal(regular.settings.soundChecked,false);
  assert.deepEqual(app.errors,[]);
});


test('Q07/Q09 app replay and resume preserve an existing nonzero checkpoint and collections',()=>{
  const initial=freshSave();
  initial.active={day:'d1',queue:[{i:0,redo:false},{i:1,redo:false}],idx:1,results:[],last:'4 4',fresh:0,freshShelf:0};
  initial.days.d0={passed:true,runs:1,best:7};initial.stats={orders:8,clean:7,bakes:9};
  initial.menu={'2/4':['4 4']};initial.shelf={'2/4':['8 4 8']};initial.scenes=['S1'];
  const protectedData=save=>({active:save.active,days:save.days,stats:save.stats,menu:save.menu,shelf:save.shelf,scenes:save.scenes});
  const app=appFixture(initial),before=structuredClone(protectedData(initial));
  assert.equal(app.get('taster').hidden,true);
  assert.match(app.get('screen').innerHTML,/이어서 영업/);
  app.document.querySelector('[data-taster-start]').click();
  app.click('tasterAdd');app.click('tasterAdd');app.click('tasterBake');app.action('compare');app.click('tasterAdd');
  const completed=JSON.parse(app.storage.get('pzo_save_v1'));
  assert.deepEqual(protectedData(completed),before);
  assert.equal(completed.settings.tasterSeenV1,true);assert.equal(completed.settings.soundChecked,false);
  assert.equal(app.get('tasterNext').textContent,'이어서 영업');
  app.click('tasterNext');
  assert.equal(app.get('app').hidden,false);
  assert.match(app.get('dayname').textContent,/1단/);
  assert.deepEqual(protectedData(JSON.parse(app.storage.get('pzo_save_v1'))),before);
  assert.deepEqual(app.errors,[]);
});

test('Q12/Q16 rulebook interrupts taster without losing pieces or accepting a late completion',()=>{
  const app=appFixture();app.click('tasterAdd');app.click('tasterAdd');app.click('tasterBake');
  const stale=[...app.raf.values()][0];assert.ok(stale);
  app.action('rulebook');
  assert.equal(app.get('rulebookDialog').open,true);
  assert.equal(app.raf.size,0);assert.equal(app.get('tasterPlayback').hidden,true);
  assert.match(app.get('tasterSummary').textContent,/2자리 중 2자리 채움/);
  stale();app.advance(5000);
  assert.equal(app.get('tasterTitle').textContent,'두 박 피자를 만들어요');
  assert.equal(app.storage.has('pzo_save_v1'),false);
  app.click('closeRulebook');assert.equal(app.get('rulebookDialog').open,false);
  assert.equal(app.get('tasterBake').disabled,false);
  assert.deepEqual(app.errors,[]);
});
