import {createFileRoute} from "@tanstack/react-router";
import {Mazraaty} from "@/components/mazraaty";
import {canonicalLinks} from "@/lib/site-meta";
export const Route=createFileRoute("/customer")({head:()=>({links:canonicalLinks("/customer")}),component:()=> <Mazraaty owner={false}/>});
