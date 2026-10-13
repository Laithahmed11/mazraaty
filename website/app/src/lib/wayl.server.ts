import type {PaymentProvider,VerifiedPayment} from './checkout.server';
import type {SharedEnv} from './shared-api.server';

// Contract: https://wayl.io/docs and https://api.thewayl.com/openapi.v1.json
const API='https://api.thewayl.com';
const CHECKOUT='https://checkout.thewayl.com';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const encoder=new TextEncoder();
type Link={id:string;referenceId:string;total:string;currency:string;url:string;status:string;createdAt:string;completedAt?:string|null;paymentMethod?:string|null;customParameter?:string;webhookUrl?:string};
export async function boundedBytes(request:Request|Response,max=16384){
 if(Number(request.headers.get('Content-Length')||0)>max)throw Error('Body too large');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>max){await reader.cancel();throw Error('Body too large')}parts.push(chunk.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
async function hmac(secret:string,value:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function verifySignature(secret:string,raw:Uint8Array,signature:string){
 if(!/^[a-f0-9]{64}$/i.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g)!,v=>parseInt(v,16));
 return crypto.subtle.verify('HMAC',key,bytes,new Uint8Array(raw));
}
function amount(value:unknown){if(!/^[1-9]\d*$/.test(String(value)))throw Error('Invalid amount');const n=Number(value);if(!Number.isSafeInteger(n)||n<1000)throw Error('Invalid amount');return n;}
export function waylConfigurationReady(env:SharedEnv){
 return env.PAYMENTS_PROVIDER==='wayl'&&['test','live'].includes(env.WAYL_ENV||'')&&!!env.WAYL_API_TOKEN?.trim()&&env.WAYL_API_TOKEN.trim().length>=16&&(env.WAYL_WEBHOOK_SECRET?.length||0)>=32&&['https://mazraati-preview.laithlaith500.workers.dev','https://mazraati.laithlaith500.workers.dev'].includes(env.PAYMENT_SITE_URL||'');
}
export function createWaylProvider(env:SharedEnv):PaymentProvider|null{
 if(!waylConfigurationReady(env))return null;
 // Test credentials are never promoted by a PAYMENTS_MODE toggle. Production
 // also requires the independent phone/WhatsApp gates in checkoutReadiness.
 if(env.WAYL_ENV==='live'&&(env.APP_ENV!=='production'||env.WAYL_LIVE_APPROVED!=='true'))return null;
 const mode=env.WAYL_ENV!,token=env.WAYL_API_TOKEN!.trim(),secret=env.WAYL_WEBHOOK_SECRET!,site=env.PAYMENT_SITE_URL!;
 const reference=(id:string)=>{if(!UUID.test(id))throw Error('Invalid order');return 'mazraaty-'+mode+'-'+id};
 const webhook=(id:string)=>site+'/api/v2/payments/webhook?order='+id;
 const proof=async(ref:string,total:number)=>hmac(secret,'metadata:'+ref+':'+total+':IQD');
 async function api(path:string,body?:unknown):Promise<Link|null>{
  const response=await fetch(API+path,{method:body?'POST':'GET',redirect:'error',headers:{'X-WAYL-AUTHENTICATION':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!body&&response.status===404)return null;
  if(!response.ok)throw Error('Wayl request failed');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(response,65536)));
  if(!data?.data||typeof data.data!=='object'||Array.isArray(data.data))throw Error('Invalid Wayl response');return data.data;
 }
 async function validate(link:Link|null,id:string,total?:number){
  if(!link||typeof link.url!=='string'||typeof link.id!=='string'||!link.id||link.id.length>180)throw Error('Invalid Wayl link');
  const ref=reference(id),n=amount(link.total),url=new URL(link.url);
  if(link.referenceId!==ref||link.currency!=='IQD'||(total!==undefined&&n!==total)||url.origin!==CHECKOUT||url.username||url.password||!(url.pathname.startsWith('/pay/')||url.pathname==='/payment/action'))throw Error('Wayl link mismatch');
  if(link.webhookUrl!==webhook(id)||link.customParameter!==await proof(ref,n))throw Error('Wayl metadata mismatch');
  return n;
 }
 return {name:'wayl',environment:mode as 'test'|'live',allowedOrigins:[CHECKOUT],
  async createCheckout(value){
   const total=amount(value.amount);if(value.currency!=='IQD')throw Error('Invalid currency');
   const ref=reference(value.orderId),path='/api/v1/links/'+encodeURIComponent(ref);
   let link=await api(path);
   if(!link){try{link=await api('/api/v1/links',{env:mode,referenceId:ref,total,currency:'IQD',lineItem:[{label:'Mazraaty farm reservation',amount:total,type:'increase'}],webhookUrl:webhook(value.orderId),webhookSecret:await hmac(secret,'webhook:'+ref),redirectionUrl:site+'/customer',customParameter:await proof(ref,total),linkExpiresIn:'1h'})}catch{link=await api(path)}}
   await validate(link,value.orderId,total);
   // Never send an already paid/cancelled/recovered expired link to a customer.
   if(link!.status!=='Created')throw Error('Wayl link not open');
   const created=Date.parse(link!.createdAt),expires=Math.floor(created/1000)+3600,now=Math.floor(Date.now()/1000);
   if(!Number.isFinite(created)||expires<=now||expires>now+3660)throw Error('Wayl link expired');
   return {reference:link!.id,url:link!.url,expires};
  },
  async verifyEvent(request):Promise<VerifiedPayment|null>{
   const id=new URL(request.url).searchParams.get('order')||'',ref=reference(id),raw=await boundedBytes(request);
   if(!await verifySignature(await hmac(secret,'webhook:'+ref),raw,request.headers.get('x-wayl-signature-256')||''))throw Error('Invalid Wayl signature');
   const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(payload?.referenceId!==ref)throw Error('Invalid Wayl reference');
   // Signed event is only a wake-up signal. Independently query the merchant API.
   const link=await api('/api/v1/links/'+encodeURIComponent(ref)),total=await validate(link,id);
   if(payload.id!==link!.id||amount(payload.total)!==total)throw Error('Wayl event mismatch');
   if(['Complete','Delivered'].includes(link!.status)&&link!.paymentMethod&&link!.completedAt&&Number.isFinite(Date.parse(link!.completedAt)))return {orderId:id,providerReference:link!.id,amount:total,currency:'IQD',status:'paid'};
   if(['Cancelled','Rejected'].includes(link!.status))return {orderId:id,providerReference:link!.id,amount:total,currency:'IQD',status:'expired'};
   if(['Created','Pending','Processing'].includes(link!.status))return null;
   throw Error('Wayl status requires operator review');
  }
 };
}
