import {createFileRoute} from "@tanstack/react-router";
import {Mazraaty} from "@/components/mazraaty";
import {canonicalLinks} from "@/lib/site-meta";
export const Route=createFileRoute("/owner")({head:()=>({meta:[{name:"robots",content:"noindex,nofollow"},{title:"مزرعتي | الإدارة"}],links:canonicalLinks("/owner")}),component:()=> <Mazraaty owner/>});
