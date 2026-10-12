# Backend Error Observability

## Public error contract

Every backend non-2xx response is normalized at the Fastify boundary to:

```json
{
  "error": "MC-DB-0001",
  "message": "The database permissions are invalid for this operation. (MC-DB-0001)",
  "errorId": "1bc8fa27-a606-44c4-b8a5-1f2067e41246"
}
```

- `error` is a stable categorized code from `packages/shared/src/error-codes.ts`.
- `message` is safe and useful to the user. It never includes SQL, stack traces, local paths or credentials.
- `errorId` is unique for the failed request and is the primary log correlation key.
- Optional structured `context` may contain safe interpolation data.

SQLSTATE classification distinguishes insufficient privileges (`42501`), missing schema objects (`42P01`), connection failures (`08...`) and other database failures. Validation, authentication, resource, upstream API and unknown system errors have separate code families.

## Frontend propagation

SSR clients return a discriminated result: success, explicit not-found or error. The short-link route and its deferred server island use the same resolver.

Only an explicit backend 404 across both content and share namespaces redirects to `/404`. Permission, database, timeout, transport and server failures render the error shell with the backend message, code and `errorId`. Users can copy all three fields for a bug report.

The browser-facing content proxy preserves the upstream status and complete error JSON. It does not convert backend failures to empty bodies or generic 404/503 responses.

Every sentence a visitor reads comes from the registry in `packages/shared/src/error-codes.ts`. The landing page renders the registry sentence for a code the registry knows, and the response's `message` for any other code. A failure the site's or the developer portal's own routes produce, such as a missing parameter, an unknown proxy path or an unreachable backend, is built with `createApiErrorBody` from `packages/shared/src/api.ts`, so it carries a code and an `errorId` like a backend failure. The site, the developer portal and the dashboard read error bodies with `parseApiErrorResponse`, which keeps only the fields that are present and well typed.

## Structured backend logs

The global Fastify handler emits one correlated record per failed request. Records contain the stable error code, `errorId`, Fastify request ID, method, route, operation, HTTP status and safe user message. Unexpected 5xx failures are errors; rejected 4xx requests are warnings.

Handled fallbacks that keep a request successful use `log.deviation(...)` and include:

- component;
- operation;
- stable error code;
- explicit outcome such as `cached_fallback` or `layout_omitted`;
- redacted cause.

Production logs are one-line JSON. Database URLs, passwords, bearer tokens, API keys and secrets are redacted, and production stack traces are omitted.

## Reporting an error

Provide the visible error code and `errorId`. Search backend logs by `errorId`; if the operation completed with a degraded fallback, search by `operation`, `errorCode` and the approximate request time.

Do not report only the HTTP status or screenshot text when an `errorId` is available. The ID connects the UI response to the exact backend record without exposing internal details to the browser.
