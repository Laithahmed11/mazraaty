import {useEffect,useRef,useState} from 'react';
type Native={postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null};
const bridge=()=>typeof window==='undefined'?undefined:(window as unknown as {MazraatyPush?:Native}).MazraatyPush;
export function clearNativePush(){bridge()?.postMessage(JSON.stringify({action:'clear'}));}
export function PushSettings({owner,authenticated}:{owner:boolean;authenticated:boolean}){
 const [available,setAvailable]=useState(false),[enabled,setEnabled]=useState(false),[state,setState]=useState(''),[marketing,setMarketing]=useState(false),[provider,setProvider]=useState(false);
 const current=useRef<{token:string;binding:string}|null>(null),generation=useRef(0);
 const path=owner?'owner/push/':'push/';
 async function call(suffix:string,method='GET',body?:unknown){const r=await fetch('/api/v2/'+path+suffix,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.message||'تعذر ربط الإشعارات.');return data;}
 async function register(device:{token:string;binding:string},offers:boolean){const data=await call('device','POST',{...device,marketing:offers});bridge()?.postMessage(JSON.stringify({action:'registered',...device,expires:data.expires,marketing:offers}));setEnabled(true);setState('إشعارات الحجز مفعّلة على هذا الهاتف.');}
 useEffect(()=>{
  const native=bridge(),version=++generation.current;setAvailable(!!native);if(!native)return;
  if(!authenticated){native.postMessage(JSON.stringify({action:'clear'}));setEnabled(false);current.current=null;return;}
  void call('status').then(data=>{if(version!==generation.current)return;setProvider(data.enabled);if(data.enabled)native.postMessage(JSON.stringify({action:'status'}));else setState('إشعارات الهاتف قيد الربط.');}).catch(e=>setState(e.message));
  native.onmessage=event=>{if(version!==generation.current)return;try{const data=JSON.parse(event.data);if(data.status==='ready'){
   current.current={token:data.token,binding:data.binding};setMarketing(data.marketing===true);void register(current.current,data.marketing===true).catch(e=>setState(e.message));
  }else if(data.status==='denied'){setEnabled(false);setState('الإشعارات متوقفة من إعدادات الهاتف.');}
  else if(data.status==='unconfigured')setState('ربط Firebase لهذا التطبيق لم يكتمل بعد.');
  else if(data.status==='error')setState('تعذر ربط الهاتف؛ حاول مجدداً.');}catch{setState('تعذر ربط الهاتف.');}};
  const resume=()=>{if(document.visibilityState==='visible')native.postMessage(JSON.stringify({action:'status'}));};document.addEventListener('visibilitychange',resume);
  return()=>{generation.current++;native.onmessage=null;document.removeEventListener('visibilitychange',resume);};
 },[owner,authenticated]);
 if(!available||!authenticated)return null;
 return <section className="mz-account-strip" aria-label="إشعارات الهاتف"><div><strong>إشعارات الهاتف</strong><small role="status">{state||'تنبيهك بتحديثات الحجوزات.'}</small>{enabled&&!owner&&<label><input type="checkbox" checked={marketing} onChange={e=>{const offers=e.target.checked;setMarketing(offers);if(current.current)void register(current.current,offers).catch(error=>{setMarketing(!offers);setState(error.message);});}}/> أوافق على استقبال إشعارات العروض</label>}</div>{enabled?<button className="mz-secondary" onClick={()=>{const device=current.current;if(!device)return;void call('device','DELETE',device).then(()=>{clearNativePush();current.current=null;setEnabled(false);setMarketing(false);setState('تم إيقاف الإشعارات لهذا الهاتف.');}).catch(e=>setState(e.message));}}>إيقاف الإشعارات</button>:<button className="mz-secondary" disabled={!provider} onClick={()=>bridge()?.postMessage(JSON.stringify({action:'enable'}))}>تفعيل الإشعارات</button>}</section>;
}
