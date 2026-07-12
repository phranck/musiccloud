import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const appScript = await readFile(new URL("./app", import.meta.url), "utf8");
const detachedLauncher = await readFile(
  new URL("./scripts/start-detached.mjs", import.meta.url),
  "utf8",
);

const RUNNER_ENV = {
  ...process.env,
  APP_START_TIMEOUT_SECONDS: "1",
  APP_PROBE_INTERVAL_SECONDS: "0.05",
  APP_HEALTH_TIMEOUT_SECONDS: "0.2",
};

/** Creates an isolated copy of the project runner with a synthetic app. */
async function createFixture({ command, healthPath = "/health", serverStatus = 200 }) {
  const root = await mkdtemp(join(tmpdir(), "musiccloud-app-runner-"));
  const runner = join(root, "app");
  const port = await reservePort();

  await writeFile(runner, appScript);
  await chmod(runner, 0o755);
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "scripts", "start-detached.mjs"), detachedLauncher);
  await writeFile(
    join(root, "app.config"),
    `APP_NAMES=(fixture)\nAPP_PORTS=(${port})\nAPP_CMDS=("${command}")\nAPP_HEALTH_PATHS=(${healthPath})\n`,
  );
  await writeFile(
    join(root, "server.mjs"),
    `import { createServer } from "node:http";

const server = createServer((request, response) => {
  response.statusCode = ${serverStatus};
  response.end(request.url === "${healthPath}" ? "probe" : "other");
});

server.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`,
  );
  await writeFile(join(root, "idle.mjs"), "setInterval(() => {}, 1_000);\n");

  return { root, runner, port };
}

/** Runs the isolated project runner with deterministic probe timings. */
function runApp(fixture, ...args) {
  return execFile(fixture.runner, args, {
    cwd: fixture.root,
    env: RUNNER_ENV,
    timeout: 5_000,
  });
}

/** Acquires an unused loopback port for one isolated test fixture. */
async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

/** Waits until the synthetic server has bound its health endpoint. */
async function waitForServer(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Fixture server did not bind port ${port}`);
}

/** Stops runner-owned processes and removes the isolated fixture directory. */
async function disposeFixture(fixture) {
  try {
    await runApp(fixture, "stop");
  } catch {
    // A failed startup intentionally removes its PID file, so stop may be inert.
  }
  await rm(fixture.root, { recursive: true, force: true });
}

test("start rejects a live watcher that never owns the configured listener", async () => {
  const fixture = await createFixture({ command: "node idle.mjs" });

  try {
    await assert.rejects(runApp(fixture, "start"), (error) => {
      assert.equal(error.code, 1);
      return true;
    });
  } finally {
    await disposeFixture(fixture);
  }
});

test("start rejects an unrelated healthy process on the configured port", async () => {
  const fixture = await createFixture({ command: "node idle.mjs" });
  const unrelatedServer = createServer((_request, response) => response.end("ok"));
  await new Promise((resolve, reject) => {
    unrelatedServer.once("error", reject);
    unrelatedServer.listen(fixture.port, "127.0.0.1", resolve);
  });

  try {
    await assert.rejects(runApp(fixture, "start"), (error) => {
      assert.equal(error.code, 1);
      return true;
    });
  } finally {
    await new Promise((resolve, reject) =>
      unrelatedServer.close((error) => (error ? reject(error) : resolve())),
    );
    await disposeFixture(fixture);
  }
});

test("start and status accept a managed listener with a successful health probe", async () => {
  const fixture = await createFixture({ command: "node server.mjs" });

  try {
    await runApp(fixture, "start");
    const status = await runApp(fixture, "status");

    assert.match(status.stdout, /fixture\s+\d+\s+\d+\s+running/);
    assert.equal(status.stderr, "");
  } finally {
    await disposeFixture(fixture);
  }
});

test("start isolates the managed process from the invoking process group", async () => {
  const fixture = await createFixture({ command: "node server.mjs" });

  try {
    await runApp(fixture, "start");
    const pid = (await readFile(join(fixture.root, ".app", "pid", "fixture.pid"), "utf8")).trim();
    const { stdout } = await execFile("ps", ["-o", "pgid=", "-p", pid]);

    assert.equal(stdout.trim(), pid);
  } finally {
    await disposeFixture(fixture);
  }
});

test("status reports unhealthy and exits non-zero for a managed non-2xx endpoint", async () => {
  const fixture = await createFixture({ command: "node server.mjs", serverStatus: 503 });
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: fixture.root,
    env: { ...process.env, PORT: String(fixture.port) },
    stdio: "ignore",
  });

  try {
    await waitForServer(fixture.port);
    await mkdir(join(fixture.root, ".app", "pid"), { recursive: true });
    await writeFile(join(fixture.root, ".app", "pid", "fixture.pid"), `${server.pid}\n`);

    await assert.rejects(runApp(fixture, "status"), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /fixture\s+\d+\s+\d+\s+unhealthy/);
      return true;
    });
  } finally {
    server.kill("SIGTERM");
    await disposeFixture(fixture);
  }
});

test("rejects a health-path list that does not match the configured applications", async () => {
  const fixture = await createFixture({ command: "node idle.mjs" });
  await writeFile(
    join(fixture.root, "app.config"),
    `APP_NAMES=(fixture)\nAPP_PORTS=(${fixture.port})\nAPP_CMDS=("node idle.mjs")\nAPP_HEALTH_PATHS=()\n`,
  );

  try {
    await assert.rejects(runApp(fixture, "status"), (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /APP_HEALTH_PATHS/);
      return true;
    });
  } finally {
    await disposeFixture(fixture);
  }
});

test("keeps process-only watchers healthy without a port probe", async () => {
  const fixture = await createFixture({ command: "node idle.mjs" });
  await writeFile(
    join(fixture.root, "app.config"),
    `APP_NAMES=(fixture)\nAPP_PORTS=(-)\nAPP_CMDS=("node idle.mjs")\nAPP_HEALTH_PATHS=(-)\n`,
  );

  try {
    await runApp(fixture, "start");
    const status = await runApp(fixture, "status");
    assert.match(status.stdout, /fixture\s+-\s+\d+\s+running/);
  } finally {
    await disposeFixture(fixture);
  }
});
