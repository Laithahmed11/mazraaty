import {createFileRoute} from "@tanstack/react-router";
import {Mazraaty} from "@/components/mazraaty";
export const Route=createFileRoute("/customer")({head:()=>({links:[{rel:"canonical",href:"https://mazraaty-iraq.higgsfield.app/customer"}]}),component:()=> <Mazraaty owner={false}/>});

