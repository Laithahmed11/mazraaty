import {createFileRoute} from "@tanstack/react-router";
import {Mazraaty} from "@/components/mazraaty";
export const Route=createFileRoute("/")({head:()=>({links:[{rel:"canonical",href:"https://mazraaty-iraq.higgsfield.app/"}]}),component:()=> <Mazraaty owner={false}/>});

