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
  await expect(createBookingCheckout(env,'no-consent',provider)).rejects.toThrow();expect(init).toBe(0);
  await createBookingCheckout(env,'booking',provider);await createBookingCheckout(env,'booking',provider);expect(init).toBe(1);
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
