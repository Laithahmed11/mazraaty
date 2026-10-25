import {ArrowLeft, CalendarDays, Compass, Heart, MapPin, Sun, Wallet} from "lucide-react";

type NavigationProps = {tab: string; onChange: (tab: string) => void};

export function CustomerNavigation({tab, onChange}: NavigationProps) {
  return <nav className="mz-customer-nav" aria-label="أقسام التطبيق">
    {[
      {key: "farms", label: "استكشف", Icon: Compass},
      {key: "favorites", label: "المفضلة", Icon: Heart},
      {key: "bookings", label: "حجوزاتي", Icon: CalendarDays},
    ].map(({key, label, Icon}) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => onChange(key)}>
      <Icon size={21} strokeWidth={1.6} aria-hidden="true"/><span>{label}</span>
    </button>)}
  </nav>;
}

export function CustomerHero({farm, onExplore}: {
  farm?: {name: string; region: string; images: string[]};
  onExplore: () => void;
}) {
  return <>
    <section className="mz-discover" aria-labelledby="mz-discover-title">
      <div className="mz-discover-copy">
        <span className="mz-eyebrow">وقتك الحلو يبدأ هنا</span>
        <h1 id="mz-discover-title">للطلعة<br/><em>طعم آخر.</em></h1>
        <p>مكان يجمعكم. ويوم يبقى بالبال.</p>
        <button className="mz-primary" onClick={onExplore}>اختار مزرعتك <ArrowLeft size={18} aria-hidden="true"/></button>
      </div>
      <div className="mz-discover-image">
        <img src={farm?.images[0] || "/assets/standalone-farm.svg"} alt={farm ? farm.name : "رسم توضيحي لمزرعة سياحية"} fetchPriority="high"/>
        <span className="mz-image-note"><MapPin size={14} aria-hidden="true"/>{farm ? farm.region + " · " + farm.name : "مزارع العراق · رسم توضيحي"}</span>
      </div>
    </section>
    <div className="mz-discover-facts" aria-label="عن الحجز">
      <span><MapPin size={17} aria-hidden="true"/>مزارع واستراحات</span>
      <span><Sun size={17} aria-hidden="true"/>صباحي أو مسائي</span>
      <span><Wallet size={17} aria-hidden="true"/>تثبيت الحجز ٨٪</span>
    </div>
  </>;
}

export function CustomerPageTitle({title, subtitle}: {title: string; subtitle: string}) {
  return <div className="mz-page-title"><h1>{title}</h1><p>{subtitle}</p></div>;
}
