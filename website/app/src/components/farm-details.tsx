import type {FarmDetails,FarmOffer} from '../lib/farm-details';
export function FarmDetailsView({details}:{details:FarmDetails}){
 return <section className="mz-extra-details" aria-label="تفاصيل المكان">
  {details.reviewed&&<span className="mz-tag">✓ راجعتها الإدارة</span>}
  <div className="mz-detail-facts">
   {details.poolDepth!==undefined&&<div><small>عمق المسبح</small><strong>{details.poolDepth} متر</strong></div>}
   {details.rooms!==undefined&&<div><small>غرف النوم</small><strong>{details.rooms}</strong></div>}
   {details.bathrooms!==undefined&&<div><small>الحمامات</small><strong>{details.bathrooms}</strong></div>}
  </div>
  {details.latitude!==undefined&&details.longitude!==undefined&&<a className="mz-secondary" rel="noopener noreferrer" target="_blank" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(details.latitude+','+details.longitude)}>فتح موقع المزرعة على الخريطة ←</a>}
  {details.rules&&<><h3>قواعد المكان</h3><p className="mz-description">{details.rules}</p></>}
  {details.cancellationPolicy&&<><h3>سياسة إلغاء المزرعة</h3><p className="mz-description">{details.cancellationPolicy}</p></>}
 </section>;
}
export function FarmDetailsEditor({details,onChange}:{details:FarmDetails;onChange:(value:FarmDetails)=>void}){
 const changeNumber=(key:keyof FarmDetails,value:string)=>onChange({...details,[key]:value===''?undefined:Number(value)});
 return <fieldset className="mz-extra-editor"><legend>تفاصيل المكان</legend><div className="mz-pair">
  <label>عمق المسبح / متر<input type="number" min="0" max="10" step="0.1" value={details.poolDepth??''} onChange={e=>changeNumber('poolDepth',e.target.value)}/></label>
  <label>غرف النوم<input type="number" min="0" max="100" value={details.rooms??''} onChange={e=>changeNumber('rooms',e.target.value)}/></label>
  <label>الحمامات<input type="number" min="0" max="100" value={details.bathrooms??''} onChange={e=>changeNumber('bathrooms',e.target.value)}/></label>
  <label>خط العرض للموقع<input type="number" dir="ltr" min="-90" max="90" step="any" value={details.latitude??''} onChange={e=>changeNumber('latitude',e.target.value)}/></label>
  <label>خط الطول للموقع<input type="number" dir="ltr" min="-180" max="180" step="any" value={details.longitude??''} onChange={e=>changeNumber('longitude',e.target.value)}/></label>
 </div><p className="mz-muted">الموقع اختياري؛ أدخل الإحداثيتين معاً بعد التأكد منهما على الخريطة.</p>
 <label>قواعد المكان<textarea maxLength={1500} value={details.rules||''} onChange={e=>onChange({...details,rules:e.target.value})}/></label>
 <label>سياسة الإلغاء الخاصة بالمزرعة<textarea maxLength={1500} value={details.cancellationPolicy||''} onChange={e=>onChange({...details,cancellationPolicy:e.target.value})}/></label>
 <label className="mz-check"><input type="checkbox" checked={details.reviewed||false} onChange={e=>onChange({...details,reviewed:e.target.checked})}/>راجعت الصور والموقع والخدمات مع المالك</label><p className="mz-muted">فعّل شارة المراجعة بعد التحقق الفعلي؛ لا تعني ضماناً أو زيارة ميدانية.</p></fieldset>;
}
export function FarmOfferEditor({offer,onChange,today}:{offer:FarmOffer|null;onChange:(value:FarmOffer|null)=>void;today:string}){
 return <fieldset className="mz-extra-editor"><legend>عرض على سعر الحجز</legend>
 <label className="mz-check"><input type="checkbox" checked={!!offer} onChange={e=>onChange(e.target.checked?{from:today,to:today}:null)}/>تفعيل عرض بتاريخ محدد</label>
 {offer&&<><div className="mz-pair"><label>أول يوم حجز يشمله العرض<input type="date" required value={offer.from} onChange={e=>onChange({...offer,from:e.target.value})}/></label><label>آخر يوم حجز يشمله العرض<input type="date" required min={offer.from} value={offer.to} onChange={e=>onChange({...offer,to:e.target.value})}/></label>
 <label>سعر الصباحي بالعرض / دينار<input type="number" min="1" max="100000000" value={offer.morning??''} onChange={e=>onChange({...offer,morning:e.target.value===''?undefined:Number(e.target.value)})}/></label>
 <label>سعر المسائي بالعرض / دينار<input type="number" min="1" max="100000000" value={offer.evening??''} onChange={e=>onChange({...offer,evening:e.target.value===''?undefined:Number(e.target.value)})}/></label></div><p className="mz-muted">حدد سعراً أقل من الأصلي لفترة واحدة على الأقل. العرض حسب تاريخ الطلعة، والحجوزات السابقة تحتفظ بسعرها.</p></>}
 </fieldset>;
}
