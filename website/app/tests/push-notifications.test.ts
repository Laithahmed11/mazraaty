import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
import {dispatchPush,pushHash,bookingStart} from '../src/lib/push.server';
class DB{
 raw=new Database(':memory:');constructor(){for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('migrations/'+file,'utf8'));}
 prepare(sql:string){const db=this;let args:unknown[]=[];return {bind(...v:unknown[]){args=v;return this;},async first(){return db.raw.prepare(sql).get(...args as any[]);},async all(){return {results:db.raw.prepare(sql).all(...args as any[])};},async run(){return {meta:{changes:db.raw.prepare(sql).run(...args as any[]).changes}};}};}
 async batch(statements:any[]){this.raw.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.raw.exec('COMMIT');return out;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
test('authenticated devices, offers consent, atomic booking outbox, retries and logout isolation',async()=>{
 const db=new DB(),origin='https://preview.mazraaty.invalid',privateKeys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const key=btoa(Array.from(new Uint8Array(await crypto.subtle.exportKey('pkcs8',privateKeys.privateKey)),x=>String.fromCharCode(x)).join(''));
 const env={DB:db,ADMIN_PASSWORD:'a-private-test-admin-password',REQUIRE_PHONE_AUTH:'true',APP_ENV:'preview',DEMO_AUTH_HOST:'preview.mazraaty.invalid',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'654321',PUSH_ENABLED:'true',FCM_PROJECT_ID:'test-project',FCM_CLIENT_EMAIL:'push@test-project.iam.gserviceaccount.com',FCM_PRIVATE_KEY:key} as unknown as SharedEnv;
 const call=async(path:string,method='GET',data?:unknown,cookie='',requestOrigin=origin)=>{const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:requestOrigin,Cookie:cookie},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);return {r,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};
 const original=globalThis.fetch,sends:any[]=[];let failProvider=false;
 globalThis.fetch=(async(url:any,init:any)=>{if(String(url)==='https://oauth2.googleapis.com/token'){const assertion=new URLSearchParams(init.body).get('assertion')!,[header,payload,signature]=assertion.split('.');expect(JSON.parse(atob(payload)).scope).toBe('https://www.googleapis.com/auth/firebase.messaging');expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',privateKeys.publicKey,Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)),new TextEncoder().encode(header+'.'+payload))).toBe(true);return Response.json({access_token:'test-bearer',expires_in:3600});}
 expect(String(url)).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');if(failProvider)return Response.json({error:{}},{status:503});sends.push(JSON.parse(init.body).message);return Response.json({name:'sent'});}) as typeof fetch;
 try{
  expect((await call('push/status')).r.status).toBe(401);expect((await call('owner/push/campaigns','POST',{title:'عرض',body:'تجربة',requestId:'test'})).r.status).toBe(401);
  const start=await call('account/start','POST',{phone:'07700000000'}),customer=await call('account/check','POST',{code:'654321'},start.cookie),owner=await call('login','POST',{password:env.ADMIN_PASSWORD});
  const token='customer-token-'.repeat(5),binding=crypto.randomUUID();
  expect((await call('push/device','POST',{token,binding},customer.cookie,'https://evil.invalid')).r.status).toBe(403);
  expect((await call('push/device','POST',{token:'short',binding},customer.cookie)).r.status).toBe(400);
  expect((await call('push/device','POST',{token,binding},customer.cookie)).r.status).toBe(200);
  const ownerToken='owner-token-'.repeat(5);expect((await call('owner/push/device','POST',{token:ownerToken,binding:crypto.randomUUID()},owner.cookie)).r.status).toBe(200);
  const start2=await call('account/start','POST',{phone:'07700000000'}),customer2=await call('account/check','POST',{code:'654321'},start2.cookie);
  expect((await call('push/device','POST',{token,binding},customer2.cookie)).r.status).toBe(409);
  expect((await call('owner/push/campaigns','POST',{title:'عرض',body:'نص تجريبي',requestId:'offer-1'},owner.cookie)).r.status).toBe(202);
  await dispatchPush(env);expect(sends).toHaveLength(0); // No marketing consent.
  expect((await call('push/device','POST',{token,binding,marketing:true},customer.cookie)).r.status).toBe(200);
  // An offer that predates consent must not be replayed when consent is enabled.
  await dispatchPush(env);expect(sends).toHaveLength(0);
  await call('owner/push/campaigns','POST',{title:'عرض جديد',body:'نص العرض',requestId:'offer-2'},owner.cookie);await dispatchPush(env);
  expect(sends).toHaveLength(1);expect(sends[0].token).toBe(token);expect(sends[0].data.kind).toBe('offer');expect(sends[0].notification).toBeUndefined();
  await dispatchPush(env);expect(sends).toHaveLength(1);
  const farm=(await call('owner/farms','POST',{name:'مزرعة فحص',region:'بغداد',area:'فحص',description:'فحص',price:100000,eveningPrice:150000,capacity:10,amenities:'',images:['/assets/standalone-farm.svg'],published:true},owner.cookie)).data.farm;
  const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10),payload={farmId:farm.id,date,period:'evening',guests:2,name:'اسم لا يظهر في إشعار',phone:'07700000000',notes:'معلومة خاصة',requestId:crypto.randomUUID()};
  const booking=(await call('bookings','POST',payload,customer.cookie)).data.booking;await call('bookings','POST',payload,customer.cookie);await dispatchPush(env);
  expect(sends.filter(x=>x.data.kind==='new')).toHaveLength(1);expect(sends.find(x=>x.data.kind==='new').token).toBe(ownerToken);
  failProvider=true;expect((await call('owner/bookings/'+booking.id,'PATCH',{status:'confirmed'},owner.cookie)).r.status).toBe(200);await dispatchPush(env);expect(sends.filter(x=>x.data.kind==='confirmed')).toHaveLength(0);
  failProvider=false;db.raw.exec('UPDATE push_deliveries SET next_attempt=0');await dispatchPush(env);expect(sends.filter(x=>x.data.kind==='confirmed')).toHaveLength(1);expect(sends.find(x=>x.data.kind==='confirmed').token).toBe(token);
  expect(JSON.stringify(sends)).not.toContain('معلومة خاصة');expect(JSON.stringify(sends)).not.toContain('07700000000');
  await call('account/logout','POST',{},customer.cookie);expect(db.raw.query('SELECT token FROM push_devices WHERE token=?').get(token)).toBeNull();
  expect((await call('push/device','POST',{token,binding},customer.cookie)).r.status).toBe(401);
  await call('owner/logout','POST',{},owner.cookie);expect(db.raw.query('SELECT COUNT(*) AS n FROM push_devices').get()).toEqual({n:0});
  expect(bookingStart('2026-10-12','morning')).toBe(Date.parse('2026-10-12T04:00:00Z'));expect(bookingStart('2026-10-12','evening')).toBe(Date.parse('2026-10-12T16:00:00Z'));
 }finally{globalThis.fetch=original;db.raw.close();}
});
