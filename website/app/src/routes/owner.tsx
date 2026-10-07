import {createFileRoute} from "@tanstack/react-router";
import {Mazraaty} from "@/components/mazraaty";
export const Route=createFileRoute("/owner")({head:()=>({meta:[{name:"robots",content:"noindex,nofollow"},{title:"مزرعتي | الإدارة"}],links:[{rel:"canonical",href:"https://mazraaty-iraq.higgsfield.app/owner"}]}),component:()=> <Mazraaty owner/>});

