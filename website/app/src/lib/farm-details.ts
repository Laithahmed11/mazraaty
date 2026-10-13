export type FarmDetails={poolDepth?:number;rooms?:number;bathrooms?:number;latitude?:number;longitude?:number;rules?:string;cancellationPolicy?:string;reviewed?:boolean};
export type FarmOffer={from:string;to:string;morning?:number;evening?:number};
const validDay=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('راجع تفاصيل المزرعة والعرض.');return v as Record<string,unknown>};
export function validateFarmDetails(value:unknown):FarmDetails{
 const v=value===undefined?{}:object(value),out:FarmDetails={};
 for(const [key,min,max,integer] of [['poolDepth',0,10,false],['rooms',0,100,true],['bathrooms',0,100,true],['latitude',-90,90,false],['longitude',-180,180,false]] as const){
  if(v[key]===undefined||v[key]===''||v[key]===null)continue;
  if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<min||v[key]>max||(integer&&!Number.isInteger(v[key])))throw Error('راجع عمق المسبح والغرف وإحداثيات الموقع.');
  out[key]=v[key];
 }
 if((out.latitude===undefined)!==(out.longitude===undefined))throw Error('أضف إحداثيتي الموقع معاً.');
 for(const key of ['rules','cancellationPolicy'] as const){if(v[key]===undefined)continue;if(typeof v[key]!=='string'||v[key].length>1500)throw Error('قواعد المكان أو سياسة الإلغاء طويلة.');out[key]=v[key].trim();}
 if(v.reviewed!==undefined){if(typeof v.reviewed!=='boolean')throw Error('راجع حالة مراجعة الإدارة.');out.reviewed=v.reviewed;}
 return out;
}
export function validateFarmOffer(value:unknown,price:number,eveningPrice:number):FarmOffer|null{
 if(value===undefined||value===null)return null;
 const v=object(value);if(!validDay(v.from)||!validDay(v.to)||v.to<v.from)throw Error('راجع تاريخ بداية العرض ونهايته.');
 const out:FarmOffer={from:v.from,to:v.to};
 for(const [key,regular] of [['morning',price],['evening',eveningPrice]] as const){if(v[key]===undefined||v[key]===''||v[key]===null)continue;if(!Number.isSafeInteger(v[key])||Number(v[key])<1||Number(v[key])>=regular)throw Error('سعر العرض يجب أن يكون أقل من السعر الأصلي وأكبر من صفر.');out[key]=Number(v[key]);}
 if(out.morning===undefined&&out.evening===undefined)throw Error('حدد سعر عرض لفترة واحدة على الأقل.');
 return out;
}
export function farmPrice(farm:{price:number;eveningPrice:number;offer?:FarmOffer|null},period:'morning'|'evening',date:string){
 const regular=period==='morning'?farm.price:farm.eveningPrice,offer=farm.offer;
 return offer&&date>=offer.from&&date<=offer.to?(offer[period]??regular):regular;
}
export function activeOffer(offer:FarmOffer|null|undefined,today:string){return !!offer&&offer.to>=today;}
