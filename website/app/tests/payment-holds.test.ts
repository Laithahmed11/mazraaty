import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
class DB {
 raw=new Database(':memory:');constructor(){this.raw.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('migrations/'+f,'utf8'));}
 prepare(sql:string){const db=this;let args:any[]=[];return {bind(...v:any[]){args=v;return this},async first(){return db.raw.prepare(sql).get(...args)},async all(){return {results:db.raw.prepare(sql).all(...args)}},async run(){return {meta:{changes:db.raw.prepare(sql).run(...args).changes}}}};}
 async batch(ss:any[]){this.raw.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());this.raw.exec('COMMIT');return r}catch(e){this.raw.exec('ROLLBACK');throw e}}
}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function fixture(){
 const db=new DB(),origin='https://mazraati-preview.laithlaith500.workers.dev',date=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
 const env={DB:db,ADMIN_PASSWORD:'private-fixture-password-long-enough',APP_ENV:'preview',REQUIRE_PHONE_AUTH:'true',DEMO_AUTH_HOST:'mazraati-preview.laithlaith500.workers.dev',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'123456',PAYMENTS_MODE:'test',PAYMENTS_PROVIDER:'wayl',WAYL_ENV:'test',WAYL_API_TOKEN:'fake-private-key-for-tests',WAYL_WEBHOOK_SECRET:'private-test-webhook-secret-only-12345',PAYMENT_SITE_URL:origin,BOOKING_CONFIRMATION_MODE:'after_payment'} as unknown as SharedEnv;
 for(const [id,phone,token,session] of [['one','+9647700000000','a'.repeat(64),'b'.repeat(64)],['two','+9647711111111','c'.repeat(64),'d'.repeat(64)]]){
  db.raw.prepare('INSERT INTO customers(id,phone,booking_token,created_at) VALUES(?,?,?,?)').run(id,phone,token,new Date().toISOString());db.raw.prepare('INSERT INTO customer_sessions(id,customer_id,expires) VALUES(?,?,?)').run(await hash(session),id,Math.floor(Date.now()/1000)+3600);db.raw.prepare('INSERT INTO devices(hash,revoked) VALUES(?,0)').run(await hash(token));
 }
 db.raw.prepare("INSERT INTO farms(id,name,region,area,description,price,evening_price,capacity,amenities,images,published,updated_at) VALUES('farm','اختبار','بغداد','اختبار','اختبار',100000,150000,10,'مسبح','[\"/assets/standalone-farm.svg\"]',1,?)").run(new Date().toISOString());
 const call=async(path:string,method='GET',body?:unknown,session='b'.repeat(64))=>{const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:origin,Cookie:'mazraaty_customer='+session,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);return {r,data:await r.json() as any}};
 const book=(period='morning',session='b'.repeat(64),requestId=crypto.randomUUID())=>{const price=db.raw.query('SELECT price,evening_price FROM farms WHERE id=?').get('farm') as {price:number;evening_price:number};return call('bookings','POST',{farmId:'farm',date,period,guests:2,name:'اختبار',phone:'07700000000',notes:'',expectedTotal:period==='morning'?price.price:price.evening_price,requestId,paymentPercent:1,amount:1},session)};
 let link:any,posts=0;const links=new Map<string,any>(),previous=globalThis.fetch;
 globalThis.fetch=(async(_input,options)=>{if(options?.method==='POST'){posts++;const payload=JSON.parse(String(options.body));link={...payload,id:'fixture-'+posts,total:String(payload.total),url:'https://checkout.thewayl.com/pay/FIXTURE',status:'Created',createdAt:new Date().toISOString()};links.set(payload.referenceId,link);return Response.json({data:link},{status:201})}const current=links.get(decodeURIComponent(new URL(String(_input)).pathname.split('/').pop()!));return current?Response.json({data:current}):new Response(null,{status:404})}) as typeof fetch;
 return {db,env,date,call,book,get link(){return link},get posts(){return posts},close(){globalThis.fetch=previous;db.raw.close()}};
}
test('a payment hold atomically blocks only its period, rejects manual confirmation, and confirms once on verified payment',async()=>{
 const f=await fixture();try{
  const requestId=crypto.randomUUID(),created=await f.book('morning',undefined,requestId),b=created.data.booking;
  expect(created.r.status).toBe(201);expect(b.status).toBe('awaiting_payment');expect(b.paymentRequired).toBe(true);expect(b.holdUntil).toBeGreaterThan(Math.floor(Date.now()/1000));
  expect((await f.book('morning','d'.repeat(64))).r.status).toBe(409);
  expect((await f.book('evening')).r.status).toBe(409); // A customer cannot hoard unpaid slots.
  const replay=await f.book('morning',undefined,requestId);expect(replay.data.booking.id).toBe(b.id);
  expect((await f.call('unavailable?farmId=farm&period=morning')).data.dates).toEqual([f.date]);expect((await f.call('unavailable?farmId=farm&period=evening')).data.dates).toEqual([]);
  const login=await handleShared(new Request(f.env.PAYMENT_SITE_URL+'/api/v2/login',{method:'POST',headers:{Origin:f.env.PAYMENT_SITE_URL!},body:JSON.stringify({password:f.env.ADMIN_PASSWORD})}),f.env);
  const manual=await handleShared(new Request(f.env.PAYMENT_SITE_URL+'/api/v2/owner/bookings/'+b.id,{method:'PATCH',headers:{Origin:f.env.PAYMENT_SITE_URL!,Cookie:login.headers.get('set-cookie')!.split(';')[0]},body:'{"status":"confirmed"}'}),f.env);expect(manual.status).toBe(409);
  expect(()=>f.db.raw.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(b.id)).toThrow('Verified payment');
  const checkout=await f.call('bookings/'+b.id+'/payment','POST');expect(checkout.r.status).toBe(200);expect(checkout.data.payment.url).toBe(f.link.url);expect(f.link.linkExpiresIn).toMatch(/^\d+m$/);
  await f.call('bookings/'+b.id+'/payment','POST');expect(f.posts).toBe(1);
  expect((await f.call('bookings/'+b.id+'/payment?paid=true&paymentReturn=1')).data.payment.status).toBe('awaiting_payment');
  f.link.status='Complete';f.link.completedAt=new Date().toISOString();f.link.paymentMethod='Card';
  const raw=JSON.stringify({referenceId:f.link.referenceId,id:f.link.id,total:Number(f.link.total)}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.link.webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']),sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const webhook=()=>handleShared(new Request(f.link.webhookUrl,{method:'POST',headers:{'x-wayl-signature-256':sig},body:raw}),f.env);
  expect((await webhook()).status).toBe(200);expect((await webhook()).status).toBe(200);
  await f.call('bookings/'+b.id+'/payment','PATCH');await f.call('bookings/'+b.id+'/payment','PATCH');
  const saved=f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id);expect(saved).toEqual({status:'confirmed'});
  expect(f.db.raw.prepare('SELECT status FROM payment_requests WHERE booking_id=?').get(b.id)).toEqual({status:'paid'});
  expect(f.db.raw.prepare("SELECT COUNT(*) AS n FROM push_events WHERE booking_id=? AND kind='confirmed' AND role='customer'").get(b.id)).toEqual({n:1});
  expect(f.db.raw.prepare("SELECT COUNT(*) AS n FROM push_events WHERE booking_id=? AND kind='confirmed' AND role='owner'").get(b.id)).toEqual({n:1});
  expect(f.db.raw.prepare('SELECT COUNT(*) AS n FROM reserved_dates WHERE booking_id=?').get(b.id)).toEqual({n:1});
 }finally{f.close()}
});
test('only the saved 8% booking fee goes to Wayl; the remaining 92% is cash and client amounts cannot override it',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE farms SET price=250000,evening_price=400000 WHERE id=?').run('farm');
  for(const [period,session,total,online,cash] of [['morning','b'.repeat(64),250000,20000,230000],['evening','d'.repeat(64),400000,32000,368000]] as const){
   const b=(await f.book(period,session)).data.booking;expect(b.total).toBe(total);expect(b.paymentPlan).toEqual({percent:8,total,online,cash});
   const payment=await f.call('bookings/'+b.id+'/payment','POST',undefined,session);expect(payment.data.payment.amount).toBe(online);expect(f.link.total).toBe(String(online));expect(f.link.lineItem[0].label).toBe('Mazraaty booking confirmation fee');
   expect(()=>f.db.raw.prepare('UPDATE bookings SET payment_percent=100 WHERE id=?').run(b.id)).toThrow('Payment plan is already committed');
   f.db.raw.prepare('UPDATE farms SET price=price+5000,evening_price=evening_price+5000 WHERE id=?').run('farm');
   const saved=(await f.call('bookings/'+b.id+'/payment','GET',undefined,session)).data.payment;expect(saved.amount).toBe(online);
   f.db.raw.prepare('UPDATE farms SET price=250000,evening_price=400000 WHERE id=?').run('farm');
  }
 }finally{f.close()}
});
test('non-round booking prices use whole IQD and unsupported tiny deposits are rejected before reserving or creating an order',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE farms SET price=250001 WHERE id=?').run('farm');
  const b=(await f.book()).data.booking;expect(b.paymentPlan).toEqual({percent:8,total:250001,online:20001,cash:230000});
  await f.call('bookings/'+b.id+'/payment','POST');expect(f.link.total).toBe('20001');
  f.db.raw.prepare('UPDATE farms SET evening_price=1000 WHERE id=?').run('farm');
  const tiny=await f.book('evening','d'.repeat(64));expect(tiny.r.status).toBe(400);expect(f.db.raw.query("SELECT COUNT(*) AS n FROM bookings WHERE period='evening'").get()).toEqual({n:0});
 }finally{f.close()}
});
test('two competing booking submissions produce exactly one hold and leave the other period free',async()=>{
 const f=await fixture();try{
  const submitted=await Promise.all([f.book('morning'),f.book('morning','d'.repeat(64))]);expect(submitted.map(r=>r.r.status).sort()).toEqual([201,409]);
  expect(f.db.raw.query('SELECT COUNT(*) AS n FROM reserved_dates').get()).toEqual({n:1});
  const loser=submitted[0].r.status===409?'b'.repeat(64):'d'.repeat(64);expect((await f.book('evening',loser)).r.status).toBe(201);
  expect((await f.call('unavailable?farmId=farm')).data.dates).toEqual([f.date]);
 }finally{f.close()}
});
test('hold expiry frees the slot and a late paid order never resurrects it over a second customer',async()=>{
 const f=await fixture();try{
  const b=(await f.book()).data.booking;await f.call('bookings/'+b.id+'/payment','POST');
  f.db.raw.prepare('UPDATE bookings SET hold_until=? WHERE id=?').run(Math.floor(Date.now()/1000)-1,b.id);
  expect((await f.call('unavailable?farmId=farm&period=morning')).data.dates).toEqual([]);
  expect(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id)).toEqual({status:'expired'});
  const second=(await f.book('morning','d'.repeat(64))).data.booking;expect(second.status).toBe('awaiting_payment');
  f.link.status='Complete';f.link.completedAt=new Date().toISOString();f.link.paymentMethod='Card';
  await f.call('bookings/'+b.id+'/payment','PATCH');expect(f.db.raw.prepare('SELECT status FROM payment_requests WHERE booking_id=?').get(b.id)).toEqual({status:'review_required'});
  expect(f.db.raw.prepare('SELECT booking_id FROM reserved_dates WHERE farm_id=? AND date=? AND period=?').get('farm',f.date,'morning')).toEqual({booking_id:second.id});
  expect((await f.call('bookings/'+b.id+'/payment','POST')).data.payment.url).toBeNull();
 }finally{f.close()}
});
test('confirmation uses the database deadline even when the request clock predates expiry',async()=>{
 const f=await fixture(),realNow=Date.now;try{
  const b=(await f.book()).data.booking;await f.call('bookings/'+b.id+'/payment','POST');
  f.db.raw.prepare('UPDATE bookings SET hold_until=unixepoch()-1 WHERE id=?').run(b.id);
  f.link.status='Complete';f.link.completedAt=new Date().toISOString();f.link.paymentMethod='Card';
  Date.now=()=>realNow()-60000; // A stale request timestamp cannot override SQL's current deadline.
  await f.call('bookings/'+b.id+'/payment','PATCH');
  expect(f.db.raw.prepare('SELECT status FROM payment_requests WHERE booking_id=?').get(b.id)).toEqual({status:'review_required'});
  expect(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id)).not.toEqual({status:'confirmed'});
 }finally{Date.now=realNow;f.close()}
});
test('cancellation and account erasure release unpaid holds; legacy bookings and disabled checkout keep their existing behavior',async()=>{
 const f=await fixture();try{
  const b=(await f.book()).data.booking;await f.call('bookings/'+b.id+'/payment','POST');
  expect((await f.call('bookings/'+b.id+'/cancel','POST',{})).data.booking.status).toBe('cancelled');expect((await f.call('unavailable?farmId=farm&period=morning')).data.dates).toEqual([]);
  f.link.status='Complete';f.link.completedAt=new Date().toISOString();f.link.paymentMethod='Card';await f.call('bookings/'+b.id+'/payment','PATCH');expect(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id)).toEqual({status:'cancelled'});
  const other=(await f.book('evening','d'.repeat(64))).data.booking;expect(other.status).toBe('awaiting_payment');
  expect((await f.call('device','DELETE',undefined,'d'.repeat(64))).r.status).toBe(200);expect(f.db.raw.prepare('SELECT COUNT(*) AS n FROM reserved_dates WHERE booking_id=?').get(other.id)).toEqual({n:0});
  f.env.PAYMENTS_MODE='disabled';expect((await f.book()).r.status).toBe(503);
  (f.env as any).BOOKING_CONFIRMATION_MODE=undefined;expect((await f.book()).data.booking.status).toBe('pending');
 }finally{f.close()}
});
