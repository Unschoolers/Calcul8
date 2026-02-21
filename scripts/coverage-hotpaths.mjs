import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve("coverage", "coverage-summary.json");

if (!fs.existsSync(summaryPath)) {
  console.error("Coverage summary not found at coverage/coverage-summary.json");
  console.error("Run: npm run test:coverage");
  process.exit(1);
}

const summaryRaw = fs.readFileSync(summaryPath, "utf8");
const summary = JSON.parse(summaryRaw);

const rows = Object.entries(summary)
  .filter(([key]) => key !== "total")
  .map(([file, data]) => ({
    file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
    statementsPct: Number(data?.statements?.pct ?? 0),
    statementsUncovered: Number(data?.statements?.total ?? 0) - Number(data?.statements?.covered ?? 0),
    branchesPct: Number(data?.branches?.pct ?? 0),
    branchesUncovered: Number(data?.branches?.total ?? 0) - Number(data?.branches?.covered ?? 0),
    linesPct: Number(data?.lines?.pct ?? 0),
    linesUncovered: Number(data?.lines?.total ?? 0) - Number(data?.lines?.covered ?? 0),
    functionsPct: Number(data?.functions?.pct ?? 0),
    functionsUncovered: Number(data?.functions?.total ?? 0) - Number(data?.functions?.covered ?? 0)
  }))
  .sort((a, b) => {
    if (b.linesUncovered !== a.linesUncovered) return b.linesUncovered - a.linesUncovered;
    return a.linesPct - b.linesPct;
  });

const top = rows.slice(0, 15);
if (top.length === 0) {
  console.log("No per-file coverage rows found.");
  process.exit(0);
}

console.log("Top uncovered hot paths (by uncovered lines):");
console.table(
  top.map((row) => ({
    file: row.file,
    "lines %": row.linesPct.toFixed(1),
    "lines uncovered": row.linesUncovered,
    "branches %": row.branchesPct.toFixed(1),
    "branches uncovered": row.branchesUncovered,
    "functions %": row.functionsPct.toFixed(1),
    "functions uncovered": row.functionsUncovered
  }))
);

const total = summary.total;
if (total) {
  console.log("Coverage totals:");
  console.table([
    {
      statements: `${Number(total.statements?.pct ?? 0).toFixed(1)}%`,
      branches: `${Number(total.branches?.pct ?? 0).toFixed(1)}%`,
      functions: `${Number(total.functions?.pct ?? 0).toFixed(1)}%`,
      lines: `${Number(total.lines?.pct ?? 0).toFixed(1)}%`
    }
  ]);
}
