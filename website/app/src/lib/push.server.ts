import type {SharedEnv} from './shared-api.server';
export type PushPrincipal={role:'owner'|'customer';principal:string;session:string};
export const pushHash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function pushReady(env:SharedEnv){return env.PUSH_ENABLED==='true'&&/^[a-z][a-z0-9-]{4,62}$/.test(env.FCM_PROJECT_ID||'')&&!!env.FCM_CLIENT_EMAIL&&!!env.FCM_PRIVATE_KEY;}
export async function pushEndpoint(request:Request,env:SharedEnv,identity:PushPrincipal){
 const db=env.DB!,path=new URL(request.url).pathname.split('/').pop();
 if(request.method==='GET'&&path==='status')return reply({enabled:pushReady(env)});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({message:'افتح الطلب من التطبيق الرسمي.'},403);
 if(path!=='device'||!['POST','DELETE'].includes(request.method))return reply({message:'المسار غير موجود.'},404);
 const raw=await request.text();if(raw.length>4096)return reply({message:'حجم الطلب كبير.'},413);
 let value:{token?:unknown;binding?:unknown;marketing?:unknown};try{value=JSON.parse(raw);}catch{return reply({message:'طلب غير صالح.'},400);}
 if(!value||typeof value.token!=='string'||!/^[-a-zA-Z0-9_:]{20,2048}$/.test(value.token))return reply({message:'معرّف إشعارات غير صالح.'},400);
 const id=await pushHash(value.token);
 if(request.method==='DELETE'){await db.prepare('DELETE FROM push_devices WHERE token_hash=? AND role=? AND session_id=?').bind(id,identity.role,identity.session).run();return reply({removed:true});}
 if(!pushReady(env))return reply({message:'إشعارات الهاتف قيد الربط.'},503);
 if(typeof value.binding!=='string'||!/^[-a-zA-Z0-9]{36,80}$/.test(value.binding))return reply({message:'ربط جهاز غير صالح.'},400);
 // A token cannot be reassigned while bound to a different live session.
 const existing=await db.prepare('SELECT session_id FROM push_devices WHERE token_hash=?').bind(id).first<{session_id:string}>();
 if(existing&&existing.session_id!==identity.session)return reply({message:'أوقف إشعارات الدخول السابق أولاً.'},409);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE role=? AND session_id=?').bind(identity.role,identity.session).first<{n:number}>();
 if(!existing&&(count?.n||0)>=5)return reply({message:'بلغت حد أجهزة هذه الجلسة.'},429);
 const saved=await db.prepare('INSERT INTO push_devices(token_hash,token,role,principal,session_id,binding,registered_at,marketing) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET token=excluded.token,binding=excluded.binding,marketing=excluded.marketing WHERE push_devices.session_id=excluded.session_id AND push_devices.role=excluded.role').bind(id,value.token,identity.role,identity.principal,identity.session,value.binding,Math.floor(Date.now()/1000),identity.role==='customer'&&value.marketing===true?1:0).run();
 if(!saved.meta.changes)return reply({message:'هذا الجهاز مرتبط بجلسة أخرى.'},409);
 if(value.marketing!==true)await db.prepare("UPDATE push_deliveries SET sent=1 WHERE token_hash=? AND event_id IN (SELECT id FROM push_events WHERE kind='offer')").bind(id).run();
 const session=await db.prepare(identity.role==='owner'?'SELECT expires FROM sessions WHERE id=?':'SELECT expires FROM customer_sessions WHERE id=?').bind(identity.session).first<{expires:number}>();
 return reply({registered:true,expires:session?.expires||0});
}

