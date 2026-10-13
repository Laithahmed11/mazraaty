import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {checkoutReadiness,createBookingCheckout,dispatchCheckout,dispatchPaymentWhatsApp,applyVerifiedPayment,type PaymentProvider} from '../src/lib/checkout.server';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
class DB {
 raw=new Database(':memory:');constructor(){for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('migrations/'+f,'utf8'));}
 prepare(sql:string){const db=this;let args:any[]=[];return {bind(...v:any[]){args=v;return this},async first(){return db.raw.prepare(sql).get(...args)},async all(){return {results:db.raw.prepare(sql).all(...args)}},async run(){const r=db.raw.prepare(sql).run(...args);return {meta:{changes:r.changes}}}};}
 async batch(ss:any[]){this.raw.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());this.raw.exec('COMMIT');return r}catch(e){this.raw.exec('ROLLBACK');throw e}}
}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
test('checkout preparation cannot charge or send in preview; owner-only setup endpoints fail closed',async()=>{
 const db=new DB(),env={DB:db,APP_ENV:'preview',PAYMENTS_MODE:'live',WHATSAPP_ENABLED:'true',ADMIN_PASSWORD:'test-admin-password-long-enough'} as unknown as SharedEnv;
 const before=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('No external calls allowed')}) as typeof fetch;
 try{
  expect(checkoutReadiness(env).enabled).toBe(false);await dispatchCheckout(env);await dispatchPaymentWhatsApp(env);expect(calls).toBe(0);
  const origin='https://test.mazraaty.invalid';
  const request=(path:string,method='GET',cookie='',otherOrigin=origin)=>new Request(origin+'/api/v2/'+path,{method,headers:{Cookie:cookie,Origin:otherOrigin,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
  expect((await handleShared(request('owner/checkout/status'),env)).status).toBe(401);
  const login=await handleShared(new Request(origin+'/api/v2/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env),cookie=login.headers.get('set-cookie')!.split(';')[0];
  const status=await handleShared(request('owner/checkout/status','GET',cookie),env);expect(status.status).toBe(200);expect((await status.json()).enabled).toBe(false);
  expect((await handleShared(request('owner/bookings/fake/payment-link','POST',cookie),env)).status).toBe(503);
  expect((await handleShared(request('owner/bookings/fake/payment-link','POST',cookie,'https://evil.invalid'),env)).status).toBe(403);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM payment_requests').get()).toEqual({n:0});expect(calls).toBe(0);
 }finally{globalThis.fetch=before;db.raw.close()}
});
test('in-app sandbox payment requires the verified booking owner, needs no WhatsApp consent, and never trusts a return URL',async()=>{
 const db=new DB(),origin='https://mazraati-preview.laithlaith500.workers.dev',session='a'.repeat(64),otherSession='b'.repeat(64),token='c'.repeat(64),otherToken='d'.repeat(64),principal=await hash(token),date=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 const env={DB:db,APP_ENV:'preview',REQUIRE_PHONE_AUTH:'true',DEMO_AUTH_HOST:'mazraati-preview.laithlaith500.workers.dev',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'123456',PAYMENTS_MODE:'test',PAYMENTS_PROVIDER:'wayl',WAYL_ENV:'test',WAYL_API_TOKEN:'fake-private-key-for-tests',WAYL_WEBHOOK_SECRET:'private-test-webhook-secret-only-12345',PAYMENT_SITE_URL:origin} as unknown as SharedEnv;
 for(const [id,phone,t,s] of [['customer','+9647700000000',token,session],['other','+9647711111111',otherToken,otherSession]]){
  db.raw.prepare('INSERT INTO customers(id,phone,booking_token,created_at) VALUES(?,?,?,?)').run(id,phone,t,new Date().toISOString());db.raw.prepare('INSERT INTO customer_sessions(id,customer_id,expires) VALUES(?,?,?)').run(await hash(s),id,Math.floor(Date.now()/1000)+3600);db.raw.prepare('INSERT INTO devices(hash,revoked) VALUES(?,0)').run(await hash(t));
 }
 const id=crypto.randomUUID();db.raw.prepare("INSERT INTO bookings(id,device_hash,request_id,payload_hash,farm_id,farm_name,date,period,guests,customer_name,phone,notes,total,status,created_at,whatsapp_opt_in) VALUES(?,?,?,'test','fixture','اختبار',?,'evening',2,'اختبار','+9647700000000','',100000,'pending',?,0)").run(id,principal,id,date,new Date().toISOString());
 const call=async(path:string,method='GET',cookie=session,requestOrigin=origin)=>{const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Cookie:'mazraaty_customer='+cookie,Origin:requestOrigin,'X-Device-Token':token}}),env);return {r,data:await r.json() as any}};
 const previous=globalThis.fetch;let posts=0,queries=0;let link:any;
 globalThis.fetch=(async(input,options)=>{
  expect(String(input)).toStartWith('https://api.thewayl.com/api/v1/links');queries++;
  if(options?.method==='POST'){posts++;const payload=JSON.parse(String(options.body));expect(payload.env).toBe('test');expect(payload.total).toBe(100000);link={...payload,id:'fake-provider-link',total:'100000',url:'https://checkout.thewayl.com/pay/FIXTURE',status:'Created',createdAt:new Date().toISOString()};return Response.json({data:link},{status:201})}
  return link?Response.json({data:link}):new Response(null,{status:404});
 }) as typeof fetch;
 try{
  expect(checkoutReadiness(env).mode).toBe('test');
  expect((await call('bookings/'+id+'/payment','POST','')).r.status).toBe(401);
  expect((await call('bookings/'+id+'/payment','POST',otherSession)).r.status).toBe(404);
  expect((await call('bookings/'+id+'/payment','POST',session,'https://attacker.invalid')).r.status).toBe(403);
  expect((await call('bookings/'+id+'/payment','POST')).r.status).toBe(503);expect(queries).toBe(0);
  db.raw.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(id);
  const created=await call('bookings/'+id+'/payment','POST');expect(created.r.status).toBe(200);expect(created.data.payment.environment).toBe('test');expect(created.data.payment.amount).toBe(100000);expect(created.data.payment.url).toBe(link.url);expect(posts).toBe(1);
  await call('bookings/'+id+'/payment','POST');expect(posts).toBe(1);expect(db.raw.query('SELECT COUNT(*) AS n FROM whatsapp_payment_outbox').get()).toEqual({n:0});
  expect((await call('bookings/'+id+'/payment?paymentReturn=1&paid=true')).data.payment.status).toBe('awaiting_payment');
  const listed=(await call('bookings')).data;expect(listed.checkout.mode).toBe('test');expect(listed.bookings[0].payment.environment).toBe('test');expect(listed.bookings[0].payment.url).toBeUndefined();
  expect((await call('bookings/'+id+'/payment','GET',otherSession)).r.status).toBe(404);
  const event={referenceId:link.referenceId,id:link.id,total:100000,paymentStatus:'paid'},raw=JSON.stringify(event),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(link.webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const webhook=async(sig=signature)=>handleShared(new Request(link.webhookUrl,{method:'POST',headers:{'x-wayl-signature-256':sig},body:raw}),env);
  const queryCount=queries;expect((await webhook('0'.repeat(64))).status).toBe(403);expect(queries).toBe(queryCount);
  expect((await webhook()).status).toBe(200);expect((await call('bookings/'+id+'/payment')).data.payment.status).toBe('awaiting_payment');
  link.status='Complete';link.completedAt=new Date().toISOString();link.paymentMethod='Card';
  expect((await call('bookings/'+id+'/payment','PATCH')).r.status).toBe(200);expect((await webhook()).status).toBe(200);expect((await call('bookings/'+id+'/payment')).data.payment).toMatchObject({status:'paid',environment:'test',url:null});expect(posts).toBe(1);
  link.status='Returned';await call('bookings/'+id+'/payment','PATCH');expect((await call('bookings/'+id+'/payment')).data.payment.status).toBe('review_required');
  expect(db.raw.prepare('SELECT status,total FROM bookings WHERE id=?').get(id)).toEqual({status:'confirmed',total:100000});
 }finally{globalThis.fetch=previous;db.raw.close()}
});
test('payment lifecycle uses verified identity, consent, saved amount, single init, and at-most-once WhatsApp submission',async()=>{
 const db=new DB(),token='a'.repeat(64),principal=await hash(token),now=Math.floor(Date.now()/1000),date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 db.raw.prepare('INSERT INTO customers(id,phone,booking_token,created_at) VALUES(?,?,?,?)').run('customer','+9647700000000',token,new Date().toISOString());
 db.raw.prepare('INSERT INTO devices(hash,revoked) VALUES(?,0)').run(principal);
 const add=(id:string,opt=1)=>db.raw.prepare("INSERT INTO bookings(id,device_hash,request_id,payload_hash,farm_id,farm_name,date,period,guests,customer_name,phone,notes,total,status,created_at,whatsapp_opt_in) VALUES(?,?,?,'test','farm','مزرعة',?,'morning',3,'اختبار','+9647700000000','',100000,'confirmed',?,?)").run(id,principal,id,date,new Date().toISOString(),opt);
 add('booking');add('no-consent',0);add('erasure');add('timeout');add('late');add('bad-url');
 const env={DB:db,APP_ENV:'production',PAYMENTS_MODE:'live',WHATSAPP_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test-only-token',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_WHATSAPP_FROM:'whatsapp:+15550000000',TWILIO_WHATSAPP_TEMPLATE_SID:'HX'+'c'.repeat(32)} as unknown as SharedEnv;
 let init=0;const provider:PaymentProvider={name:'zaincash',allowedOrigins:['https://checkout.test.invalid'],async createCheckout(v){init++;expect(v.amount).toBe(100000);return {reference:v.orderId,url:'https://checkout.test.invalid/pay/'+v.orderId,expires:now+900}},async verifyEvent(){throw Error('Tests supply separately verified events')}};
 const before=globalThis.fetch;let sends=0,timeout=false;globalThis.fetch=(async(url,opts)=>{sends++;expect(String(url)).toStartWith('https://api.twilio.com/');const body=new URLSearchParams(String(opts?.body));expect(body.get('To')).toBe('whatsapp:+9647700000000');expect(body.has('ContentSid')).toBe(true);expect(body.get('ContentVariables')).not.toContain('اختبار');if(timeout)throw Error('Ambiguous timeout');return Response.json({sid:'SM'+'d'.repeat(32)}, {status:201})}) as typeof fetch;
 try{
  expect(checkoutReadiness(env).enabled).toBe(false); // No merchant adapter installed in deployment.
  expect(checkoutReadiness(env,provider).enabled).toBe(true);
  await createBookingCheckout(env,'no-consent',provider);expect(init).toBe(1);
  expect(db.raw.query("SELECT COUNT(*) AS n FROM whatsapp_payment_outbox q JOIN payment_requests p ON p.id=q.payment_id WHERE p.booking_id='no-consent'").get()).toEqual({n:0});
  await createBookingCheckout(env,'booking',provider);await createBookingCheckout(env,'booking',provider);expect(init).toBe(2);
  const order=db.raw.query('SELECT * FROM payment_requests WHERE booking_id=?').get('booking') as any;
  expect(order.amount).toBe(100000);await Promise.all([dispatchPaymentWhatsApp(env),dispatchPaymentWhatsApp(env)]);expect(sends).toBe(1);expect(db.raw.query('SELECT status FROM whatsapp_payment_outbox WHERE payment_id=?').get(order.id)).toEqual({status:'accepted'});
  await expect(applyVerifiedPayment(env.DB!,{orderId:order.id,providerReference:order.provider_reference,amount:1,currency:'IQD',status:'paid'})).rejects.toThrow();
  await expect(applyVerifiedPayment(env.DB!,{orderId:order.id,providerReference:'wrong',amount:100000,currency:'IQD',status:'paid'})).rejects.toThrow();
  await applyVerifiedPayment(env.DB!,{orderId:order.id,providerReference:order.provider_reference,amount:100000,currency:'IQD',status:'paid'});await applyVerifiedPayment(env.DB!,{orderId:order.id,providerReference:order.provider_reference,amount:100000,currency:'IQD',status:'expired'});expect(db.raw.query('SELECT status FROM payment_requests WHERE id=?').get(order.id)).toEqual({status:'paid'});
  await createBookingCheckout(env,'erasure',provider);db.raw.prepare("UPDATE bookings SET phone='',customer_name='' WHERE id='erasure'").run();await dispatchPaymentWhatsApp(env);expect(sends).toBe(1);expect(db.raw.query("SELECT checkout_url FROM payment_requests WHERE booking_id='erasure'").get()).toEqual({checkout_url:null});
  await createBookingCheckout(env,'timeout',provider);timeout=true;await dispatchPaymentWhatsApp(env);await dispatchPaymentWhatsApp(env);expect(sends).toBe(2);expect(db.raw.query("SELECT q.status FROM whatsapp_payment_outbox q JOIN payment_requests p ON p.id=q.payment_id WHERE p.booking_id='timeout'").get()).toEqual({status:'unknown'});
  await createBookingCheckout(env,'late',provider);const late=db.raw.query("SELECT * FROM payment_requests WHERE booking_id='late'").get() as any;db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id='late'").run();await applyVerifiedPayment(env.DB!,{orderId:late.id,providerReference:late.provider_reference,amount:100000,currency:'IQD',status:'paid'});expect(db.raw.query('SELECT status FROM payment_requests WHERE id=?').get(late.id)).toEqual({status:'review_required'});
  await createBookingCheckout(env,'bad-url',{...provider,async createCheckout(v){return {reference:v.orderId,url:'https://evil.invalid/phishing',expires:now+900}}});expect(db.raw.query("SELECT status,checkout_url FROM payment_requests WHERE booking_id='bad-url'").get()).toEqual({status:'review_required',checkout_url:null});
 }finally{globalThis.fetch=before;db.raw.close()}
});
