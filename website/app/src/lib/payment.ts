export type CheckoutMode={enabled:boolean;mode:string;payBeforeConfirmation?:boolean;holdMinutes?:number};
export type PaymentState={status:string;amount:number;environment:string;expires:number|null;url?:string|null};
export type PaymentPlan={percent:number;total:number;online:number;cash:number};
export function bookingPaymentPlan(total:number,percent=8):PaymentPlan{
 if(!Number.isSafeInteger(total)||total<1||total>100000000||![8,100].includes(percent))throw Error('Invalid payment plan');
 const online=Math.ceil(total*percent/100);return {percent,total,online,cash:total-online};
}
export const paymentLabels:Record<string,string>={creating:'جاري تجهيز الدفع',awaiting_payment:'بانتظار الدفع',paid:'تم الدفع',expired:'انتهت صلاحية الدفع',cancelled:'الدفع ملغي',review_required:'الدفع يحتاج مراجعة الإدارة'};
