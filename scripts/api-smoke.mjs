#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => !a.startsWith("--")) || process.env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const insecure = args.includes("--insecure") || process.env.API_INSECURE === "1";
const withRegister = args.includes("--register");

if (baseUrl.startsWith("https:") && insecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const origin = new URL(baseUrl).origin;
const results = [];

async function loadEnvCredentials() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (email && password) return { email, password };
  try {
    const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    const parsed = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
        }),
    );
    return { email: parsed.SUPER_ADMIN_EMAIL, password: parsed.SUPER_ADMIN_PASSWORD };
  } catch {
    return { email: undefined, password: undefined };
  }
}

function cookieHeader(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function check(name, expected, run) {
  try {
    const actual = await run();
    const ok = Array.isArray(expected) ? expected.includes(actual.status) : actual.status === expected;
    results.push({ name, ok, expected, actual: actual.status, note: actual.note });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  status=${actual.status}${actual.note ? `  (${actual.note})` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, expected, actual: "error", note: error.message });
    console.log(`FAIL  ${name}  error=${error.message}`);
  }
}

async function get(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...init });
  return { status: response.status, note: init.note, response };
}

async function post(path, body, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", Origin: origin, ...(init.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
  return { status: response.status, note: init.note, response };
}

console.log(`API smoke test  base=${baseUrl}  insecure=${insecure}`);
console.log("");

await check("GET /", 200, () => get("/"));
await check("GET /api/terms", 200, async () => {
  const result = await get("/api/terms");
  const data = await result.response.json().catch(() => ({}));
  return { ...result, note: `version=${data.version || data.termsVersion || "?"}` };
});
await check("GET /api/packages", 200, async () => {
  const result = await get("/api/packages");
  const data = await result.response.json().catch(() => []);
  const count = Array.isArray(data) ? data.length : Array.isArray(data?.packages) ? data.packages.length : "?";
  return { ...result, note: `packages=${count}` };
});
await check("GET /api/branding", 200, () => get("/api/branding"));
await check("GET /api/news", 200, () => get("/api/news"));
await check("GET /api/help-center", 200, () => get("/api/help-center"));
await check("GET /api/settings (user-only, no session)", 401, () => get("/api/settings"));
await check("GET /api/profile (no session)", 401, () => get("/api/profile"));

await check("POST /api/auth/login (wrong password)", 401, () =>
  post("/api/auth/login", { email: "nobody@example.com", password: "WrongPassword123", role: "user" }),
);

await check("POST /api/auth/register (no packageId)", 400, () =>
  post("/api/auth/register", {
    name: "Smoke Test",
    email: "smoke-nopkg@example.com",
    password: "SmokeTest12345",
    whatsappPhone: "+923001234567",
    termsAccepted: true,
    termsVersion: "v1",
  }),
);

const credentials = await loadEnvCredentials();
if (credentials.email && credentials.password) {
  let sessionCookie = "";
  await check("POST /api/auth/login (super admin)", 200, async () => {
    const result = await post("/api/auth/login", {
      email: credentials.email,
      password: credentials.password,
      role: "superAdmin",
    });
    sessionCookie = cookieHeader(result.response);
    const data = await result.response.json().catch(() => ({}));
    return { ...result, note: `next=${data.nextPath || "?"}` };
  });
  await check("GET /super-admin/dashboard (with session)", 200, () =>
    get("/super-admin/dashboard", { headers: { Cookie: sessionCookie } }),
  );
  await check("GET /api/admin/settings (super admin session)", 200, () =>
    get("/api/admin/settings", { headers: { Cookie: sessionCookie } }),
  );
  await check("GET /api/admin/packages (super admin session)", 200, () =>
    get("/api/admin/packages", { headers: { Cookie: sessionCookie } }),
  );
} else {
  console.log("SKIP  super admin login (SUPER_ADMIN_EMAIL/PASSWORD not found)");
}

if (withRegister) {
  const packagesResult = await get("/api/packages");
  const packages = await packagesResult.response.json().catch(() => []);
  const list = Array.isArray(packages) ? packages : packages?.packages || [];
  if (!list.length) {
    console.log("SKIP  full register flow (no registration packages in database)");
  } else {
    const email = `smoke-${Date.now()}@example.com`;
    await check("POST /api/auth/register (full flow)", 201, () =>
      post("/api/auth/register", {
        name: "Smoke Test",
        email,
        password: "SmokeTest12345",
        whatsappPhone: "+923001234567",
        termsAccepted: true,
        termsVersion: "v1",
        packageId: String(list[0]._id || list[0].id),
      }),
    );
  }
}

console.log("");
const failed = results.filter((r) => !r.ok);
console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("Failed:");
  for (const item of failed) console.log(`  - ${item.name}: expected=${item.expected} actual=${item.actual}`);
  process.exitCode = 1;
}
