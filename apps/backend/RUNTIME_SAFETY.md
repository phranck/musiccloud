# Backend Runtime Safety

This document defines the startup and health boundaries for the musiccloud
Backend in local development, CI, and Zerops production deployments. These are
runtime correctness requirements, not optional operational checks.

## Runtime Invariants

The Backend production artifact is CommonJS. `apps/backend/tsup.config.ts`
declares `format: ["cjs"]`, and direct execution is detected through Node's
CommonJS module identity:

```ts
module === require.main
```

Do not replace this condition with `import.meta.url` while the output format is
CommonJS. tsup cannot preserve `import.meta` in that format, so the condition
would be false and `node dist/server.js` could exit successfully without ever
opening the configured port.

`buildApp()` remains import-safe. Tests and the OpenAPI exporter may import it
without creating a listener. Only direct execution of the bundled server may
call `start()` automatically.

## Local Development Boundary

This repository has no project-local `app` runner or runner configuration.
Local development uses the package scripts in `package.json`, such as
`pnpm dev:backend` and `pnpm dev:all`.

For every supervised application with a configured port, readiness requires all
of these conditions:

1. The recorded root process is alive.
2. A process listening on the configured port is the root process or one of its
   descendants.
3. The configured HTTP health path returns a successful status.

The backend health endpoint remains available locally at
`http://localhost:4000/health/backend`.

## Production Deployment Boundary

A successful Zerops artifact upload does not prove that the deployed process
opened its public port. The Backend deploy job therefore calls the public
`https://api.musiccloud.io/health/backend` endpoint after `zcli push` and fails
unless it returns a successful response. The deploy helper retries only the
observed transient Zerops websocket-close transport failure; build and
application failures remain terminal.

The CI workflow must never remove this post-deploy health boundary or treat
artifact creation alone as deployment success.

## Regression Coverage

Run the focused gates with:

```sh
node --test scripts/ci-workflow.test.mjs scripts/zerops-deploy.test.mjs
bash -n scripts/zerops-deploy.sh
```

CI runs the workflow and deployment contracts before the workspace test suites.

## Incident Record: 2026-07-12

The API-reference exporter needed to import `buildApp()` without opening a
listener. Its direct-entry guard was changed from a test-environment condition
to an `import.meta.url` comparison. The source compiled and tests passed, but
the deployed artifact was CommonJS, where the comparison could never succeed.

The development-process tracking and the deployment job tracked only the
surviving tsup watcher and successful artifact upload. Neither checked the
actual HTTP runtime boundary, so both reported success while the Backend had no
listener. The process/listener/HTTP checks above close each part of that
detection gap.
