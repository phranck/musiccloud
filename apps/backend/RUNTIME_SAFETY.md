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

## Local Process Supervision

`./app` records the root command PID, but PID liveness is not application
readiness. pnpm and tsup watchers can remain alive after their HTTP child exits.
The root command is launched in a detached process session by
`scripts/start-detached.mjs`. This prevents an interactive terminal, CI shell,
or automation process from terminating the managed application tree merely by
exiting. Do not replace the detached launcher with `nohup`: `nohup` handles
`SIGHUP`, but it does not create an independent process group.

For every application with a configured port, the runner requires all of these
conditions:

1. The recorded root process is alive.
2. A process listening on the configured port is the root process or one of its
   descendants.
3. The configured HTTP health path returns a successful status.

The paths are declared in `app.config` through `APP_HEALTH_PATHS`. A dash is
valid only for process-only watchers such as the shared package compiler.

`./app start` and `./app restart` wait for readiness instead of sleeping for a
fixed duration. On timeout they terminate the managed process tree, remove the
PID file, print the recent application log, and exit non-zero. `./app status`
reports `unhealthy` and exits with status `1` when a live managed command fails
its listener or HTTP boundary. Stopped applications do not make status fail.

Useful commands:

```sh
./app restart backend
./app status
./app logs backend
curl --fail http://localhost:4000/health/backend
```

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

`app.test.mjs` uses isolated temporary directories and synthetic local HTTP
processes. It covers:

- a live watcher with no listener;
- an unrelated healthy process occupying the expected port;
- a managed healthy listener;
- a managed root in an independent process group;
- a managed non-2xx health endpoint;
- mismatched runner configuration; and
- process-only watchers without a port.

Run the focused gates with:

```sh
node --test app.test.mjs scripts/ci-workflow.test.mjs scripts/zerops-deploy.test.mjs
bash -n app scripts/zerops-deploy.sh
```

CI runs those tests before the workspace test suites.

## Incident Record: 2026-07-12

The API-reference exporter needed to import `buildApp()` without opening a
listener. Its direct-entry guard was changed from a test-environment condition
to an `import.meta.url` comparison. The source compiled and tests passed, but
the deployed artifact was CommonJS, where the comparison could never succeed.

The local runner tracked the surviving tsup watcher, and the deployment job
tracked the successful artifact upload. Neither checked the actual HTTP runtime
boundary, so both reported success while the Backend had no listener. The
process/listener/HTTP checks above close each part of that detection gap.
