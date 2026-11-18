import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const names=['engine','orders','seeds','storage','game','render','audio','selftest','rulebook','main'];
const modules=[];
for(const name of names){
  let source=await readFile(new URL(`../src/${name}.js`,import.meta.url),'utf8');
  const exports=[...source.matchAll(/export\s+(?:async\s+)?(?:const|let|class|function)\s+(\w+)/g)].map(m=>m[1]);
  source=source.replace(/^export\s*\{([^}]+)\};?\s*$/gm,(_,list)=>{exports.push(...list.split(',').map(x=>x.trim()));return '';});
  source=source.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/(\w+)\.js['"];?\s*$/gm,(_,binding,dep)=>`const ${binding} = __modules.${dep};`)
    .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]\.\/(\w+)\.js['"];?\s*$/gm,(_,bindings,dep)=>`const {${bindings.replace(/\bas\b/g,':')}} = __modules.${dep};`)
    .replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|class|function)\b)/g,'');
  modules.push(`__modules.${name}=(()=>{\n${source}\nreturn {${exports.join(',')}};\n})();`);
}
const script=`(()=>{ 'use strict'; const __modules={};\n${modules.join('\n')}\n})();`;
const shell=await readFile(new URL('../src/shell.html',import.meta.url),'utf8');
const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
const html=shell.replace('/*__STYLE__*/',()=>css).replace('/*__SCRIPT__*/',()=>script.replace(/<\/script/gi,'<\\/script'));
new Function(script);
// Validate the actual bundled pure modules, including export/import wiring.
// This runs no DOM, browser, or audio devices.
const pureScript=script.slice(0,script.indexOf('__modules.main='))+'globalThis.bundleResults=__modules.selftest.selfTests();})();';
const context={console,performance,structuredClone};
vm.runInNewContext(pureScript,context,{timeout:10000});
if(context.bundleResults.fail)throw new Error('Bundled self-tests: '+JSON.stringify(context.bundleResults.results.filter(x=>!x.ok)));
await writeFile(new URL('../index.html',import.meta.url),html);
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/index.html',import.meta.url),html);
console.log(`Built standalone index.html: ${Buffer.byteLength(html)} bytes; bundled self-tests ${context.bundleResults.passed}/${context.bundleResults.total}; no runtime dependencies.`);
