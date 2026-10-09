import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
class DB{
 raw=new Database(':memory:');constructor(){for(const f of ['0001_shared_mazraaty.sql','0002_booking_periods.sql','0003_phone_accounts.sql'])this.raw.exec(readFileSync('migrations/'+f,'utf8'));}
 prepare(sql:string){const db=this;let args:unknown[]=[];return {bind(...v:unknown[]){args=v;return this;},async first(){return db.raw.prepare(sql).get(...args as any[]);},async all(){return {results:db.raw.prepare(sql).all(...args as any[])};},async run(){return {meta:{changes:db.raw.prepare(sql).run(...args as any[]).changes}};}};}
 async batch(statements:any[]){this.raw.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.raw.exec('COMMIT');return out;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
test('independent deployment blocks device fallback while phone configuration is missing',async()=>{
 const db=new DB(),env={DB:db,REQUIRE_PHONE_AUTH:'true'} as unknown as SharedEnv;
 const origin='https://test.mazraaty.invalid';
 try{
 const status=await handleShared(new Request(origin+'/api/v2/account/status'),env);
 expect(await status.json()).toEqual({enabled:true,authenticated:false,phone:''});
 for(const [path,method] of [['bookings','GET'],['bookings','POST'],['device','DELETE'],['bookings/test-id/cancel','POST'],['account/start','POST']]){
 const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:origin,'X-Device-Token':'a'.repeat(64)},...(method==='POST'?{body:'{}'}:{})}),env);
 expect(r.status).toBe(503);
 }
 expect(db.raw.query('SELECT count(*) AS n FROM customers').get()).toEqual({n:0});
 expect(db.raw.query('SELECT count(*) AS n FROM bookings').get()).toEqual({n:0});
 expect((await handleShared(new Request(origin+'/api/v2/catalog'),env)).status).toBe(200);
 }finally{db.raw.close();}
});

