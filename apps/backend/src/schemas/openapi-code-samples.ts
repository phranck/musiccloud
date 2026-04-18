/**
 * Helpers that generate `x-codeSamples` arrays for the public v1 API
 * routes. Redoc reads the extension per operation and renders one tab
 * per language in the right-hand code panel.
 *
 * Keeping the generator here means route files just declare intent
 * (method + path + optional body/auth) and the seven idiomatic-looking
 * snippets (cURL, HTTPie, JavaScript, Python, PHP, Ruby, Swift) come
 * out consistent. When a new language is added, it's added once here
 * rather than across every route.
 */

// Teach Fastify's typed-schema augmentation that `x-codeSamples` is a valid
// field. Without this, routes typed with `app.get<{ Params: ... }>` reject
// the extension with TS2353.
declare module "fastify" {
  interface FastifySchema {
    "x-codeSamples"?: CodeSample[];
  }
}

const BASE_URL = "https://api.musiccloud.io";

export type AuthMode = "bearer" | "apiKey";

export interface CodeSampleConfig {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path as declared in the OpenAPI spec. Use `{param}` for path params. */
  path: string;
  /** Query params to append as `?k=v`. Values are stringified as-is. */
  query?: Record<string, string | number | boolean>;
  /** Non-auth headers that should appear in the snippet. */
  headers?: Record<string, string>;
  /** Request body for POST / PATCH. Rendered as JSON. */
  body?: Record<string, unknown>;
  /** Whether and how the caller needs to authenticate. */
  auth?: AuthMode;
}

export interface CodeSample {
  lang: string;
  label?: string;
  source: string;
}

export function buildCodeSamples(cfg: CodeSampleConfig): CodeSample[] {
  return [
    { lang: "Shell", label: "cURL", source: curlSnippet(cfg) },
    { lang: "Shell", label: "Bash", source: bashSnippet(cfg) },
    { lang: "JavaScript", source: jsSnippet(cfg) },
    { lang: "Python", source: pythonSnippet(cfg) },
    { lang: "PHP", source: phpSnippet(cfg) },
    { lang: "Ruby", source: rubySnippet(cfg) },
    { lang: "Swift", source: swiftSnippet(cfg) },
  ];
}

// ---------------------------------------------------------------------------
// Helpers shared across language generators
// ---------------------------------------------------------------------------

function fullUrl(cfg: CodeSampleConfig): string {
  const qs = cfg.query
    ? `?${Object.entries(cfg.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")}`
    : "";
  return `${BASE_URL}${cfg.path}${qs}`;
}

function authHeaderValue(cfg: CodeSampleConfig): string | null {
  if (cfg.auth === "bearer") return "Bearer <token>";
  if (cfg.auth === "apiKey") return "<api-key>";
  return null;
}

function authHeaderName(cfg: CodeSampleConfig): string | null {
  if (cfg.auth === "bearer") return "Authorization";
  if (cfg.auth === "apiKey") return "X-API-Key";
  return null;
}

function jsonBody(cfg: CodeSampleConfig): string | null {
  return cfg.body ? JSON.stringify(cfg.body, null, 2) : null;
}

// ---------------------------------------------------------------------------
// cURL
// ---------------------------------------------------------------------------

function curlSnippet(cfg: CodeSampleConfig): string {
  const lines: string[] = [];
  const flagMethod = cfg.method !== "GET" ? ` -X ${cfg.method}` : "";
  lines.push(`curl${flagMethod} "${fullUrl(cfg)}"`);

  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) {
    lines.push(`  -H "${authName}: ${authValue}"`);
  }

  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    lines.push(`  -H "${k}: ${v}"`);
  }

  const body = jsonBody(cfg);
  if (body) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  }

  return lines.join(" \\\n");
}

// ---------------------------------------------------------------------------
// Bash script (full shebang + env vars + jq pipe)
// ---------------------------------------------------------------------------

function bashSnippet(cfg: CodeSampleConfig): string {
  const lines: string[] = ["#!/usr/bin/env bash", "set -euo pipefail", ""];
  lines.push(`BASE_URL="${BASE_URL}"`);

  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName) {
    lines.push(`TOKEN="${authValue}"`);
  }
  lines.push("");

  const qs = cfg.query
    ? `?${Object.entries(cfg.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")}`
    : "";
  const urlVar = `"$BASE_URL${cfg.path}${qs}"`;

  const curlLines: string[] = [`response=$(curl -sS${cfg.method !== "GET" ? ` -X ${cfg.method}` : ""} ${urlVar}`];
  if (authName) {
    curlLines.push(`  -H "${authName}: ${authName === "Authorization" ? "Bearer $TOKEN" : "$TOKEN"}"`);
  }
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    curlLines.push(`  -H "${k}: ${v}"`);
  }
  const body = jsonBody(cfg);
  if (body) {
    curlLines.push(`  -H "Content-Type: application/json"`);
    curlLines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  }
  lines.push(`${curlLines.join(" \\\n")})`);
  lines.push("");
  lines.push(`echo "$response" | jq .`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JavaScript (fetch)
// ---------------------------------------------------------------------------

function jsSnippet(cfg: CodeSampleConfig): string {
  const url = fullUrl(cfg);
  const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) headers[authName] = authValue;
  if (cfg.body) headers["Content-Type"] = "application/json";

  const hasInit = cfg.method !== "GET" || Object.keys(headers).length > 0 || cfg.body;

  if (!hasInit) {
    return `const response = await fetch("${url}");
const data = await response.json();`;
  }

  const initLines: string[] = [];
  if (cfg.method !== "GET") initLines.push(`  method: "${cfg.method}",`);
  if (Object.keys(headers).length > 0) {
    initLines.push(`  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")},`);
  }
  if (cfg.body) {
    initLines.push(`  body: JSON.stringify(${JSON.stringify(cfg.body, null, 2).replace(/\n/g, "\n  ")}),`);
  }

  return `const response = await fetch("${url}", {
${initLines.join("\n")}
});
const data = await response.json();`;
}

