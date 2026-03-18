import { spawn } from "node:child_process";

function parseTasks(argv) {
  const tasks = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--task") continue;

    const rawParts = [];
    let cursor = index + 1;

    while (cursor < argv.length && argv[cursor] !== "--task") {
      rawParts.push(argv[cursor]);
      cursor += 1;
    }

    const raw = rawParts.join(" ").trim();
    if (!raw) {
      throw new Error("Missing value after --task");
    }

    const separatorIndex = raw.indexOf("::");
    if (separatorIndex <= 0 || separatorIndex >= raw.length - 2) {
      throw new Error(`Invalid task format: ${raw}. Expected label::command`);
    }

    tasks.push({
      label: raw.slice(0, separatorIndex).trim(),
      command: raw.slice(separatorIndex + 2).trim()
    });
    index = cursor - 1;
  }

  if (tasks.length === 0) {
    throw new Error("No tasks provided. Use --task label::command");
  }

  return tasks;
}

function prefixAndWrite(stream, prefix, chunk) {
  const text = String(chunk);
  const lines = text.split(/\r?\n/);
  const trailingNewline = /\r?\n$/.test(text);

  lines.forEach((line, index) => {
    if (!line && index === lines.length - 1 && trailingNewline) return;
    stream.write(`${prefix}${line}\n`);
  });
}

function createShellCommand(command) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command]
    };
  }

  return {
    command: "sh",
    args: ["-lc", command]
  };
}

async function run() {
  const tasks = parseTasks(process.argv.slice(2));
  const children = [];
  let settled = false;

  const taskPromises = tasks.map((task) => new Promise((resolve, reject) => {
    const shellTask = createShellCommand(task.command);
    const child = spawn(shellTask.command, shellTask.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true
    });

    children.push(child);

    const prefix = `[${task.label}] `;
    child.stdout.on("data", (chunk) => prefixAndWrite(process.stdout, prefix, chunk));
    child.stderr.on("data", (chunk) => prefixAndWrite(process.stderr, prefix, chunk));

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ label: task.label, code: 0 });
        return;
      }

      const details = signal
        ? `${task.label} exited via signal ${signal}`
        : `${task.label} exited with code ${code}`;
      reject(new Error(details));
    });
  }));

  const results = await Promise.all(taskPromises).catch((error) => {
    if (!settled) {
      settled = true;
      for (const child of children) {
        if (!child.killed) {
          child.kill();
        }
      }
    }
    throw error;
  });

  console.log("");
  console.log(`Parallel tasks complete: ${results.map((result) => result.label).join(", ")}`);
}

run().catch((error) => {
  console.error("");
  console.error(`Parallel run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
