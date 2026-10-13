export type CheckoutMode={enabled:boolean;mode:string;payBeforeConfirmation?:boolean;holdMinutes?:number};
export type PaymentState={status:string;amount:number;environment:string;expires:number|null;url?:string|null};
export const paymentLabels:Record<string,string>={creating:'جاري تجهيز الدفع',awaiting_payment:'بانتظار الدفع',paid:'تم الدفع',expired:'انتهت صلاحية الدفع',cancelled:'الدفع ملغي',review_required:'الدفع يحتاج مراجعة الإدارة'};
