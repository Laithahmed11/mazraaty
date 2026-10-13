import {useEffect,useState} from 'react';
type Setup={enabled:boolean;mode:string;whatsappEnabled:boolean;checks:{production:boolean;phone:boolean;paymentProvider:boolean;paymentActivation:boolean;whatsapp:boolean}};
export function CheckoutSettings(){
 const [setup,setSetup]=useState<Setup|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;fetch('/api/v2/owner/checkout/status',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Setup>}).then(v=>{if(!cancelled)setSetup(v)}).catch(()=>{if(!cancelled)setError(true)});return()=>{cancelled=true}},[]);
 return <section className="mz-checkout-setup" aria-label="إعداد الدفع وواتساب"><h3>الدفع عبر ويل</h3>
 <p>بعد الموافقة على الموعد، يظهر الدفع داخل حجوزاتي بالمبلغ المحفوظ. واتساب مسار إضافي للزبون الموافق عليه عند تفعيل مرسله.</p>
 {error?<p role="status">تعذر قراءة الإعدادات. حدّث الصفحة.</p>:!setup?<p role="status">جاري فحص إعدادات الخدمة…</p>:<><strong>{setup.mode==='test'?'الدفع التجريبي متاح — بدون تحصيل حقيقي':setup.enabled?'الدفع مفعّل':'قيد التفعيل — لا يُحصّل مبلغ حالياً'}</strong><ul>
 <li>{setup.checks.paymentProvider?'✓':'○'} حساب التاجر وربط مزوّد الدفع</li><li>{setup.checks.whatsapp?'✓':'○'} مرسل WhatsApp Business وقالب الرسالة المعتمد</li><li>{setup.checks.production&&setup.checks.phone?'✓':'○'} نسخة إطلاق بحسابات هاتف موثّقة</li></ul></>}
 <p className="mz-muted">قبول رسالة الإرسال من الخدمة لا يعني وصولها للهاتف. حالة الدفع تعتمد على تحقق الخادم، ولا تُؤخذ من صورة إيصال.</p></section>;
}
