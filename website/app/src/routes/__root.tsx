import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Outlet,createRootRouteWithContext,HeadContent,Scripts} from "@tanstack/react-router";
import {useEffect,type ReactNode} from "react";
import appCss from "../styles.css?url";
import {reportHiggsfieldError} from "../lib/higgsfield-error-reporting";
import meta from "../app-meta.json";
declare const __HF_DESIGN_INSPECTOR__:boolean;
export const Route=createRootRouteWithContext<{queryClient:QueryClient}>()({
head:()=>({meta:[{charSet:"utf-8"},{name:"viewport",content:"width=device-width,initial-scale=1,viewport-fit=cover"},{title:meta.og_title||"مزرعتي"},{name:"description",content:meta.og_description||""},{property:"og:title",content:meta.og_title||"مزرعتي"},{property:"og:description",content:meta.og_description||""},{property:"og:image",content:meta.og_image_url||""}],links:[{rel:"stylesheet",href:appCss},{rel:"icon",href:meta.favicon_url||"/assets/mazraaty-logo.svg"}]}),
shellComponent:({children}:{children:ReactNode})=><html lang="ar" dir="rtl"><head><HeadContent/></head><body>{children}<Scripts/></body></html>,
component:Root,notFoundComponent:()=> <main className="mz-empty"><h1>الصفحة غير موجودة</h1><a href="/customer">رجوع للمزارع</a></main>,
errorComponent:({reset})=><main className="mz-empty"><h1>تعذر فتح الصفحة</h1><button onClick={reset}>حاول مجدداً</button></main>
});
function Root(){const {queryClient}=Route.useRouteContext();useEffect(()=>{if(__HF_DESIGN_INSPECTOR__)void import("../module/design-inspector/runtime").then(m=>m.installHiggsfieldDesignInspector()).catch(e=>reportHiggsfieldError(e,{boundary:"design_inspector"}));},[]);return <QueryClientProvider client={queryClient}><Outlet/></QueryClientProvider>;}

