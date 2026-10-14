import { expect, test } from "bun:test";
import { applySecurityHeaders } from "../src/lib/security-headers.server";

test("standalone Worker allows only same-origin frames and preserves the response", async () => {
  const response = applySecurityHeaders(new Response("ok", { status: 201, headers: { "Set-Cookie": "fixture=value; Secure; HttpOnly" } }));
  expect(response.status).toBe(201);
  expect(await response.text()).toBe("ok");
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-src 'self'; frame-ancestors 'self';",
  );
  expect(response.headers.get("content-security-policy")).not.toContain("higgsfield");
  expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'; object-src 'none';");
  expect(response.headers.get("content-security-policy")).toContain("img-src 'self' data: blob:;");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("set-cookie")).toBe("fixture=value; Secure; HttpOnly");
});
