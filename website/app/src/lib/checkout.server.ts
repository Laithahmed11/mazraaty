import type {D1Database} from '@cloudflare/workers-types';
import type {SharedEnv} from './shared-api.server';
import {phoneAuthReady} from './customer-auth.server';
import {bookingEnd} from './booking-time';
import {createWaylProvider} from './wayl.server';
export type VerifiedPayment={orderId:string;providerReference:string;amount:number;currency:'IQD';status:'paid'|'expired'|'review_required'};
/** Merchant-specific adapters must authenticate events and verify status server-to-server. */
export interface PaymentProvider {
 name:'qi'|'zaincash'|'wayl';
 environment?:'test'|'live';
 allowedOrigins:readonly string[];
 createCheckout(value:{orderId:string;bookingId:string;amount:number;currency:'IQD'}):Promise<{reference:string;url:string;expires:number}>;
 verifyEvent(request:Request):Promise<VerifiedPayment|null>;
 readPayment?(orderId:string):Promise<VerifiedPayment|null>;
}
export const deploymentPaymentProvider=(env:SharedEnv)=>createWaylProvider(env);
const seconds=()=>Math.floor(Date.now()/1000);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export function whatsappReady(env:SharedEnv){return env.APP_ENV==='production'&&env.WHATSAPP_ENABLED==='true'&&phoneAuthReady(env)&&/^whatsapp:\+[1-9]\d{7,14}$/.test(env.TWILIO_WHATSAPP_FROM||'')&&/^HX[a-f0-9]{32}$/i.test(env.TWILIO_WHATSAPP_TEMPLATE_SID||'');}
export function checkoutReadiness(env:SharedEnv,provider:PaymentProvider|null=deploymentPaymentProvider(env)){
 const checks={production:env.APP_ENV==='production',phone:phoneAuthReady(env),paymentProvider:!!provider,paymentActivation:env.PAYMENTS_MODE==='live'&&provider?.environment!=='test',whatsapp:whatsappReady(env)};
 const sandbox=env.APP_ENV==='preview'&&env.PAYMENTS_MODE==='test'&&provider?.environment==='test'&&env.PAYMENT_SITE_URL==='https://mazraati-preview.laithlaith500.workers.dev'&&env.DEMO_AUTH_HOST==='mazraati-preview.laithlaith500.workers.dev'&&/^\+9647\d{9}$/.test(env.DEMO_AUTH_PHONE||'')&&/^\d{6}$/.test(env.DEMO_AUTH_CODE||'');
 const enabled=!!sandbox||(checks.production&&checks.phone&&checks.paymentProvider&&checks.paymentActivation);
 return {enabled,mode:sandbox?'test':enabled?'live':'disabled',whatsappEnabled:enabled&&checks.whatsapp,checks};
}
export function publicCheckout(env:SharedEnv){const r=checkoutReadiness(env);return {enabled:r.enabled,mode:r.mode};}
export async function paymentSummary(env:SharedEnv,bookingId:string){
 const row=await env.DB!.prepare('SELECT p.status,p.amount,p.environment,p.expires,p.checkout_url,b.status AS booking_status,b.date,b.period FROM payment_requests p JOIN bookings b ON b.id=p.booking_id WHERE booking_id=?').bind(bookingId).first<{status:string;amount:number;environment:string;expires:number|null;checkout_url:string|null;booking_status:string;date:string;period:string}>();
 if(!row)return null;
 const status=row.status==='awaiting_payment'&&(row.expires||0)<=seconds()?'expired':row.status;
 const enabled=checkoutReadiness(env).enabled;
 const url=enabled&&row.environment===(env.WAYL_ENV||'live')&&row.booking_status==='confirmed'&&bookingEnd(row.date,row.period)>Date.now()&&status==='awaiting_payment'?row.checkout_url:null;
 return {status,amount:row.amount,environment:row.environment,expires:row.expires,url};
}
export async function reconcilePayment(env:SharedEnv,bookingId:string,provider:PaymentProvider|null=deploymentPaymentProvider(env)){
 if(!checkoutReadiness(env,provider).enabled||!provider?.readPayment)throw Error('الدفع قيد التفعيل.');
 const order=await env.DB!.prepare('SELECT id,provider,environment,status FROM payment_requests WHERE booking_id=?').bind(bookingId).first<{id:string;provider:string;environment:string;status:string}>();
 if(order&&order.provider===provider.name&&order.environment===(provider.environment||'live')&&order.status!=='review_required'){
  const event=await provider.readPayment(order.id);if(event)await applyVerifiedPayment(env.DB!,event);
 }
}
type CheckoutBooking={id:string;device_hash:string;customer_name:string;phone:string;whatsapp_opt_in:number;status:string;total:number;date:string;period:string;farm_name:string};
export async function createBookingCheckout(env:SharedEnv,bookingId:string,provider:PaymentProvider|null=deploymentPaymentProvider(env)){
 if(!checkoutReadiness(env,provider).enabled||!provider)throw Error('الدفع والواتساب التلقائي قيد التفعيل.');
 const db=env.DB!,b=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(bookingId).first<CheckoutBooking>();
 if(!b||b.status!=='confirmed'||!b.customer_name||bookingEnd(b.date,b.period)<=Date.now())throw Error('الدفع متاح لحجز مؤكد قادم فقط.');
 const account=await db.prepare('SELECT booking_token FROM customers WHERE phone=?').bind(b.phone).first<{booking_token:string}>();
 if(!account||await hash(account.booking_token)!==b.device_hash)throw Error('يلزم حساب هاتف موثّق لهذا الحجز.');
 const id=crypto.randomUUID(),insert=await db.prepare("INSERT OR IGNORE INTO payment_requests(id,booking_id,amount,provider,environment,status,created_at) VALUES(?,?,?,?,?,'creating',?)").bind(id,b.id,b.total,provider.name,provider.environment||'live',seconds()).run();
 if(!insert.meta.changes)return db.prepare('SELECT id,status FROM payment_requests WHERE booking_id=?').bind(b.id).first();
 try{
  const checkout=await provider.createCheckout({orderId:id,bookingId:b.id,amount:b.total,currency:'IQD'}),url=new URL(checkout.url);
  if(url.protocol!=='https:'||url.username||url.password||!provider.allowedOrigins.includes(url.origin)||!checkout.reference||checkout.reference.length>180||!Number.isSafeInteger(checkout.expires)||checkout.expires<=seconds()||checkout.expires>seconds()+86400)throw Error('Invalid provider response');
  await db.batch([
   db.prepare("UPDATE payment_requests SET provider_reference=?,checkout_url=?,expires=?,status='awaiting_payment' WHERE id=? AND status='creating' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed' AND phone<>'')").bind(checkout.reference,checkout.url,checkout.expires,id,b.id),
   db.prepare("INSERT OR IGNORE INTO whatsapp_payment_outbox(payment_id,updated_at) SELECT p.id,? FROM payment_requests p JOIN bookings b ON b.id=p.booking_id WHERE p.id=? AND p.status='awaiting_payment' AND b.whatsapp_opt_in=1 AND ?=1").bind(seconds(),id,whatsappReady(env)?1:0)
  ]);
 }catch{
  // An ambiguous init may have created a provider order: never create a second blindly.
  await db.prepare("UPDATE payment_requests SET status='review_required' WHERE id=? AND status='creating'").bind(id).run();
 }
 return db.prepare('SELECT id,status FROM payment_requests WHERE booking_id=?').bind(b.id).first();
}
export async function applyVerifiedPayment(db:D1Database,event:VerifiedPayment){
 if(!event||event.currency!=='IQD'||!Number.isSafeInteger(event.amount)||!['paid','expired','review_required'].includes(event.status))throw Error('Invalid payment event');
 const order=await db.prepare('SELECT provider_reference,amount,status,booking_id FROM payment_requests WHERE id=?').bind(event.orderId).first<{provider_reference:string;amount:number;status:string;booking_id:string}>();
 if(!order||order.provider_reference!==event.providerReference||order.amount!==event.amount)throw Error('Payment mismatch');
 if(order.status==='review_required'||(order.status==='paid'&&event.status!=='review_required'))return;
 const booking=await db.prepare('SELECT status FROM bookings WHERE id=?').bind(order.booking_id).first<{status:string}>();
 const status=event.status==='review_required'?'review_required':event.status==='paid'?(booking?.status==='confirmed'?'paid':'review_required'):'expired';
 await db.batch([
  db.prepare('UPDATE payment_requests SET status=?,checkout_url=NULL WHERE id=? AND status IN (\'awaiting_payment\',\'expired\',\'cancelled\',\'paid\')').bind(status,event.orderId),
  db.prepare("UPDATE whatsapp_payment_outbox SET status='cancelled',updated_at=? WHERE payment_id=? AND status='queued'").bind(seconds(),event.orderId)
 ]);
}
export async function dispatchPaymentWhatsApp(env:SharedEnv){
 if(!whatsappReady(env)||!env.DB)return;
 const db=env.DB,now=seconds();
 await db.prepare("UPDATE payment_requests SET status='expired',checkout_url=NULL WHERE status='awaiting_payment' AND expires<=?").bind(now).run();
 await db.prepare("UPDATE whatsapp_payment_outbox SET status='unknown',updated_at=? WHERE status='sending' AND updated_at<?").bind(now,now-300).run();
 const rows=await db.prepare("SELECT q.payment_id,p.checkout_url,p.amount,p.expires,b.id,b.phone,b.farm_name,b.date,b.period FROM whatsapp_payment_outbox q JOIN payment_requests p ON p.id=q.payment_id JOIN bookings b ON b.id=p.booking_id WHERE q.status='queued' AND p.status='awaiting_payment' AND p.expires>? AND b.status='confirmed' AND b.whatsapp_opt_in=1 AND b.phone<>'' LIMIT 10").bind(now+60).all<{payment_id:string;checkout_url:string;amount:number;expires:number;id:string;phone:string;farm_name:string;date:string;period:string}>();
 for(const r of rows.results){
  const claim=await db.prepare("UPDATE whatsapp_payment_outbox SET status='sending',updated_at=? WHERE payment_id=? AND status='queued'").bind(now,r.payment_id).run();if(!claim.meta.changes)continue;
  // Re-check deletion/cancellation immediately before dispatch. No phone is copied into the outbox.
  const current=await db.prepare("SELECT b.phone FROM bookings b JOIN payment_requests p ON p.booking_id=b.id WHERE p.id=? AND b.status='confirmed' AND b.whatsapp_opt_in=1 AND b.phone<>'' AND p.status='awaiting_payment' AND p.expires>?").bind(r.payment_id,seconds()+60).first<{phone:string}>();
  if(!current){await db.prepare("UPDATE whatsapp_payment_outbox SET status='cancelled' WHERE payment_id=?").bind(r.payment_id).run();continue;}
  try{
   const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',redirect:'error',headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({From:env.TWILIO_WHATSAPP_FROM!,To:'whatsapp:'+current.phone,ContentSid:env.TWILIO_WHATSAPP_TEMPLATE_SID!,ContentVariables:JSON.stringify({'1':r.id,'2':String(r.amount),'3':r.checkout_url}),ValidityPeriod:String(Math.max(1,Math.min(3600,r.expires-seconds()-30)))}),signal:AbortSignal.timeout(15000)});
   const data=await response.json().catch(()=>({})) as {sid?:string};
   const accepted=response.ok&&/^SM[a-f0-9]{32}$/i.test(data.sid||'');
   await db.prepare('UPDATE whatsapp_payment_outbox SET status=?,provider_sid=?,updated_at=? WHERE payment_id=? AND status=\'sending\'').bind(accepted?'accepted':'failed',accepted?data.sid:null,seconds(),r.payment_id).run();
  }catch{await db.prepare("UPDATE whatsapp_payment_outbox SET status='unknown',updated_at=? WHERE payment_id=? AND status='sending'").bind(seconds(),r.payment_id).run();}
 }
}
export async function dispatchCheckout(env:SharedEnv){
 if(!checkoutReadiness(env).whatsappEnabled||!env.DB)return;
 const bookings=await env.DB.prepare("SELECT id FROM bookings WHERE status='confirmed' AND whatsapp_opt_in=1 AND phone<>'' AND NOT EXISTS(SELECT 1 FROM payment_requests WHERE booking_id=bookings.id) LIMIT 10").all<{id:string}>();
 for(const b of bookings.results){try{await createBookingCheckout(env,b.id)}catch{/* Not an eligible verified booking. */}}
 await dispatchPaymentWhatsApp(env);
}
