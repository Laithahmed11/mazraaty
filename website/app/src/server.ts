import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers.server";
import {dispatchPush} from './lib/push.server';
import type {SharedEnv} from './lib/shared-api.server';

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async scheduled(_event:unknown,env:SharedEnv,ctx:{waitUntil:(p:Promise<unknown>)=>void}) {
    ctx.waitUntil(dispatchPush(env));
  },
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if(url.pathname !== "/" && url.pathname.endsWith("/")) return applySecurityHeaders(Response.redirect(url.origin+url.pathname.slice(0,-1)+url.search,301));
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      if(request.method!=='GET'&&response.ok&&(ctx as {waitUntil?:(p:Promise<unknown>)=>void})?.waitUntil) {
        (ctx as {waitUntil:(p:Promise<unknown>)=>void}).waitUntil(dispatchPush(env as SharedEnv));
      }
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
