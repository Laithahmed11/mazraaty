import {test,expect} from 'bun:test';
import {createWaylProvider,boundedBytes} from '../src/lib/wayl.server';
import {checkoutReadiness,dispatchCheckout} from '../src/lib/checkout.server';
import type {SharedEnv} from '../src/lib/shared-api.server';
const id='12345678-1234-4234-8234-123456789abc';
const env:SharedEnv={APP_ENV:'preview',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'wayl',WAYL_ENV:'test',WAYL_API_TOKEN:'fake-private-test-merchant-token',WAYL_WEBHOOK_SECRET:'fake-webhook-secret-for-unit-tests-only',PAYMENT_SITE_URL:'https://mazraati-preview.laithlaith500.workers.dev'};
const mac=async(secret:string,raw:string)=>{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(raw))),b=>b.toString(16).padStart(2,'0')).join('')};
test('Wayl account configuration stays disabled in preview and sandbox cannot activate charges',async()=>{
 expect(createWaylProvider({...env,WAYL_API_TOKEN:''})).toBeNull();
 expect(createWaylProvider({...env,WAYL_ENV:'live'})).toBeNull();
 expect(createWaylProvider({...env,PAYMENT_SITE_URL:'https://attacker.invalid'})).toBeNull();
 expect(checkoutReadiness(env).checks.paymentProvider).toBe(true);
 expect(checkoutReadiness(env).enabled).toBe(false);
 const real={...env,APP_ENV:'production',PAYMENTS_MODE:'live',WHATSAPP_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'unit-test',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_WHATSAPP_FROM:'whatsapp:+15550000000',TWILIO_WHATSAPP_TEMPLATE_SID:'HX'+'c'.repeat(32)};
 expect(checkoutReadiness(real).checks.paymentActivation).toBe(false);
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('External call forbidden')}) as typeof fetch;
 try{await dispatchCheckout(real);expect(calls).toBe(0)}finally{globalThis.fetch=previous}
 await expect(boundedBytes(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(16385)}))).rejects.toThrow('Body too large');
});
test('Wayl isolates Safi references, verifies exact HMAC and independently checks amount, metadata and status',async()=>{
 const previous=globalThis.fetch,provider=createWaylProvider(env)!;
 let link:any,posts=0,gets=0,ambiguous=false;
 globalThis.fetch=(async(input:any,init:any)=>{
  expect(String(input).startsWith('https://api.thewayl.com/api/v1/links')).toBe(true);
  expect(init.headers['X-WAYL-AUTHENTICATION']).toBe(env.WAYL_API_TOKEN);expect(init.redirect).toBe('error');
  if(init.method==='POST'){
   posts++;const payload=JSON.parse(init.body);expect(payload.env).toBe('test');expect(payload.referenceId).toBe('mazraaty-test-'+id);expect(payload.total).toBe(100000);expect(payload.lineItem[0].amount).toBe(100000);expect(payload.linkExpiresIn).toBe('1h');expect(payload.webhookSecret).not.toBe(env.WAYL_API_TOKEN);
   link={...payload,id:'wayl-test-link',total:'100000',status:'Created',url:'https://checkout.thewayl.com/pay/UNITTEST',createdAt:new Date().toISOString()};
   if(ambiguous)throw Error('Response lost after creation');return Response.json({data:link},{status:201});
  }
  gets++;return link?Response.json({data:link}):new Response(null,{status:404});
 }) as typeof fetch;
 try{
  const value={orderId:id,bookingId:'booking',amount:100000,currency:'IQD' as const};
  const result=await provider.createCheckout(value);expect(result.reference).toBe(link.id);expect(result.expires).toBeGreaterThan(Math.floor(Date.now()/1000));
  await provider.createCheckout(value);expect(posts).toBe(1);
  const eventRequest=async(payload:any,signature?:string)=>{const raw=JSON.stringify(payload),sig=signature??await mac(link.webhookSecret,raw);return new Request(link.webhookUrl,{method:'POST',headers:{'x-wayl-signature-256':sig},body:raw})};
  const event={referenceId:link.referenceId,id:link.id,total:100000,paymentStatus:'paid'};
  expect(await provider.verifyEvent(await eventRequest(event))).toBeNull();
  const before=gets;await expect(provider.verifyEvent(await eventRequest(event,'0'.repeat(64)))).rejects.toThrow('Invalid Wayl signature');expect(gets).toBe(before);
  const signed=await eventRequest(event),raw=await signed.text();await expect(provider.verifyEvent(new Request(signed.url,{method:'POST',headers:signed.headers,body:raw+' '}))).rejects.toThrow('Invalid Wayl signature');
  link.status='Complete';link.paymentMethod='Card';link.completedAt=new Date().toISOString();
  expect(await provider.verifyEvent(await eventRequest(event))).toEqual({orderId:id,providerReference:link.id,amount:100000,currency:'IQD',status:'paid'});
  await expect(provider.verifyEvent(await eventRequest({...event,total:99999}))).rejects.toThrow('Wayl event mismatch');
  const proof=link.customParameter;link.customParameter='wrong';await expect(provider.verifyEvent(await eventRequest(event))).rejects.toThrow('Wayl metadata mismatch');link.customParameter=proof;
  await expect(provider.verifyEvent(await eventRequest({...event,referenceId:'wix-live-'+id}))).rejects.toThrow('Invalid Wayl reference');
  link.status='Cancelled';expect((await provider.verifyEvent(await eventRequest(event)))!.status).toBe('expired');
  link.status='Returned';await expect(provider.verifyEvent(await eventRequest(event))).rejects.toThrow('operator review');
  link.status='Created';const url=link.url;link.url='https://attacker.invalid/pay/UNITTEST';await expect(provider.createCheckout(value)).rejects.toThrow('Wayl link mismatch');link.url=url;
  link.createdAt=new Date(Date.now()-7200000).toISOString();await expect(provider.createCheckout(value)).rejects.toThrow('Wayl link expired');
  await expect(provider.createCheckout({...value,amount:999})).rejects.toThrow('Invalid amount');
  link=undefined;ambiguous=true;await provider.createCheckout(value);expect(posts).toBe(2);await provider.createCheckout(value);expect(posts).toBe(2);
 }finally{globalThis.fetch=previous}
});
