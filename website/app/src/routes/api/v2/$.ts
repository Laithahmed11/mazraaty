import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";
import { handleShared, type SharedEnv } from "@/lib/shared-api.server";
const run=({request}:{request:Request})=>handleShared(request,bindings() as SharedEnv);
export const Route=createFileRoute("/api/v2/$")({server:{handlers:{GET:run,POST:run,PATCH:run,DELETE:run}}});

