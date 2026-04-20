#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const services = [
  { name: "frontend ", port: 3000, color: "\x1b[36m" },
  { name: "backend  ", port: 4000, color: "\x1b[35m" },
  { name: "dashboard", port: 4001, color: "\x1b[33m" },
];

const reset = "\x1b[0m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";

function run(file, args) {
  try {
    return execFileSync(file, args, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function pidOnPort(port) {
  const out = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return out.split("\n").filter(Boolean)[0] ?? null;
}

function pgrep(pattern) {
  const out = run("pgrep", ["-f", pattern]);
  return out.split("\n").filter(Boolean)[0] ?? null;
}

const runner = pgrep("concurrently -k -n shared,backend,frontend,dashboard");
console.log(
  runner
    ? `${green}●${reset} concurrently runner ${dim}pid ${runner}${reset}`
    : `${red}○${reset} concurrently runner ${dim}(not running)${reset}`,
);

for (const { name, port, color } of services) {
  const pid = pidOnPort(port);
  const badge = pid ? `${green}●${reset}` : `${red}○${reset}`;
  const state = pid
    ? `${dim}pid ${pid} → http://localhost:${port}${reset}`
    : `${dim}free${reset}`;
  console.log(`${badge} ${color}${name}${reset} :${port}  ${state}`);
}

const sharedPid = pgrep("tsc --watch");
console.log(
  sharedPid
    ? `${green}●${reset} \x1b[90mshared   ${reset} ${dim}tsc --watch pid ${sharedPid}${reset}`
    : `${red}○${reset} \x1b[90mshared   ${reset} ${dim}(not watching)${reset}`,
);
