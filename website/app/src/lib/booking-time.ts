export function bookingEnd(date:string,period:string){
 if(period==='evening')return Date.parse(date+'T04:00:00+03:00')+86400000;
 return Date.parse(date+(period==='morning'?'T18:00:00+03:00':'T23:59:59+03:00'));
}
