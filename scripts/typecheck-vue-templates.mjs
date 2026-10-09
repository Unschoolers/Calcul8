import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedSuffix = `.template-check-${process.pid}.vue`;
const generatedFiles = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".cache") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".vue") && !entry.name.includes(".template-check-")) files.push(fullPath);
  }
  return files;
}

function inlineExternalTemplate(source, templatePath, template) {
  const escapedPath = templatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const templateTag = new RegExp(`<template\\s+src=(['"])${escapedPath}\\1\\s*(?:\\/\\s*>|>\\s*<\\/template\\s*>)`);
  if (!templateTag.test(source)) throw new Error(`Could not inline template src ${templatePath}`);
  return source.replace(templateTag, `<template>\n${template}\n</template>`);
}

try {
  for (const componentPath of await walk(path.join(root, "src"))) {
    const source = await readFile(componentPath, "utf8");
    const templateMatch = source.match(/<template\s+src=(['"])([^'"]+)\1\s*(?:\/\s*>|>\s*<\/template\s*>)/);
    if (!templateMatch) continue;
    const [, , templatePath] = templateMatch;
    const template = await readFile(path.resolve(path.dirname(componentPath), templatePath), "utf8");
    const generatedPath = componentPath.replace(/\.vue$/, generatedSuffix);
    await writeFile(generatedPath, inlineExternalTemplate(source, templatePath, template));
    generatedFiles.push(generatedPath);
  }

  if (!generatedFiles.length) throw new Error("No external Vue templates were found to typecheck.");
  await mkdir(path.join(root, ".cache"), { recursive: true });
  const configPath = path.join(root, ".cache", `tsconfig.vue-templates-${process.pid}.json`);
  await writeFile(configPath, JSON.stringify({
    extends: "../tsconfig.json",
    include: [`../src/**/*.template-check-${process.pid}.vue`],
    compilerOptions: { incremental: false }
  }, null, 2));

  process.stdout.write(`Typechecking ${generatedFiles.length} external Vue templates.\n`);
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "vue-tsc", "bin", "vue-tsc.js"), "--noEmit", "-p", configPath], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await Promise.all(generatedFiles.map((file) => rm(file, { force: true })));
  await rm(path.join(root, ".cache", `tsconfig.vue-templates-${process.pid}.json`), { force: true });
}
