import type {SharedEnv} from './shared-api.server';
type Customer={id:string;phone:string;booking_token:string};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const now=()=>Math.floor(Date.now()/1000);
const cookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function result(value:unknown,status=200,setCookie?:string){return Response.json(value,{status,headers:{'Cache-Control':'no-store',...(setCookie?{'Set-Cookie':setCookie}:{})}});}
class AuthProblem extends Error{constructor(public status:number,message:string,public providerCode?:number){super(message);}}
function error(status:number,message:string):never{throw new AuthProblem(status,message);}
export function phoneAuthReady(env:SharedEnv){return /^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')&&!!env.TWILIO_AUTH_TOKEN&&/^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||'');}
function getCookie(r:Request,name:string){return (r.headers.get('Cookie')||'').match(new RegExp('(?:^|;\\s*)'+name+'=([a-f0-9]{64})(?:;|$)'))?.[1];}
function normalize(value:unknown){if(typeof value!=='string')return error(400,'أدخل رقم هاتفك.');const s=value.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s()-]/g,'');if(!/^(?:07\d{9}|(?:\+?964|00964)7\d{9})$/.test(s))return error(400,'أدخل رقم هاتف عراقي صحيح.');return s.startsWith('07')?'+964'+s.slice(1):'+964'+s.replace(/^(?:\+?964|00964)/,'');}
async function input(r:Request){const raw=await r.text();if(raw.length>4000)return error(413,'حجم الطلب كبير.');try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value as Record<string,unknown>;}catch{return error(400,'تعذر قراءة الطلب.');}}
async function rate(env:SharedEnv,key:string,limit:number,seconds:number){const id=await hash('customer:'+key+':'+Math.floor(now()/seconds));const r=await env.DB!.prepare('INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,now()+seconds).first<{count:number}>();if(!r||r.count>limit)return error(429,'محاولات كثيرة. انتظر قليلاً قبل إعادة المحاولة.');}
async function provider(env:SharedEnv,endpoint:string,value:Record<string,string>){if(!phoneAuthReady(env))return error(503,'تسجيل الهاتف قيد التجهيز.');let r:Response;try{r=await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${endpoint}`,{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(value),signal:AbortSignal.timeout(15000)});}catch{return error(503,'تعذر الاتصال بخدمة التحقق. حاول لاحقاً.');}const data=await r.json().catch(()=>({})) as {status?:string;code?:number};if(!r.ok){if(endpoint==='VerificationCheck'&&r.status===404)return error(400,'الرمز منتهي أو غير صحيح. اطلب رمزاً جديداً.');if(r.status===429)return error(429,'انتظر قليلاً قبل طلب رمز آخر.');throw new AuthProblem(503,'تعذر إرسال أو تأكيد الرمز. نحتاج مراجعة إعدادات خدمة الرسائل.',data.code);}return data;}
async function customer(r:Request,env:SharedEnv){const token=getCookie(r,'mazraaty_customer');if(!token)return null;return env.DB!.prepare('SELECT c.id,c.phone,c.booking_token FROM customers c JOIN customer_sessions s ON s.customer_id=c.id WHERE s.id=? AND s.expires>?').bind(await hash(token),now()).first<Customer>();}
export async function withCustomerAuth(request:Request,env:SharedEnv,core:(r:Request,e:SharedEnv)=>Promise<Response>):Promise<Response>{
 try{
 const path=new URL(request.url).pathname.replace(/^\/api\/v2\/?/,''),method=request.method;
 if(!env.DB)return core(request,env);
 if(path.startsWith('account/')){
 if(method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)return error(403,'افتح الطلب من التطبيق الرسمي.');
 if(path==='account/status'&&method==='GET'){const c=phoneAuthReady(env)?await customer(request,env):null;return result({enabled:phoneAuthReady(env),authenticated:!!c,phone:c?.phone||''});}
 if(!phoneAuthReady(env))return error(503,'تسجيل الهاتف قيد التجهيز.');
 if(path==='account/start'&&method==='POST'){
 const value=await input(request),phone=normalize(value.phone),ip=request.headers.get('CF-Connecting-IP')||'unknown';
 await rate(env,'phone:'+phone,3,600);await rate(env,'send-ip:'+ip,10,3600);await rate(env,'send-all',60,86400);
 const sent=await provider(env,'Verifications',{To:phone,Channel:'sms',Locale:'ar'});if(sent.status!=='pending')return error(503,'تعذر بدء التحقق.');
 const challenge=random();await env.DB.prepare('DELETE FROM phone_challenges WHERE expires<?').bind(now()).run();await env.DB.prepare('INSERT INTO phone_challenges(id,phone,expires) VALUES(?,?,?)').bind(await hash(challenge),phone,now()+600).run();return result({sent:true,phone,retryAfter:60},200,cookie('mazraaty_challenge',challenge,600));
 }
 if(path==='account/check'&&method==='POST'){
 const challenge=getCookie(request,'mazraaty_challenge');if(!challenge)return error(401,'اطلب رمز تحقق أولاً.');const id=await hash(challenge),row=await env.DB.prepare('SELECT phone,expires FROM phone_challenges WHERE id=? AND expires>?').bind(id,now()).first<{phone:string;expires:number}>();if(!row)return error(401,'انتهت محاولة الدخول. اطلب رمزاً جديداً.');
 await rate(env,'check:'+id,5,600);const value=await input(request),code=typeof value.code==='string'?value.code.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))):'';if(!/^\d{4,10}$/.test(code))return error(400,'أدخل رمز التحقق الصحيح.');
 const approved=await provider(env,'VerificationCheck',{To:row.phone,Code:code});if(approved.status!=='approved')return error(400,'الرمز غير صحيح.');
 const consumed=await env.DB.prepare('DELETE FROM phone_challenges WHERE id=? AND expires>?').bind(id,now()).run();if(!consumed.meta.changes)return error(401,'استخدمت محاولة الدخول. اطلب رمزاً جديداً.');
 await env.DB.prepare('INSERT OR IGNORE INTO customers(id,phone,booking_token,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),row.phone,random(),new Date().toISOString()).run();
 const c=await env.DB.prepare('SELECT id,phone,booking_token FROM customers WHERE phone=?').bind(row.phone).first<Customer>();if(!c)return error(503,'تعذر حفظ الحساب.');const stableHash=await hash(c.booking_token);
 await env.DB.prepare('INSERT OR IGNORE INTO devices(hash,revoked) VALUES(?,0)').bind(stableHash).run();
 // Only migrate the current device's bookings with the verified matching phone.
 // Never claim records by phone alone: old numbers were unverified.
 const old=request.headers.get('X-Device-Token')||'';if(/^[a-f0-9]{64}$/.test(old)){await env.DB.prepare('UPDATE bookings SET device_hash=? WHERE device_hash=? AND phone=? AND EXISTS(SELECT 1 FROM devices WHERE hash=? AND revoked=0) AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.device_hash=? AND b.request_id=bookings.request_id)').bind(stableHash,await hash(old),c.phone,await hash(old),stableHash).run();}
 const session=random();await env.DB.prepare('DELETE FROM customer_sessions WHERE expires<?').bind(now()).run();await env.DB.prepare('INSERT INTO customer_sessions(id,customer_id,expires) VALUES(?,?,?)').bind(await hash(session),c.id,now()+2592000).run();return result({authenticated:true,phone:c.phone},200,cookie('mazraaty_customer',session,2592000));
 }
 if(path==='account/logout'&&method==='POST'){const token=getCookie(request,'mazraaty_customer');if(token)await env.DB.prepare('DELETE FROM customer_sessions WHERE id=?').bind(await hash(token)).run();return result({signedOut:true},200,cookie('mazraaty_customer','',0));}
 return error(404,'المسار غير موجود.');
 }
 // Existing device-only behavior remains until provider secrets are configured.
 if(phoneAuthReady(env)&&(path==='bookings'||path==='device'||/^bookings\/[a-zA-Z0-9-]+\/cancel$/.test(path))){
 const c=await customer(request,env);if(!c)return error(401,'سجل الدخول برقم هاتفك حتى تشوف حجوزاتك أو ترسل طلباً.');const headers=new Headers(request.headers);headers.set('X-Device-Token',c.booking_token);let payload:string|undefined;
 if(path==='bookings'&&method==='POST'){const value=await input(request);value.phone=c.phone;payload=JSON.stringify(value);headers.delete('Content-Length');}
 const forwarded=new Request(request,{headers,...(payload!==undefined?{body:payload}:{})});const r=await core(forwarded,env);
 if(path==='device'&&method==='DELETE'&&r.ok){await env.DB.batch([env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(c.id),env.DB.prepare('DELETE FROM phone_challenges WHERE phone=?').bind(c.phone),env.DB.prepare('DELETE FROM customers WHERE id=?').bind(c.id)]);return result({deleted:true},200,cookie('mazraaty_customer','',0));}return r;
 }
 return core(request,env);
 }catch(e){if(e instanceof AuthProblem)return result({error:{message:e.message,...(e.providerCode?{providerCode:e.providerCode}:{})},message:e.message},e.status);return result({error:{message:'تعذر تنفيذ العملية. حاول لاحقاً.'}},503);}
}