function base64(bytes:Uint8Array){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
const encoded=(value:unknown)=>base64(new TextEncoder().encode(JSON.stringify(value)));
let cached:{key:string;token:string;expires:number}|undefined;
async function accessToken(env:SharedEnv){
 const stamp=Math.floor(Date.now()/1000),cacheKey=await pushHash(env.FCM_CLIENT_EMAIL!+env.FCM_PRIVATE_KEY!);
 if(cached?.key===cacheKey&&cached.expires>stamp+60)return cached.token;
 const pem=env.FCM_PRIVATE_KEY!.replace(/\\n/g,'\n').replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const jwt=encoded({alg:'RS256',typ:'JWT'})+'.'+encoded({iss:env.FCM_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:stamp,exp:stamp+3600});
 const signature=base64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(jwt))));
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt+'.'+signature}),signal:AbortSignal.timeout(10000)});
 const data=await r.json() as {access_token?:string;expires_in?:number};if(!r.ok||!data.access_token)throw Error('FCM authentication unavailable');
 cached={key:cacheKey,token:data.access_token,expires:stamp+Math.min(data.expires_in||3600,3600)};return cached.token;
}
type Delivery={event_id:string;booking_id:string;kind:string;role:string;token_hash:string;token:string;binding:string;attempts:number;session_id:string;principal:string;status:string;device_hash:string;date:string;period:string;title:string;body:string};
export function bookingStart(date:string,period:string){return Date.parse(`${date}T${period==='evening'?'19':'07'}:00:00+03:00`);}
export function eventCurrent(kind:string,status:string){return kind==='offer'||(kind==='new'?status==='pending':kind==='reminder'?status==='confirmed':kind===status);}
export async function dispatchPush(env:SharedEnv){
 if(!env.DB||!pushReady(env))return;
 const db=env.DB,stamp=Math.floor(Date.now()/1000),tag=await pushHash(env.ADMIN_PASSWORD||'');
 await db.batch([db.prepare('DELETE FROM push_deliveries WHERE event_id IN (SELECT id FROM push_events WHERE created_at<?)').bind(stamp-86400),db.prepare('DELETE FROM push_events WHERE created_at<?').bind(stamp-86400)]);
 // Session expiry or credential rotation disables delivery even without logout.
 await db.prepare("DELETE FROM push_devices WHERE (role='owner' AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.id=push_devices.session_id AND s.expires>? AND s.credential_tag=?)) OR (role='customer' AND NOT EXISTS(SELECT 1 FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.id=push_devices.session_id AND s.expires>?))").bind(stamp,tag,stamp).run();
 const upcoming=await db.prepare("SELECT id,date,period FROM bookings WHERE status='confirmed' AND date BETWEEN ? AND ?").bind(new Date(Date.now()+10800000).toISOString().slice(0,10),new Date(Date.now()+10800000+86400000).toISOString().slice(0,10)).all<{id:string;date:string;period:string}>();
 for(const b of upcoming.results){const delta=bookingStart(b.date,b.period)-Date.now();if(delta>0&&delta<=3*3600000)await db.prepare("INSERT OR IGNORE INTO push_events(id,booking_id,role,kind,created_at) VALUES(?,?,'customer','reminder',?)").bind(b.id+':reminder',b.id,stamp).run();}
 // Only installations registered before the event see it; no historical replay.
 await db.prepare("INSERT OR IGNORE INTO push_deliveries(event_id,token_hash) SELECT e.id,p.token_hash FROM push_events e JOIN bookings b ON b.id=e.booking_id JOIN push_devices p ON p.role=e.role WHERE e.kind!='offer' AND e.created_at>=? AND p.registered_at<=e.created_at AND (e.role='owner' OR p.principal=b.device_hash)").bind(stamp-86400).run();
 const rows=await db.prepare('SELECT d.event_id,d.attempts,e.booking_id,e.kind,e.role,e.title,e.body,p.token_hash,p.token,p.binding,p.session_id,p.principal,b.status,b.device_hash,b.date,b.period FROM push_deliveries d JOIN push_events e ON e.id=d.event_id JOIN push_devices p ON p.token_hash=d.token_hash LEFT JOIN bookings b ON b.id=e.booking_id WHERE d.sent=0 AND d.attempts<5 AND d.next_attempt<=? AND e.created_at>=? ORDER BY e.created_at LIMIT 20').bind(stamp,stamp-86400).all<Delivery>();
 if(!rows.results.length)return;
 let bearer:string;try{bearer=await accessToken(env);}catch{console.warn('Push provider authentication failed');return;}
 for(const row of rows.results){
  const claimed=await db.prepare('UPDATE push_deliveries SET attempts=attempts+1,next_attempt=? WHERE event_id=? AND token_hash=? AND sent=0 AND next_attempt<=? AND attempts=?').bind(stamp+Math.min(3600,60*2**row.attempts),row.event_id,row.token_hash,stamp,row.attempts).run();if(!claimed.meta.changes)continue;
  if(!eventCurrent(row.kind,row.status)||(row.kind!=='offer'&&row.role==='customer'&&row.principal!==row.device_hash)||(row.kind==='reminder'&&bookingStart(row.date,row.period)<=Date.now())){await db.prepare('UPDATE push_deliveries SET sent=1 WHERE event_id=? AND token_hash=?').bind(row.event_id,row.token_hash).run();continue;}
  // Recheck immediately before send, including logout/account deletion races.
  const active=await db.prepare("SELECT token_hash FROM push_devices WHERE token_hash=? AND session_id=? AND binding=? AND (?!='offer' OR marketing=1)").bind(row.token_hash,row.session_id,row.binding,row.kind).first();if(!active)continue;
  try{
   const r=await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({message:{token:row.token,data:{binding:row.binding,eventId:row.event_id,bookingId:row.booking_id,kind:row.kind,role:row.role,title:row.title,body:row.body,expires:String(stamp+900)},android:{priority:'high',ttl:'900s'}}}),signal:AbortSignal.timeout(10000)});
   if(r.ok)await db.prepare('UPDATE push_deliveries SET sent=1 WHERE event_id=? AND token_hash=?').bind(row.event_id,row.token_hash).run();
   else{const value=await r.json().catch(()=>({})) as {error?:{details?:{errorCode?:string}[]}};if(value.error?.details?.some(d=>d.errorCode==='UNREGISTERED'))await db.prepare('DELETE FROM push_devices WHERE token_hash=?').bind(row.token_hash).run();else if(r.status===401)cached=undefined;}
  }catch{console.warn('Push delivery deferred');}
 }
}