test('demo login is isolated by environment and hostname, restricts identity and never calls Twilio',async()=>{
 const db=new DB(),env={DB:db,REQUIRE_PHONE_AUTH:'true',APP_ENV:'preview',DEMO_AUTH_HOST:'preview.mazraaty.invalid',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'654321',ADMIN_PASSWORD:'test-preview-admin-password'} as unknown as SharedEnv;
 const origin='https://preview.mazraaty.invalid',original=globalThis.fetch;let calls=0;
 globalThis.fetch=(async()=>{calls++;throw Error('Demo must not contact Twilio');}) as typeof fetch;
 const call=async(path:string,method='GET',value?:unknown,cookie='',override=env,host=origin)=>{
  const r=await handleShared(new Request(host+'/api/v2/'+path,{method,headers:{Origin:host,Cookie:cookie},...(value===undefined?{}:{body:JSON.stringify(value)})}),override);
  return {r,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
 };
 try{
 for(const override of [{...env,APP_ENV:'production'},{...env,DEMO_AUTH_CODE:undefined},{...env,DEMO_AUTH_PHONE:undefined},{...env,DEMO_AUTH_HOST:'other.invalid'}]){
  expect((await call('account/start','POST',{phone:'07700000000'},'',override)).r.status).toBe(503);
 }
 expect((await call('account/start','POST',{phone:'07700000000'},'',env,'https://production.mazraaty.invalid')).r.status).toBe(503);
 expect((await call('account/start','POST',{phone:'07711111111'})).r.status).toBe(400);
 expect((await call('bookings')).r.status).toBe(401);
 const start=await call('account/start','POST',{phone:'07700000000'});
 expect(start.r.status).toBe(200);expect(start.data.demo).toBe(true);expect(start.data.sent).toBe(false);
 expect(JSON.stringify(start.data)).not.toContain(env.DEMO_AUTH_CODE!);
 expect((await call('account/check','POST',{code:'000000'},start.cookie)).r.status).toBe(400);
 const signed=await call('account/check','POST',{code:env.DEMO_AUTH_CODE},start.cookie);
 expect(signed.r.status).toBe(200);expect(signed.r.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
 const status=await call('account/status','GET',undefined,signed.cookie);expect(status.data.demo).toBe(true);expect(status.data.authenticated).toBe(true);
 expect((await call('account/check','POST',{code:env.DEMO_AUTH_CODE},start.cookie)).r.status).toBe(401);
 expect((await call('owner/farms','POST',{},signed.cookie)).r.status).toBe(401);
 const owner=await call('login','POST',{password:env.ADMIN_PASSWORD});
 const farm=(await call('owner/farms','POST',{name:'مزرعة تجربة',region:'بغداد',area:'تجربة',description:'تجربة فقط',price:100000,eveningPrice:150000,capacity:10,amenities:'',images:['/assets/standalone-farm.svg'],published:true},owner.cookie)).data.farm;
 const booking={farmId:farm.id,date:new Date(Date.now()+20*86400000).toISOString().slice(0,10),guests:2,name:'تجربة',phone:'07711111111',notes:''};
 for(const period of ['morning','evening']){
  const r=await call('bookings','POST',{...booking,period,requestId:crypto.randomUUID()},signed.cookie);expect(r.r.status).toBe(201);expect(r.data.booking.phone).toBe(env.DEMO_AUTH_PHONE);
  expect((await call('owner/bookings/'+r.data.booking.id,'PATCH',{status:'confirmed'},owner.cookie)).r.status).toBe(200);
  expect((await call('bookings','POST',{...booking,period,requestId:crypto.randomUUID()},signed.cookie)).r.status).toBe(409);
 }
 expect((await call('bookings','GET',undefined,signed.cookie)).data.bookings.length).toBe(2);
 await call('account/logout','POST',{},signed.cookie);expect((await call('bookings','GET',undefined,signed.cookie)).r.status).toBe(401);
 expect(calls).toBe(0);
 }finally{globalThis.fetch=original;db.raw.close();}
});

test('verified identity protects bookings, survives device change, cannot spoof phone, revokes sessions',async()=>{
 const db=new DB(),env={DB:db,ADMIN_PASSWORD:'test-admin-password-long',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'not-a-real-secret',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)} as unknown as SharedEnv;
 const origin='https://test.mazraaty.invalid',original=globalThis.fetch;let providerCalls=0;
 globalThis.fetch=(async(url:any,init:any)=>{expect(String(url).startsWith('https://verify.twilio.com/v2/Services/VA')).toBe(true);providerCalls++;const p=new URLSearchParams(init.body);if(String(url).endsWith('/Verifications')){expect(p.has('CustomFriendlyName')).toBe(false);return Response.json({status:'pending'});}return Response.json({status:p.get('Code')==='123456'?'approved':'pending'});}) as typeof fetch;
 async function call(path:string,method='GET',value?:unknown,cookie='',token='a'.repeat(64)){const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:origin,'CF-Connecting-IP':'127.0.0.1',Cookie:cookie,'X-Device-Token':token},body:value===undefined?undefined:JSON.stringify(value)}),env);return {r,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
 async function sign(phone:string,token='a'.repeat(64)){const start=await call('account/start','POST',{phone},'',token);expect(start.r.status).toBe(200);const checked=await call('account/check','POST',{code:'123456'},start.cookie,token);expect(checked.r.status).toBe(200);return checked.cookie;}
 try{
 expect((await call('account/status')).data.authenticated).toBe(false);expect((await call('bookings')).r.status).toBe(401);expect((await call('bookings','POST',{})).r.status).toBe(401);
 const start=await call('account/start','POST',{phone:'07700000000'});expect(start.data.phone).toBe('+9647700000000');expect((await call('account/check','POST',{code:'000000'},start.cookie)).r.status).toBe(400);
 const a=await call('account/check','POST',{code:'123456'},start.cookie);expect(a.r.status).toBe(200);expect(a.r.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');expect((await call('account/check','POST',{code:'123456'},start.cookie)).r.status).toBe(401);
 const owner=await call('login','POST',{password:env.ADMIN_PASSWORD}),farm=(await call('owner/farms','POST',{name:'مزرعة اختبار',region:'بغداد',area:'اختبار',description:'اختبار',price:100000,capacity:10,amenities:'',images:['/assets/standalone-farm.svg'],published:true},owner.cookie)).data.farm;
 const booking={farmId:farm.id,date:new Date(Date.now()+20*86400000).toISOString().slice(0,10),period:'morning',guests:2,name:'اختبار',phone:'07711111111',notes:'',requestId:crypto.randomUUID()};
 const saved=await call('bookings','POST',booking,a.cookie);expect(saved.r.status).toBe(201);expect(saved.data.booking.phone).toBe('+9647700000000');
 const same=await sign('07700000000','b'.repeat(64));expect((await call('bookings','GET',undefined,same,'b'.repeat(64))).data.bookings[0].id).toBe(saved.data.booking.id);
 const other=await sign('07722222222','c'.repeat(64));expect((await call('bookings','GET',undefined,other)).data.bookings).toEqual([]);expect((await call('bookings/'+saved.data.booking.id+'/cancel','POST',{},other)).r.status).toBe(404);expect((await call('owner/farms','POST',{},same)).r.status).toBe(401);
 await call('account/logout','POST',{},a.cookie);expect((await call('bookings','GET',undefined,a.cookie)).r.status).toBe(401);expect((await call('bookings','GET',undefined,same)).r.status).toBe(200);
 await call('device','DELETE',undefined,same);expect((await call('bookings','GET',undefined,same)).r.status).toBe(401);expect(db.raw.query('SELECT count(*) AS n FROM customers WHERE phone=?').get('+9647700000000')).toEqual({n:0});
 const before=providerCalls;for(let i=0;i<3;i++)await call('account/start','POST',{phone:'07733333333'});expect((await call('account/start','POST',{phone:'07733333333'})).r.status).toBe(429);expect(providerCalls-before).toBe(3);
 const badOrigin=await handleShared(new Request(origin+'/api/v2/account/start',{method:'POST',headers:{Origin:'https://evil.invalid'},body:JSON.stringify({phone:'07744444444'})}),env);expect(badOrigin.status).toBe(403);
 }finally{globalThis.fetch=original;db.raw.close();}
});
