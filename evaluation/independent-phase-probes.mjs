// Codex-authored acceptance probes. Disposable synthetic DB only.
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDb} from '../platform/kernel/db.ts';
import {seed} from '../platform/kernel/seed.ts';
import {createApp} from '../platform/server/app.ts';
import {scopeAllows} from '../platform/kernel/decision-service.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paved-road-independent-'));
process.env.CONTROL_ROOM_APPS_DIR=dir;
const db=openDb(':memory:');seed(db);const app=createApp(db);
const results=[];
async function probe(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,detail:e.message});}}
async function login(userId){const r=await request(app).post('/api/session').send({userId});assert.equal(r.status,200);return r.headers['set-cookie'][0];}
try{
 const admin=await login('u_adm_rhea'),us=await login('u_req_nadia'),approver=await login('u_apr_theo');
 await probe('empty actor and record scopes never authorize',()=>assert.equal(scopeAllows({scope:''},''),false));
 await probe('missing actor and record scopes never authorize',()=>assert.equal(scopeAllows({},undefined),false));
 await probe('blank scope cannot create a vendor change',async()=>{
  db.prepare("UPDATE users SET scope='' WHERE id='u_req_nadia'").run();
  const r=await request(app).post('/api/apps/vendor-bank-change-review/records').set('Cookie',us).send({vendorName:'Synthetic blank scope',currentMaskedRef:'••••-••••-1111',newMaskedRef:'••••-••••-2222',country:'US',verificationChannel:'callback_to_known_number',reason:'Synthetic test of missing scope'});
  assert.ok([403,404].includes(r.status),`expected 403/404, got ${r.status}`);
 });
 db.prepare("UPDATE users SET scope='us-ops' WHERE id='u_req_nadia'").run();
 for(const [table,id,url,key] of [
  ['refund_requests','rr_2002','/api/apps/refund-review/records','records'],
  ['vendor_bank_changes','vbc_3001','/api/apps/vendor-bank-change-review/records','records'],
  ['payments','pay_1002','/api/apps/refund-review/payments','payments']
 ]){
  await probe(`blank scopes fail closed on ${table} list`,async()=>{
   db.prepare("UPDATE users SET scope='' WHERE id='u_req_nadia'").run();
   db.prepare(`UPDATE ${table} SET scope='' WHERE id=?`).run(id);
   try{
    const r=await request(app).get(url).set('Cookie',us);
    if([403,404].includes(r.status))return;
    assert.equal(r.status,200);assert.deepEqual(r.body[key],[],`empty-scope user received malformed ${table} records`);
   }finally{
    db.prepare("UPDATE users SET scope='us-ops' WHERE id='u_req_nadia'").run();
    db.prepare(`UPDATE ${table} SET scope='us-ops' WHERE id=?`).run(id);
   }
  });
 }
 await probe('oversight-created refund cannot disclose a foreign payment to US users',async()=>{
  const created=await request(app).post('/api/apps/refund-review/records').set('Cookie',admin).send({paymentId:'pay_7001',amountCents:100,reason:'Synthetic oversight creation test'});
  if([403,404].includes(created.status))return;
  assert.equal(created.status,201);
  const r=await request(app).get(`/api/apps/refund-review/records/${created.body.record.id}`).set('Cookie',us);
  assert.equal(r.status,404,`US user received ${r.status}: ${JSON.stringify(r.body.record)}`);
 });
 await probe('foreign payment validation reveals no balance for a huge amount',async()=>{
  const r=await request(app).post('/api/apps/refund-review/records').set('Cookie',us).send({paymentId:'pay_7001',amountCents:999999999,reason:'Synthetic balance leakage test'});
  assert.equal(r.status,404);assert.ok(!JSON.stringify(r.body).includes('remaining'));
 });
 await probe('vendor verification reason cannot meet length floor using whitespace padding',async()=>{
  const r=await request(app).post('/api/apps/vendor-bank-change-review/records/vbc_3001/decision').set('Cookie',approver).send({decision:'approve',reason:'OK                         verified',expectedVersion:1,idempotencyKey:'independent-whitespace'});
  assert.equal(r.status,400,`expected normalized reason rejection, got ${r.status}`);
 });
 await probe('changed role invalidates an idempotent replay',async()=>{
  const payload={decision:'approve',reason:'Synthetic authorized decision',expectedVersion:1,idempotencyKey:'independent-revoke-role'};
  assert.equal((await request(app).post('/api/apps/refund-review/records/rr_2001/decision').set('Cookie',approver).send(payload)).status,200);
  db.prepare("UPDATE users SET role='viewer' WHERE id='u_apr_theo'").run();
  const r=await request(app).post('/api/apps/refund-review/records/rr_2001/decision').set('Cookie',approver).send(payload);
  assert.equal(r.status,403);assert.equal(r.body.duplicate,undefined);
 });
 console.log(JSON.stringify({results,passed:results.filter(x=>x.pass).length,total:results.length},null,2));
 process.exitCode=results.every(x=>x.pass)?0:1;
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
