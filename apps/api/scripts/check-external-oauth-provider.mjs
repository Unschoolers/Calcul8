import { constants, closeSync, fstatSync, openSync, readSync } from "node:fs";
import { createRequire } from "node:module";

const MAX_BYTES = 64 * 1024;

function readJson(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error();
    const buffer = Buffer.alloc(MAX_BYTES);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length === MAX_BYTES && readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) throw new Error();
    return JSON.parse(buffer.subarray(0, length).toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 4) throw new Error();
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if ((key !== "--config" && key !== "--metadata") || !value || value.startsWith("--") || Object.hasOwn(values, key)) throw new Error();
    values[key] = value;
  }
  if (!values["--config"] || !values["--metadata"]) throw new Error();
  const config = readJson(values["--config"]);
  const metadata = readJson(values["--metadata"]);
  const require = createRequire(import.meta.url);
  const { assessExternalOAuthProvider } = require("../dist/features/externalOAuth/providerReadiness.js");
  const assessment = assessExternalOAuthProvider(config, metadata);
  process.stdout.write(`${JSON.stringify(assessment)}\n`);
  process.exitCode = assessment.status === "metadata_consistent" ? 0 : 1;
} catch {
  process.stderr.write("OAuth provider check failed.\n");
  process.exitCode = 2;
}
