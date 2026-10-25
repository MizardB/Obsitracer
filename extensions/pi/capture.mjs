// Autonomous Obsidian producer for captures-v1 IPC. Pi client lives in Mizagent.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const LIMIT = 128, LEASE_MS = 60000, STALE_MS = 15000;
export function atomic(file, value) {
 fs.mkdirSync(path.dirname(file), { recursive:true, mode:0o700 });
 const tmp = `${file}.${randomUUID()}.tmp`;
 try { fs.writeFileSync(tmp, JSON.stringify(value), { mode:0o600 }); fs.renameSync(tmp, file); }
 finally { try { fs.unlinkSync(tmp); } catch {} }
}
export function read(file) {
 try { if (fs.statSync(file).size > 2097152) return; return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
}
const validPath = p => typeof p === 'string' && p.length > 0 && Buffer.byteLength(p, 'utf8') <= 1024 && !p.startsWith('/') && !p.split('/').includes('..') && !/[\x00-\x1f\x7f]/.test(p);
const idOK = id => /^[a-f0-9-]{36}$/.test(id);
const remove = file => { try { fs.unlinkSync(file); } catch {} };
export class Producer {
 constructor(base, vault, { now = Date.now } = {}) {
  this.dir = path.join(base, 'captures-v1'); this.vault = vault; this.now = now;
  this.epoch = randomUUID(); this.started = now(); this.states = new Map();
 }
 leases() {
  let names; try { names = fs.readdirSync(this.dir); } catch { return []; }
  const active = [];
  for (const name of names) {
   if (name.endsWith('.state.json') && idOK(name.slice(0,-11)) && !fs.existsSync(path.join(this.dir,`${name.slice(0,-11)}.lease.json`))) remove(path.join(this.dir,name));
   if (!name.endsWith('.lease.json') || !idOK(name.slice(0,-11))) continue;
   const id = name.slice(0,-11), lease = read(path.join(this.dir,name));
   if (!lease || !Number.isFinite(lease.expires) || lease.expires <= this.now()) {
    remove(path.join(this.dir,name)); remove(path.join(this.dir,`${id}.state.json`)); this.states.delete(id); continue;
   }
   if (lease.version !== 1 || lease.vault !== this.vault || !Number.isFinite(lease.start) || lease.start > this.now()) continue;
   active.push([id,lease]);
  }
  // Deterministic admission: excess subscriptions receive no heartbeat (disconnected).
  return active.sort(([a],[b]) => a.localeCompare(b)).slice(0,32);
 }
 tick(event) {
  const live = new Set();
  for (const [id,lease] of this.leases()) {
   live.add(id);
   let s = this.states.get(id);
   if (!s) { s = { version:1, capture:id, epoch:this.epoch, producer_start:this.started, start:lease.start, revision:0, overflow:false, files:Object.create(null), focus:null }; this.states.set(id,s); }
   if (event && event.at >= lease.start) {
    if (event.op && (!validPath(event.path) || event.op === 'renamed' && !validPath(event.oldPath)) || event.file && !validPath(event.file)) s.loss = true;
    if (event.kind === 'focus') {
     s.focus = validPath(event.file) ? { file:event.file, line:Math.max(1,Math.trunc(event.line)||1), ch:Math.max(0,Math.trunc(event.ch)||0), at:event.at } : null;
    } else if (['created','modified','deleted','renamed'].includes(event.op) && validPath(event.path)) {
     s.revision++;
     const paths = event.op === 'renamed' && validPath(event.oldPath) ? [event.oldPath,event.path] : [event.path];
     for (const p of paths) {
      if (!Object.hasOwn(s.files,p) && Object.keys(s.files).length >= LIMIT) { s.overflow = true; continue; }
      const prev = s.files[p];
      s.files[p] = { path:p, op:event.op, revision:(prev?.revision||0)+1, first:prev?.first ?? event.at, last:event.at,
       ...(event.op === 'renamed' && validPath(event.oldPath) ? { from:event.oldPath, to:event.path } : prev?.from ? { from:prev.from, to:prev.to } : {}) };
     }
    }
   }
   s.updated = this.now();
   try { atomic(path.join(this.dir,`${id}.state.json`),s); } catch { s.loss = true; }
  }
  for (const id of this.states.keys()) if (!live.has(id)) { this.states.delete(id); remove(path.join(this.dir,`${id}.state.json`)); }
 }
 close() {
  for (const [id,s] of this.states) atomic(path.join(this.dir,`${id}.state.json`),{ ...s, disconnected:true, updated:this.now() });
  this.states.clear();
 }
}
