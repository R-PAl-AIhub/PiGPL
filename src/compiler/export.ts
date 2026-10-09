import type { CompileResult } from "./pipeline.ts";

export function resultToJSON(result: CompileResult) {
  return {
    tokens: result.tokens.map((t) => ({
      type: t.type,
      lexeme: t.lexeme,
      line: t.line,
      column: t.column,
    })),
    ast: result.tree,
    symbolTable: result.symbols.map((s) => ({
      name: s.name,
      type: s.varType,
      scope: s.scope,
      kind: s.kind,
      value: s.value,
    })),
    semanticChecks: result.checks.map((c) => ({
      ok: c.ok,
      message: c.message,
    })),
    tac: result.ir.map((q) => q.text),
    optimizedTac: result.optimizedIr.map((q) => q.text),
    optimizations: result.optimizations.map((s) => ({
      kind: s.kind,
      message: s.message,
      before: s.before,
      after: s.after,
    })),
    output: result.execution?.output ?? [],
    errors: result.errors,
  };
}

export function resultToReport(result: CompileResult): string {
  const lines: string[] = [];
  lines.push("PiGPL compilation report");
  lines.push("=".repeat(48));
  lines.push("");
  lines.push("-- Source --");
  lines.push(result.source.trimEnd());
  lines.push("");
  lines.push("-- Tokens --");
  for (const t of result.tokens) {
    lines.push(`  ${String(t.line).padStart(3)}:${String(t.column).padStart(3)}  ${t.type.padEnd(12)} ${t.lexeme}`);
  }
  lines.push("");
  lines.push("-- Symbol table --");
  for (const s of result.symbols) {
    lines.push(`  ${s.name.padEnd(12)} ${s.varType.padEnd(18)} ${s.scope.padEnd(16)} ${s.kind}`);
  }
  lines.push("");
  lines.push("-- Semantic checks --");
  for (const c of result.checks) {
    lines.push(`  ${c.ok ? "✓" : "✗"} ${c.message}`);
  }
  lines.push("");
  lines.push("-- Three-address code --");
  result.ir.forEach((q, i) => lines.push(`  ${String(i).padStart(3)}  ${q.text}`));
  lines.push("");
  lines.push("-- Optimized TAC --");
  result.optimizedIr.forEach((q, i) => lines.push(`  ${String(i).padStart(3)}  ${q.text}`));
  if (result.optimizations.length) {
    lines.push("");
    lines.push("-- Optimizations --");
    for (const s of result.optimizations) {
      lines.push(`  [${s.kind}] ${s.message}`);
      lines.push(`      ${s.before}  →  ${s.after}`);
    }
  }
  if (result.execution) {
    lines.push("");
    lines.push("-- Output --");
    if (result.execution.output.length === 0) lines.push("  (no output)");
    for (const o of result.execution.output) lines.push(`  ${o}`);
  }
  if (result.errors.length) {
    lines.push("");
    lines.push("-- Errors --");
    for (const e of result.errors) {
      lines.push(`  [${e.phase}] ${e.message}  (line ${e.line}, col ${e.column})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
