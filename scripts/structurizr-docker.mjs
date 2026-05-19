import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, "..");
export const c4Dir = path.join(repoRoot, "docs", "c4");
export const workspacePath = path.join(c4Dir, "workspace.dsl");
export const containerStructurizrDir = "/usr/local/structurizr";
export const containerWorkspacePath = `${containerStructurizrDir}/workspace.dsl`;

const windowsDockerDesktopCli = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";

export function readOption(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  return fallback;
}

export function resolveDockerCli() {
  if (process.env.DOCKER_CLI) return process.env.DOCKER_CLI;
  if (process.platform === "win32" && existsSync(windowsDockerDesktopCli)) {
    return windowsDockerDesktopCli;
  }
  return "docker";
}

export function buildDockerEnvironment(dockerCliPath) {
  const env = { ...process.env };
  const dockerDir = path.dirname(dockerCliPath);
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const currentPath = env[pathKey] || "";

  if (dockerCliPath !== "docker" && !currentPath.split(path.delimiter).includes(dockerDir)) {
    env[pathKey] = `${dockerDir}${path.delimiter}${currentPath}`;
  }

  return env;
}

export function assertWorkspaceExists() {
  if (!existsSync(workspacePath)) {
    console.error(`Structurizr workspace not found: ${workspacePath}`);
    process.exit(1);
  }
}
