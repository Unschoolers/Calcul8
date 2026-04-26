import { execFileSync } from "node:child_process";
import process from "node:process";

const DEFAULT_BACKEND_PORTS = [7071, 7075, 7081, 8080];
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function parsePorts(value) {
  return String(value || "")
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
}

const ports = parsePorts(process.env.BACKEND_KILL_PORTS);
const targetPorts = ports.length ? ports : DEFAULT_BACKEND_PORTS;

function run(command, argsList) {
  return execFileSync(command, argsList, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function findWindowsPidsForPort(port) {
  let output = "";
  try {
    output = run("netstat", ["-ano", "-p", "TCP"]);
  } catch {
    return [];
  }

  const pids = new Set();
  const portPattern = new RegExp(`[:.]${port}\\s`);
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !portPattern.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    const state = parts[3] || "";
    const pid = Number.parseInt(parts.at(-1) || "", 10);
    if (Number.isInteger(pid) && state.toUpperCase() === "LISTENING") {
      pids.add(pid);
    }
  }
  return [...pids];
}

function findUnixPidsForPort(port) {
  try {
    const output = run("lsof", ["-ti", `tcp:${port}`]);
    return output
      .split(/\s+/)
      .map((entry) => Number.parseInt(entry, 10))
      .filter((pid) => Number.isInteger(pid));
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (dryRun) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  process.kill(pid, "SIGTERM");
}

const findPidsForPort = process.platform === "win32" ? findWindowsPidsForPort : findUnixPidsForPort;
const pidsByPort = new Map();
const allPids = new Set();

for (const port of targetPorts) {
  const pids = findPidsForPort(port);
  pidsByPort.set(port, pids);
  pids.forEach((pid) => allPids.add(pid));
}

if (!allPids.size) {
  console.log(`No local backend processes found on ports ${targetPorts.join(", ")}.`);
  process.exit(0);
}

for (const [port, pids] of pidsByPort) {
  if (pids.length) {
    console.log(`${dryRun ? "Would kill" : "Killing"} port ${port}: PID ${pids.join(", ")}`);
  }
}

let killed = 0;
for (const pid of allPids) {
  try {
    killPid(pid);
    killed += 1;
  } catch (error) {
    console.warn(`Could not kill PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`${dryRun ? "Dry run complete" : "Backend kill complete"}: ${killed} process${killed === 1 ? "" : "es"} ${dryRun ? "matched" : "stopped"}.`);