// ---------------------------------------------------------------------------
// Python (requests)
// ---------------------------------------------------------------------------

function pythonSnippet(cfg: CodeSampleConfig): string {
  const url = fullUrl(cfg);
  const headerEntries: string[] = [];
  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) headerEntries.push(`    "${authName}": "${authValue}"`);
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    headerEntries.push(`    "${k}": "${v}"`);
  }

  const headersBlock = headerEntries.length > 0 ? `headers = {\n${headerEntries.join(",\n")},\n}\n` : "";
  const jsonArg = cfg.body ? `, json=${pythonLiteral(cfg.body)}` : "";
  const headersArg = headerEntries.length > 0 ? ", headers=headers" : "";

  return `import requests

${headersBlock}response = requests.${cfg.method.toLowerCase()}("${url}"${headersArg}${jsonArg})
data = response.json()`;
}

function pythonLiteral(v: unknown): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(pythonLiteral).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).map(([k, val]) => `"${k}": ${pythonLiteral(val)}`);
    return `{${entries.join(", ")}}`;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// PHP (cURL)
// ---------------------------------------------------------------------------

function phpSnippet(cfg: CodeSampleConfig): string {
  const url = fullUrl(cfg);
  const lines: string[] = [`<?php`, ``, `$ch = curl_init("${url}");`];

  const headerList: string[] = [];
  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) headerList.push(`"${authName}: ${authValue}"`);
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    headerList.push(`"${k}: ${v}"`);
  }
  if (cfg.body) headerList.push(`"Content-Type: application/json"`);

  if (cfg.method !== "GET") {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${cfg.method}");`);
  }
  if (headerList.length > 0) {
    lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [${headerList.join(", ")}]);`);
  }
  if (cfg.body) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${JSON.stringify(cfg.body)}');`);
  }
  lines.push(`curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`);
  lines.push(``, `$response = curl_exec($ch);`);
  lines.push(`curl_close($ch);`);
  lines.push(`$data = json_decode($response, true);`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Ruby (Net::HTTP)
// ---------------------------------------------------------------------------

function rubySnippet(cfg: CodeSampleConfig): string {
  const url = fullUrl(cfg);
  const lines: string[] = [
    `require "net/http"`,
    `require "json"`,
    ``,
    `uri = URI("${url}")`,
    `http = Net::HTTP.new(uri.host, uri.port)`,
    `http.use_ssl = uri.scheme == "https"`,
    ``,
  ];

  const reqClass = cfg.method.charAt(0) + cfg.method.slice(1).toLowerCase();
  lines.push(`request = Net::HTTP::${reqClass}.new(uri.request_uri)`);

  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) lines.push(`request["${authName}"] = "${authValue}"`);
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    lines.push(`request["${k}"] = "${v}"`);
  }
  if (cfg.body) {
    lines.push(`request["Content-Type"] = "application/json"`);
    lines.push(`request.body = ${JSON.stringify(JSON.stringify(cfg.body))}`);
  }
  lines.push(``, `response = http.request(request)`, `data = JSON.parse(response.body)`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Swift (URLSession)
// ---------------------------------------------------------------------------

function swiftSnippet(cfg: CodeSampleConfig): string {
  const url = fullUrl(cfg);
  const lines: string[] = [`import Foundation`, ``, `let url = URL(string: "${url}")!`];
  lines.push(`var request = URLRequest(url: url)`);
  lines.push(`request.httpMethod = "${cfg.method}"`);

  const authName = authHeaderName(cfg);
  const authValue = authHeaderValue(cfg);
  if (authName && authValue) {
    lines.push(`request.setValue("${authValue}", forHTTPHeaderField: "${authName}")`);
  }
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    lines.push(`request.setValue("${v}", forHTTPHeaderField: "${k}")`);
  }
  if (cfg.body) {
    lines.push(`request.setValue("application/json", forHTTPHeaderField: "Content-Type")`);
    lines.push(`request.httpBody = try JSONSerialization.data(withJSONObject: ${swiftDict(cfg.body)})`);
  }

  lines.push(``);
  lines.push(`let (data, _) = try await URLSession.shared.data(for: request)`);
  lines.push(`let json = try JSONSerialization.jsonObject(with: data)`);

  return lines.join("\n");
}

function swiftDict(v: unknown): string {
  if (v === null) return "NSNull()";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(swiftDict).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).map(([k, val]) => `"${k}": ${swiftDict(val)}`);
    return `["${entries.map((e) => e.replace(/^"/, "")).join("")}"]`.length > 0 ? `[${entries.join(", ")}]` : "[:]";
  }
  return String(v);
}
