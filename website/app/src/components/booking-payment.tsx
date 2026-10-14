import {useEffect,useRef,useState} from 'react';
import {type CheckoutMode,type PaymentState,type PaymentPlan,bookingPaymentPlan,paymentLabels} from '../lib/payment';
type Result={checkout:CheckoutMode;payment:PaymentState|null};
export function BookingPayment({bookingId,amount,plan,status,holdUntil,upcoming,owner,checkout,payment,refresh}:{bookingId:string;amount:number;plan?:PaymentPlan;status:string;holdUntil?:number|null;upcoming:boolean;owner:boolean;checkout:CheckoutMode;payment:PaymentState|null;refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),checkedReturn=useRef(false);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(status!=='awaiting_payment')return;const interval=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(interval)},[status]);
 const remaining=Math.max(0,(holdUntil||0)-Math.floor(now/1000)),holding=status==='awaiting_payment';
 const breakdown=plan||bookingPaymentPlan(amount,100),fee=breakdown.percent===8;
 async function request(method:string){
  const r=await fetch('/api/v2/bookings/'+bookingId+'/payment',{method,credentials:'same-origin',cache:'no-store'}),data=await r.json();
  if(!r.ok)throw Error(data.error?.message||'تعذر الاتصال بخدمة الدفع.');return data as Result;
 }
 async function check(){if(busy)return;setBusy(true);setError('');try{await request('PATCH');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{
  const p=new URLSearchParams(window.location.search);
  if(!owner&&checkout.enabled&&!checkedReturn.current&&p.get('booking')===bookingId&&p.has('paymentReturn')){
   checkedReturn.current=true;void check();
  }
 },[bookingId,owner,checkout.enabled]);
 async function pay(){
  if(busy)return;setBusy(true);setError('');try{
   const data=await request('POST');await refresh();
   if(data.payment?.url){const url=new URL(data.payment.url);if(url.origin!=='https://checkout.thewayl.com'||url.username||url.password)throw Error('رابط الدفع غير صالح.');window.location.assign(url.href)}
   else setError(data.payment?.status==='paid'?'هذا الحجز مدفوع مسبقاً.':'ماكو رابط متاح. حدّث الحالة أو تواصل مع الإدارة قبل إعادة الدفع.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 if(status==='pending'&&!payment)return <p className="mz-muted">الدفع بعد موافقة الإدارة.</p>;
 if(!payment&&(status!=='confirmed'&&!holding||!upcoming))return null;
 const test=payment?.environment==='test'||checkout.mode==='test',canPay=!owner&&checkout.enabled&&(status==='confirmed'||(holding&&remaining>0))&&upcoming&&(!payment||payment.status==='awaiting_payment');
 return <section className="mz-booking-payment" aria-label="دفع الحجز">
  <div className="mz-row"><strong>{payment?.status==='paid'?fee?test?'التثبيت مدفوع · تجريبي':'التثبيت مدفوع':test?'تم الدفع التجريبي':'تم الدفع':payment?paymentLabels[payment.status]||'جاري مراجعة الدفع':fee?'تثبيت الحجز — 8٪':'دفع الحجز'}</strong><span>{new Intl.NumberFormat('ar-IQ').format(payment?.amount??breakdown.online)} د.ع.</span></div>
  {fee&&<><div className="mz-row"><span>الباقي لصاحب المزرعة · كاش عند الوصول</span><strong>{new Intl.NumberFormat('ar-IQ').format(breakdown.cash)} د.ع.</strong></div></>}
  {test&&<p className="mz-payment-test">دفع تجريبي — لا تستخدم بطاقة حقيقية.</p>}
  {holding&&<p className="mz-hold-notice">{remaining>0?<>أكمل التثبيت خلال <b dir="ltr">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</b>.</>:<>انتهت المهلة. إذا دفعت، تواصل مع الإدارة ولا تعيد الدفع.</>}</p>}
  {!payment&&!checkout.enabled&&<p className="mz-muted">الدفع الإلكتروني قيد التفعيل.</p>}
  {payment?.status==='review_required'&&<p className="mz-muted">لا تعيد الدفع؛ تواصل مع الإدارة.</p>}
  {canPay&&<button className="mz-primary" disabled={busy} onClick={()=>void pay()}>{busy?'جاري التحقق…':fee?test?'دفع التثبيت التجريبي':'دفع التثبيت':test?'جرّب الدفع عبر ويل':'ادفع الآن'}</button>}
  {!owner&&checkout.enabled&&payment&&<button disabled={busy} onClick={()=>void check()}>تحديث الدفع</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
