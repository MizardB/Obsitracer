// Autonomous producer tests: wire leases, no Pi client or Mizagent imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Producer, atomic, read, LIMIT, LEASE_MS } from './capture.mjs';
function fixture(t) {
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'obs-producer-')); t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 let clock=10000; const now=()=>clock, p=new Producer(base,'Fixture',{now});
 const dir=path.join(base,'captures-v1');
 const lease=(version=1)=>{const id=randomUUID(); atomic(path.join(dir,`${id}.lease.json`),{version,vault:'Fixture',start:now(),expires:now()+LEASE_MS}); return id;};
 const state=id=>read(path.join(dir,`${id}.state.json`));
 return {p,dir,lease,state,now,advance:n=>clock+=n};
}
test('producer fanout/cutoff, bounded metadata, revisions, lease expiry and orphan cleanup',t=>{
 const {p,dir,lease,state,now,advance}=fixture(t);
 p.tick({op:'created',path:'BEFORE.md',at:now()});
 const a=lease(), b=lease(), unsupported=lease(2);
 p.tick({op:'modified',path:'OLDER.md',at:now()-1});
 p.tick({op:'created',path:'note.md',at:now(),content:'NEVER'});
 p.tick({op:'renamed',oldPath:'note.md',path:'new.md',at:now()});
 for(const id of [a,b]) { assert.equal(state(id).files['note.md'].revision,2); assert.equal(state(id).files['new.md'].from,'note.md'); assert.ok(!JSON.stringify(state(id)).includes('NEVER')); assert.ok(!JSON.stringify(state(id)).includes('OLDER')); }
 assert.equal(state(unsupported),undefined);
 for(let i=0;i<LIMIT+1;i++) p.tick({op:'modified',path:`${i}.md`,at:now()});
 assert.equal(Object.keys(state(a).files).length,LIMIT); assert.equal(state(a).overflow,true);
 fs.unlinkSync(path.join(dir,`${a}.lease.json`)); p.tick(); assert.equal(state(a),undefined);
 advance(LEASE_MS+1); p.tick(); assert.equal(state(b),undefined); assert.equal(fs.existsSync(path.join(dir,`${b}.lease.json`)),false);
});
test('late subscriptions receive current focus, not historical CRUD or a new timestamp',t=>{
 const {p,lease,state,now,advance}=fixture(t);
 const observed=now();
 p.tick({kind:'focus',file:'note.md',line:7,ch:3,at:observed});
 p.tick({op:'modified',path:'note.md',at:observed});
 advance(1000);
 const a=lease(); p.tick();
 assert.deepEqual(state(a).focus,{file:'note.md',line:7,ch:3,at:observed});
 assert.deepEqual(state(a).files,{}); assert.equal(state(a).revision,0);
 advance(1000); const b=lease(); p.tick();
 assert.deepEqual(state(b).focus,state(a).focus);
 assert.equal(state(b).updated,now());
 p.tick({op:'modified',path:'fresh.md',at:now()});
 assert.equal(state(a).files['fresh.md'].revision,1);
 assert.equal(state(b).files['fresh.md'].revision,1);
});
test('null, invalid, deleted and renamed focus remain current across lease boundaries',t=>{
 const {p,lease,state,now,advance}=fixture(t);
 const a=lease(); p.tick(); assert.equal(state(a).focus,null);
 for (const clear of [{kind:'focus',file:null}, {kind:'focus',file:'../bad.md'}, {op:'deleted',path:'note.md'}]) {
  p.tick({kind:'focus',file:'note.md',at:now()});
  p.tick({...clear,at:now()});
  advance(1); const b=lease(); p.tick();
  assert.equal(state(a).focus,null); assert.equal(state(b).focus,null);
  assert.deepEqual(state(b).files,{});
 }
 p.tick({kind:'focus',file:'note.md',line:4,ch:2,at:now()});
 advance(1); const renamedAt=now();
 p.tick({op:'renamed',oldPath:'note.md',path:'new.md',at:renamedAt});
 advance(1); const c=lease(); p.tick();
 assert.deepEqual(state(c).focus,{file:'new.md',line:4,ch:2,at:renamedAt});
 assert.deepEqual(state(c).files,{});
});
test('focus snapshots stay isolated by producer vault and unsupported leases',t=>{
 const {p,dir,lease,state,now}=fixture(t);
 p.tick({kind:'focus',file:'private.md',at:now()});
 const foreign=randomUUID();
 atomic(path.join(dir,`${foreign}.lease.json`),{version:1,vault:'Other',start:now(),expires:now()+LEASE_MS});
 const unsupported=lease(2), own=lease(); p.tick();
 assert.equal(state(foreign),undefined); assert.equal(state(unsupported),undefined);
 assert.equal(state(own).focus.file,'private.md');
});
test('producer admission, write failure isolation, loss and close',t=>{
 const {p,dir,lease,state,now}=fixture(t);
 const ids=Array.from({length:33},()=>lease()).sort();
 const failed=path.join(dir,`${ids[0]}.state.json`); fs.mkdirSync(failed);
 p.tick({op:'modified',path:'note.md',at:now()});
 assert.equal(state(ids[1]).files['note.md'].revision,1); assert.equal(state(ids[32]),undefined);
 fs.rmdirSync(failed); p.tick(); assert.equal(state(ids[0]).loss,true);
 p.tick({op:'created',path:'x'.repeat(1025),at:now()}); assert.equal(state(ids[1]).loss,true);
 p.close(); assert.equal(state(ids[1]).disconnected,true);
});
