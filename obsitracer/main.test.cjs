// Exercise plugin wiring without loading Obsidian or writing active configuration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { buildSync } = require('esbuild');
const code = buildSync({ entryPoints:[path.join(__dirname,'main.ts')], bundle:true, write:false, platform:'node', format:'cjs', external:['obsidian','@codemirror/*','@lezer/*'] }).outputFiles[0].text;
function fixture(t, initial = true) {
 const base = fs.mkdtempSync(path.join(os.tmpdir(),'obs-plugin-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 class TFile { constructor(path) { this.path=path; } }
 class Plugin { registerInterval() {} registerEvent() {} registerDomEvent() {} registerEditorExtension() {} addCommand() {} }
 const obsidian = { Plugin, TFile, MarkdownView:class {}, Modal:class {} };
 const field = { define:()=>({}) };
 const module = {exports:{}};
 const intervals=[];
 vm.runInNewContext(code, { module, exports:module.exports, console, Buffer, setTimeout, clearTimeout,
  document:{body:{},hasFocus:()=>false}, window:{setInterval:fn=>{intervals.push(fn);return intervals.length;}},
  require:id=>id==='obsidian' ? obsidian : id==='@codemirror/state' ? {StateField:field,StateEffect:field} : id==='@codemirror/view' ? {WidgetType:class {}} : id==='os' ? {...os,homedir:()=>base} : require(id)
 });
 const plugin = new module.exports.default();
 const workspaceEvents={}, vaultEvents={};
 let active=initial ? new TFile('note.md') : null, ready;
 plugin.app={workspace:{getActiveFile:()=>active,getActiveViewOfType:()=>active ? {file:active,editor:{getCursor:()=>({line:8,ch:2})}} : null,
  onLayoutReady:fn=>{ready=fn;},on:(event,fn)=>{workspaceEvents[event]=fn;}},
  vault:{getName:()=> 'Fixture',on:(event,fn)=>{(vaultEvents[event]??=[]).push(fn);}}};
 // Exclude legacy mailboxes, content reads and UI from this metadata regression.
 plugin.registerVaultToList=()=>{}; plugin.cacheSnapshot=()=>{}; plugin.scheduleFocusUpdate=()=>{}; plugin.handleCrud=()=>{};
 const dir=path.join(base,'.config','obsitracer','captures-v1');
 function subscribe() {
  fs.mkdirSync(dir,{recursive:true}); const id=randomUUID(), start=Date.now();
  fs.writeFileSync(path.join(dir,`${id}.lease.json`),JSON.stringify({version:1,vault:'Fixture',start,expires:start+60000}));
  intervals[0]();
  return ()=>JSON.parse(fs.readFileSync(path.join(dir,`${id}.state.json`),'utf8'));
 }
 return {plugin,subscribe,workspaceEvents,vaultEvents,TFile,setActive:file=>{active=file;},ready:()=>ready()};
}
test('background startup seeds focus; file-open null and deletion do not resurrect it',async t=>{
 const f=fixture(t); await f.plugin.onload();
 const observed=f.plugin.captureProducer.focus.at;
 const state=f.subscribe();
 assert.equal(state().focus.file,'note.md'); assert.equal(state().focus.line,9);
 assert.equal(state().focus.at,observed); assert.deepEqual(state().files,{});
 f.setActive(null); f.workspaceEvents['file-open'](null);
 assert.equal(f.subscribe()().focus,null);
 const file=new f.TFile('deleted.md'); f.setActive(file); f.workspaceEvents['file-open'](file);
 for(const fn of f.vaultEvents.delete) fn(file);
 assert.equal(f.plugin.activeFocus,null); assert.equal(f.subscribe()().focus,null);
});
test('layout readiness seeds a restored leaf without any UI event',async t=>{
 const f=fixture(t,false); await f.plugin.onload();
 assert.equal(f.subscribe()().focus,null);
 f.setActive(new f.TFile('restored.md')); f.ready();
 assert.equal(f.subscribe()().focus.file,'restored.md');
});
