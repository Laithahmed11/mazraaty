import {useEffect,useRef,useState} from 'react';
import {type CheckoutMode,type PaymentState,paymentLabels} from '../lib/payment';
type Result={checkout:CheckoutMode;payment:PaymentState|null};
export function BookingPayment({bookingId,amount,status,upcoming,owner,checkout,payment,refresh}:{bookingId:string;amount:number;status:string;upcoming:boolean;owner:boolean;checkout:CheckoutMode;payment:PaymentState|null;refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),checkedReturn=useRef(false);
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
 if(status==='pending'&&!payment)return <p className="mz-muted">الدفع يظهر بعد موافقة الإدارة على الموعد.</p>;
 if(!payment&&(status!=='confirmed'||!upcoming))return null;
 const test=payment?.environment==='test'||checkout.mode==='test',canPay=!owner&&checkout.enabled&&status==='confirmed'&&upcoming&&(!payment||payment.status==='awaiting_payment');
 return <section className="mz-booking-payment" aria-label="دفع الحجز">
  <div className="mz-row"><strong>{payment?payment.status==='paid'&&test?'تم الدفع التجريبي':paymentLabels[payment.status]||'جاري مراجعة الدفع':'دفع الحجز'}</strong><span>{new Intl.NumberFormat('ar-IQ').format(payment?.amount??amount)} د.ع.</span></div>
  {test&&<p className="mz-payment-test">تجربة ويل فقط — لا يمثل هذا إيصال دفع حقيقي. لا تستخدم بيانات بطاقة حقيقية.</p>}
  {!payment&&!checkout.enabled&&<p className="mz-muted">الدفع الإلكتروني قيد التفعيل؛ تأكيد الحجز لا يخصم مبلغاً.</p>}
  {payment?.status==='review_required'&&<p className="mz-muted">لا تدفع مرة ثانية. تواصل مع الإدارة لمراجعة العملية.</p>}
  {canPay&&<button className="mz-primary" disabled={busy} onClick={()=>void pay()}>{busy?'جاري التحقق…':test?'جرّب الدفع عبر ويل':'ادفع الآن'}</button>}
  {!owner&&checkout.enabled&&payment&&<button disabled={busy} onClick={()=>void check()}>تحديث حالة الدفع</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
