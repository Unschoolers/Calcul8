import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// API-only installs (including deployment builds) also have the pinned compiler.
const require = createRequire(import.meta.url);
let ts;
try {
  ts = require("typescript");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  ts = createRequire(new URL("../apps/api/package.json", import.meta.url))("typescript");
}

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex < 0
  ? fileURLToPath(new URL("../", import.meta.url))
  : path.resolve(args[rootIndex + 1]);
const check = args.includes("--check");
const contracts = [
  { name: "box-inventory", api: true },
  { name: "game-public-session-contracts", api: true },
  { name: "scope-keys", api: false },
  { name: "sync-contracts", api: true },
  { name: "whatnot-import-contracts", api: true },
  { name: "workspace-realtime-rooms", api: false }
];
const sourceFiles = contracts.map(({ name }) => path.join(root, "shared/contracts", `${name}.ts`));
const compilerOptions = {
  target: ts.ScriptTarget.ES2019,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  types: [],
  declaration: true,
  emitDeclarationOnly: true,
  newLine: ts.NewLineKind.LineFeed
};
const declarations = new Map();
const program = ts.createProgram(sourceFiles, compilerOptions);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  }));
  process.exit(1);
}
program.emit(undefined, (file, body) => declarations.set(path.basename(file), body));
const outputs = new Map();
for (const { name, api } of contracts) {
  const source = readFileSync(path.join(root, "shared/contracts", `${name}.ts`), "utf8");
  const banner = `// Generated from shared/contracts/${name}.ts. Run npm run shared:generate.\n`;
  for (const [suffix, module] of [["mjs", ts.ModuleKind.ESNext], ["cjs", ts.ModuleKind.CommonJS]]) {
    const body = ts.transpileModule(source, { fileName: `${name}.ts`, compilerOptions: {
      ...compilerOptions, declaration: false, emitDeclarationOnly: false, module
    } }).outputText;
    outputs.set(`shared/${name}.${suffix}`, banner + body);
    if (api && suffix === "cjs") outputs.set(`apps/api/src/shared/${name}.cjs`, banner + body);
  }
  const declaration = declarations.get(`${name}.d.ts`);
  if (!declaration) throw new Error(`Compiler did not emit declarations for ${name}`);
  outputs.set(`shared/${name}.d.ts`, banner + declaration);
  for (const suffix of ["d.mts", "d.cts"]) {
    outputs.set(`shared/${name}.${suffix}`, `export * from "./${name}.js";\n`);
  }
  if (api) {
    // Local declarations keep both runtime and type consumers isolated from the web tree.
    outputs.set(`apps/api/src/shared/${name}.d.cts`, banner + declaration);
    outputs.set(`apps/api/src/shared/${name}.d.ts`, `export * from "./${name}.cjs";\n`);
  }
}
const stale = [];
for (const [relative, body] of outputs) {
  const file = path.join(root, relative);
  if (check) {
    let actual;
    try { actual = readFileSync(file, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (actual !== body) stale.push(relative);
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
}
if (stale.length) {
  console.error(`Shared contract artifacts are stale or missing:\n${stale.map((file) => `  ${file}`).join("\n")}\nRun npm run shared:generate and commit the outputs.`);
  process.exitCode = 1;
} else {
  console.log(`${check ? "Checked" : "Generated"} ${outputs.size} shared contract artifacts.`);
}
