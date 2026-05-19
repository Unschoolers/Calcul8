import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  assertWorkspaceExists,
  buildDockerEnvironment,
  c4Dir,
  containerStructurizrDir,
  readOption,
  resolveDockerCli
} from "./structurizr-docker.mjs";

const args = process.argv.slice(2);

function printHelp() {
  console.log(`Usage: npm run docs:c4 -- [--port 8080] [--image structurizr/structurizr]

Starts Structurizr local against docs/c4/workspace.dsl.

Options:
  --port   Local port to bind Structurizr local. Default: 8080
  --image  Docker image to run. Default: structurizr/structurizr
  DOCKER_CLI can point to docker.exe when Docker is not on PATH.
  --help   Show this help text
`);
}

async function assertPortAvailable(nextPort) {
  await new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      reject(error);
    });

    server.once("listening", () => {
      server.close(resolve);
    });

    server.listen(Number(nextPort), "0.0.0.0");
  }).catch((error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`Port ${nextPort} is already in use.`);
      console.error(`Run: npm run docs:c4 -- --port ${Number(nextPort) + 1}`);
      process.exit(1);
    }

    throw error;
  });
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

assertWorkspaceExists();

const port = readOption(args, "--port", process.env.STRUCTURIZR_PORT || "8080");
const image = readOption(args, "--image", process.env.STRUCTURIZR_IMAGE || "structurizr/structurizr");
const dockerCli = resolveDockerCli();

if (!/^\d+$/.test(port) || Number(port) <= 0 || Number(port) > 65535) {
  console.error(`Invalid Structurizr local port: ${port}`);
  process.exit(1);
}

await assertPortAvailable(port);

const dockerArgs = [
  "run",
  "--rm",
  ...(process.stdin.isTTY ? ["-it"] : []),
  "-p",
  `${port}:${port}`,
  "-e",
  `PORT=${port}`,
  "-v",
  `${c4Dir}:${containerStructurizrDir}`,
  image,
  "local"
];

console.log(`Starting Structurizr local for ${c4Dir}`);
console.log(`Open http://localhost:${port}`);
console.log("This runs the Structurizr local command, not the server command.");

const child = spawn(dockerCli, dockerArgs, {
  stdio: "inherit",
  env: buildDockerEnvironment(dockerCli),
  shell: false
});

child.on("error", (error) => {
  console.error("Failed to start Docker. Install/start Docker Desktop, or set DOCKER_CLI to the full docker.exe path, then rerun npm run docs:c4.");
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
