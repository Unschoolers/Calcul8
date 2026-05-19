import { spawn } from "node:child_process";
import {
  assertWorkspaceExists,
  buildDockerEnvironment,
  c4Dir,
  containerStructurizrDir,
  containerWorkspacePath,
  readOption,
  resolveDockerCli
} from "./structurizr-docker.mjs";

const args = process.argv.slice(2);

function printHelp() {
  console.log(`Usage: npm run docs:c4:inspect -- [--image structurizr/structurizr]

Runs Structurizr workspace inspections for docs/c4/workspace.dsl.

Options:
  --image  Docker image to run. Default: structurizr/structurizr
  DOCKER_CLI can point to docker.exe when Docker is not on PATH.
  --help   Show this help text
`);
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

assertWorkspaceExists();

const image = readOption(args, "--image", process.env.STRUCTURIZR_IMAGE || "structurizr/structurizr");
const dockerCli = resolveDockerCli();
const dockerArgs = [
  "run",
  "--rm",
  "-v",
  `${c4Dir}:${containerStructurizrDir}`,
  image,
  "inspect",
  "-workspace",
  containerWorkspacePath
];

console.log(`Inspecting Structurizr workspace ${c4Dir}`);

const child = spawn(dockerCli, dockerArgs, {
  stdio: "inherit",
  env: buildDockerEnvironment(dockerCli),
  shell: false
});

child.on("error", (error) => {
  console.error("Failed to start Docker. Install/start Docker Desktop, or set DOCKER_CLI to the full docker.exe path, then rerun npm run docs:c4:inspect.");
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
