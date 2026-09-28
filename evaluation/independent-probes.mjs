// Independent acceptance probes authored by Codex, not application implementation.
// Run from the repository root: node --import tsx evaluation/independent-probes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {openDb} from '../platform/kernel/db.ts';
import {seed} from '../platform/kernel/seed.ts';
import {createApp} from '../platform/server/app.ts';
import {loadApp,promoteDefinition} from '../platform/manifest/store.ts';
import {digestOf} from '../platform/manifest/schema.ts';
const previousDir=process.env.CONTROL_ROOM_APPS_DIR;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'control-room-independent-'));
process.env.CONTROL_ROOM_APPS_DIR=dir;
const db=openDb(':memory:');
const originalWrite=fs.writeFileSync;
const checks=[];
function passed(name){checks.push(name);console.log(`PASS: ${name}`);}
try {
 seed(db);const app=createApp(db);
 const base=JSON.parse(fs.readFileSync('apps/refund-review.app.json','utf8'));
 async function login(userId){const r=await request(app).post('/api/session').send({userId});assert.equal(r.status,200);return r.headers['set-cookie'][0];}
 const admin=await login('u_adm_rhea'),maker=await login('u_mkr_juno'),viewer=await login('u_view_sam'),approver=await login('u_apr_theo');
 const promote=(def,cookie=admin)=>request(app).post('/api/catalog/promote').set('Cookie',cookie).send({definition:def});
 assert.equal((await request(app).get('/api/catalog')).status,401);passed('catalog requires a demo session');
 const def={...base,appId:'independent-read-only',capabilities:['queue.read','record.read']};
 assert.equal((await promote(def,maker)).status,403);passed('maker cannot activate a valid definition');
 assert.equal((await promote(def)).status,201);
 const detail=await request(app).get('/api/apps/independent-read-only/records/rr_2001').set('Cookie',viewer);
 assert.equal(detail.status,200);assert.equal(detail.body.record.events?.length ?? 0,0);passed('detail without audit.read contains no event records');
 assert.equal((await request(app).get('/api/activity').set('Cookie',viewer)).status,403);passed('global activity requires platform oversight role');
 assert.equal((await request(app).get('/api/payments').set('Cookie',viewer)).status,404);passed('legacy global payment route removed');
 const decision={decision:'approve',reason:'Synthetic review accepted',expectedVersion:1,idempotencyKey:'independent-read-denial'};
 assert.equal((await request(app).post('/api/apps/independent-read-only/records/rr_2001/decision').set('Cookie',approver).send(decision)).status,403);passed('direct decision cannot bypass read-only app capability');
 assert.equal((await request(app).post('/api/apps/refund-review/records/rr_2001/decision').set('Cookie',admin).send(decision)).status,403);passed('platform admin is not a business approver');
 for(const workflow of ['toString','constructor','__proto__']){
   const v=await request(app).post('/api/workshop/validate').set('Cookie',maker).send({definition:{...base,workflow}});
   assert.equal(v.status,200);assert.equal(v.body.ok,false);assert.ok(v.body.violations.some(x=>x.code==='unknown_workflow'));
   assert.equal((await promote({...base,workflow})).status,422);
 }
 passed('inherited object keys are refused as workflows, not server errors');
 for(const patch of [{connectorId:'https://unapproved.invalid'},{requireAudit:false},{capabilities:['platform.admin']}]){
   assert.equal((await promote({...base,...patch})).status,422);
 }
 passed('direct promotion refuses unsafe definitions without workshop preflight');
 // Simulate a partial file write during a new release. The previous active
 // file must survive, regardless of whether the new incomplete file remains.
 const before=loadApp(db,'refund-review');
 fs.writeFileSync=function(file,data,...rest){
   if(String(file).startsWith(dir)){originalWrite.call(fs,file,'{partial');throw new Error('injected partial-write failure');}
   return originalWrite.call(fs,file,data,...rest);
 };
 assert.throws(()=>promoteDefinition(db,{id:'u_adm_rhea',role:'platform_admin',displayName:'Demo admin'},{...base,title:'Interrupted update'}));
 fs.writeFileSync=originalWrite;
 const after=loadApp(db,'refund-review');assert.equal(after.status,'active');assert.equal(after.version,before.version);assert.equal(after.digest,before.digest);
 passed('partial file-write failure preserves the prior active release');
 // Force a deferred foreign-key failure at COMMIT, after the new file write.
 // The identity is intentionally not present in this disposable test DB.
 db.pragma('defer_foreign_keys = ON');
 assert.throws(()=>promoteDefinition(db,{id:'missing-test-user',role:'platform_admin',displayName:'Invalid fixture'},{...base,title:'Commit failure update'}));
 const afterCommit=loadApp(db,'refund-review');assert.equal(afterCommit.status,'active');assert.equal(afterCommit.version,before.version);assert.equal(afterCommit.digest,before.digest);
 passed('failed database commit preserves prior active release and catalog');
 // Recompute the digest of invalid persisted input: digest equality alone
 // must not make an unsupported workflow executable.
 const active=loadApp(db,'independent-read-only');const bad={...def,workflow:'constructor'};
 fs.writeFileSync(active.sourcePath,JSON.stringify(bad));
 db.prepare('UPDATE app_definitions SET digest=?, definition_json=? WHERE app_id=? AND active=1').run(digestOf(bad),JSON.stringify(bad),def.appId);
 const loaded=loadApp(db,def.appId);assert.equal(loaded.status,'quarantined');assert.ok(loaded.findings.some(x=>x.code==='unknown_workflow'));
 assert.equal((await request(app).get(`/api/apps/${def.appId}/records`).set('Cookie',viewer)).status,409);
 passed('schema validation quarantines invalid persisted input even with a matching digest');
 console.log(`${checks.length} independent checks passed. Synthetic local tests only.`);
} finally {
 fs.writeFileSync=originalWrite;db.close();fs.rmSync(dir,{recursive:true,force:true});
 if(previousDir===undefined)delete process.env.CONTROL_ROOM_APPS_DIR;else process.env.CONTROL_ROOM_APPS_DIR=previousDir;
}
