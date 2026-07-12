#!/usr/bin/env node

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";

const [, , cwd, logFile, port, command] = process.argv;

if (!cwd || !logFile || !port || !command) {
  console.error("usage: start-detached.mjs <cwd> <log-file> <port|-> <command>");
  process.exit(2);
}

const environment = { ...process.env };
if (port === "-") {
  delete environment.PORT;
} else {
  environment.PORT = port;
}

const logDescriptor = openSync(logFile, "a");

try {
  // A detached session survives the terminal, CI shell, or automation process
  // that invoked `./app`. The printed PID remains the process-tree root used by
  // the runner for ownership checks and recursive shutdown.
  const child = spawn("/bin/bash", ["-c", command], {
    cwd,
    detached: true,
    env: environment,
    stdio: ["ignore", logDescriptor, logDescriptor],
  });

  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  child.unref();
  process.stdout.write(`${child.pid}\n`);
} finally {
  closeSync(logDescriptor);
}
