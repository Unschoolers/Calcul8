import fs from "node:fs";
import path from "node:path";

const summaryEntries = [
  {
    label: "frontend",
    summaryPath: path.resolve("coverage", "coverage-summary.json")
  },
  {
    label: "api",
    summaryPath: path.resolve("apps/api/coverage", "coverage-summary.json")
  }
];

const existingSummaryEntries = summaryEntries.filter(({ summaryPath }) => fs.existsSync(summaryPath));

if (existingSummaryEntries.length === 0) {
  console.error("Coverage summary not found.");
  console.error("Run: npm run test:coverage:hotpaths");
  process.exit(1);
}

function createMetricCounts(metric) {
  return {
    covered: Number(metric?.covered ?? 0),
    total: Number(metric?.total ?? 0)
  };
}

function mergeMetricCounts(target, source) {
  target.covered += Number(source.covered ?? 0);
  target.total += Number(source.total ?? 0);
}

function createCombinedRow(file, data) {
  return {
    file,
    statements: createMetricCounts(data?.statements),
    branches: createMetricCounts(data?.branches),
    lines: createMetricCounts(data?.lines),
    functions: createMetricCounts(data?.functions)
  };
}

function percentage(metric) {
  if (!metric.total) return 100;
  return (metric.covered / metric.total) * 100;
}

function resolveSummaryFile(summaryPath, file) {
  if (path.isAbsolute(file)) {
    return file;
  }
  return path.resolve(path.dirname(summaryPath), file);
}

function createTotals() {
  return {
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 }
  };
}

function formatMetric(metric) {
  return `${percentage(metric).toFixed(1)}% (${metric.covered}/${metric.total})`;
}

function pad(value, width, align = "start") {
  const text = String(value);
  if (text.length >= width) return text;
  return align === "end"
    ? text.padStart(width, " ")
    : text.padEnd(width, " ");
}

function truncateMiddle(value, maxWidth) {
  const text = String(value);
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  const left = Math.ceil((maxWidth - 3) / 2);
  const right = Math.floor((maxWidth - 3) / 2);
  return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}

function printSection(title) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function printTable(headers, rows, aligns = []) {
  const widths = headers.map((header, index) => {
    const rowWidths = rows.map((row) => String(row[index] ?? "").length);
    return Math.max(String(header).length, ...rowWidths);
  });

  const formatRow = (row) => row
    .map((cell, index) => pad(cell, widths[index], aligns[index] ?? "start"))
    .join("  ");

  console.log(formatRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

const combinedRows = new Map();
const combinedTotals = createTotals();
const totalsBySource = new Map();

for (const { label, summaryPath } of existingSummaryEntries) {
  const summaryRaw = fs.readFileSync(summaryPath, "utf8");
  const summary = JSON.parse(summaryRaw);
  const sourceTotals = createTotals();

  for (const [file, data] of Object.entries(summary)) {
    if (file === "total") continue;
    const relativeFile = path.relative(process.cwd(), resolveSummaryFile(summaryPath, file)).replaceAll("\\", "/");
    const existing = combinedRows.get(relativeFile);
    if (!existing) {
      combinedRows.set(relativeFile, createCombinedRow(relativeFile, data));
      continue;
    }

    mergeMetricCounts(existing.statements, data?.statements);
    mergeMetricCounts(existing.branches, data?.branches);
    mergeMetricCounts(existing.lines, data?.lines);
    mergeMetricCounts(existing.functions, data?.functions);
  }

  mergeMetricCounts(combinedTotals.statements, summary.total?.statements);
  mergeMetricCounts(combinedTotals.branches, summary.total?.branches);
  mergeMetricCounts(combinedTotals.lines, summary.total?.lines);
  mergeMetricCounts(combinedTotals.functions, summary.total?.functions);

  mergeMetricCounts(sourceTotals.statements, summary.total?.statements);
  mergeMetricCounts(sourceTotals.branches, summary.total?.branches);
  mergeMetricCounts(sourceTotals.lines, summary.total?.lines);
  mergeMetricCounts(sourceTotals.functions, summary.total?.functions);
  totalsBySource.set(label, sourceTotals);
}

const rows = [...combinedRows.values()]
  .map((row) => ({
    file: row.file,
    statementsPct: percentage(row.statements),
    statementsUncovered: row.statements.total - row.statements.covered,
    branchesPct: percentage(row.branches),
    branchesUncovered: row.branches.total - row.branches.covered,
    linesPct: percentage(row.lines),
    linesUncovered: row.lines.total - row.lines.covered,
    functionsPct: percentage(row.functions),
    functionsUncovered: row.functions.total - row.functions.covered
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

console.log("Coverage Hotpaths Report");
console.log("========================");
console.log(
  `Loaded summaries: ${existingSummaryEntries.map(({ label }) => label).join(", ")}`
);

printSection("Top 15 Files By Uncovered Lines");
printTable(
  ["#", "File", "Lines", "Branches", "Functions"],
  top.map((row, index) => ([
    String(index + 1),
    truncateMiddle(row.file, 54),
    `${row.linesPct.toFixed(1)}% / ${row.linesUncovered} uncov`,
    `${row.branchesPct.toFixed(1)}% / ${row.branchesUncovered} uncov`,
    `${row.functionsPct.toFixed(1)}% / ${row.functionsUncovered} uncov`
  ])),
  ["end", "start", "end", "end", "end"]
);

printSection("Coverage Totals");
printTable(
  ["Scope", "Statements", "Branches", "Functions", "Lines"],
  [
    [
      "overall",
      formatMetric(combinedTotals.statements),
      formatMetric(combinedTotals.branches),
      formatMetric(combinedTotals.functions),
      formatMetric(combinedTotals.lines)
    ],
    ...[...totalsBySource.entries()].map(([label, totals]) => ([
      label,
      formatMetric(totals.statements),
      formatMetric(totals.branches),
      formatMetric(totals.functions),
      formatMetric(totals.lines)
    ]))
  ],
  ["start", "end", "end", "end", "end"]
);
