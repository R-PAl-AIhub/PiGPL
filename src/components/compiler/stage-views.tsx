import { Check, X } from "lucide-react";
import { AstTree } from "@/components/compiler/ast-tree";
import { GRAMMAR } from "@/compiler";
import type { CompileResult } from "@/compiler/pipeline";
import type { PipelineEvent, StageId } from "@/compiler/types";
import { cn } from "@/lib/utils";

function upTo<T extends { eventId: number }>(items: T[], max: number) {
  return items.filter((i) => i.eventId <= max);
}

export function StageViews({
  result,
  stage,
  event,
  maxEventId,
}: {
  result: CompileResult;
  stage: StageId;
  event: PipelineEvent | null;
  maxEventId: number;
}) {
  switch (stage) {
    case "source":
      return <SourceView source={result.source} loc={event?.loc} />;
    case "lexer":
    case "tokens":
      return <TokensView result={result} event={event} maxEventId={maxEventId} />;
    case "parser":
      return <ParserView result={result} event={event} maxEventId={maxEventId} />;
    case "ast":
      return <AstView result={result} event={event} maxEventId={maxEventId} />;
    case "symbols":
      return <SymbolsView result={result} maxEventId={maxEventId} />;
    case "semantic":
      return <SemanticView result={result} maxEventId={maxEventId} />;
    case "ir":
      return <TacView quads={upTo(result.ir, maxEventId)} event={event} title="Three-address code" />;
    case "optimize":
      return <OptimizeView result={result} event={event} maxEventId={maxEventId} />;
    case "execute":
      return <ExecuteView result={result} maxEventId={maxEventId} />;
    case "errors":
      return <ErrorsView result={result} />;
    case "grammar":
      return <GrammarView />;
    default:
      return null;
  }
}

export function SourceView({
  source,
  loc,
}: {
  source: string;
  loc?: { start: number; end: number; line: number };
}) {
  const lines = source.split("\n");
  let offset = 0;
  return (
    <div className="font-mono text-sm leading-relaxed">
      {lines.map((line, i) => {
        const start = offset;
        const end = offset + line.length;
        offset = end + 1;
        const hl = loc && loc.start < end && loc.end > start;
        const from = hl ? Math.max(loc.start - start, 0) : 0;
        const to = hl ? Math.min(loc.end - start, line.length) : 0;
        return (
          <div key={i} className="flex gap-4">
            <span className="w-8 shrink-0 select-none text-right text-muted tabular-nums">
              {i + 1}
            </span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all text-fg">
              {hl ? (
                <>
                  {line.slice(0, from)}
                  <mark className="rounded-xs bg-accent/25 text-fg">{line.slice(from, to)}</mark>
                  {line.slice(to)}
                </>
              ) : (
                line || " "
              )}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function TokensView({
  result,
  event,
  maxEventId,
}: {
  result: CompileResult;
  event: PipelineEvent | null;
  maxEventId: number;
}) {
  const tokens = upTo(result.tokens, maxEventId);
  const current = event?.kind === "token" ? event.id : event?.id;
  return (
    <div className="flex flex-col gap-5">
      <SourceView source={result.source} loc={event?.loc} />
      {tokens.length === 0 ? (
        <p className="text-sm text-muted">Characters become tokens as the lexer scans left to right.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tokens.map((t) => (
            <li
              key={t.eventId}
              className={cn(
                "rounded-sm px-2.5 py-1.5 font-mono text-xs shadow-[var(--shadow-border)]",
                t.eventId === current ? "bg-accent text-accent-fg" : "bg-elevated text-fg",
              )}
            >
              <span className="block text-xs uppercase tracking-wide opacity-70">{t.type}</span>
              {t.lexeme}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ParserView({
  result,
  event,
  maxEventId,
}: {
  result: CompileResult;
  event: PipelineEvent | null;
  maxEventId: number;
}) {
  const reductions = result.events.filter(
    (e) => e.phase === "parser" && e.kind === "reduce" && e.id <= maxEventId,
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <AstView result={result} event={event} maxEventId={maxEventId} />
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Reductions</h3>
        <ol className="flex max-h-80 flex-col gap-1 overflow-auto font-mono text-xs">
          {reductions.slice(-24).map((e) => (
            <li
              key={e.id}
              className={cn(
                "rounded-sm px-2 py-1.5",
                e.id === event?.id ? "bg-accent/15 text-fg" : "text-muted",
              )}
            >
              {e.message}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function AstView({
  result,
  event,
  maxEventId,
}: {
  result: CompileResult;
  event: PipelineEvent | null;
  maxEventId: number;
}) {
  if (!result.tree) {
    return <p className="text-sm text-muted">No AST — fix syntax errors first.</p>;
  }
  const currentId =
    typeof event?.payload?.id === "number" ? (event.payload.id as number) : event?.id;
  return <AstTree tree={result.tree} maxEventId={maxEventId} currentId={currentId} />;
}

function SymbolsView({ result, maxEventId }: { result: CompileResult; maxEventId: number }) {
  const rows = upTo(result.symbols, maxEventId);
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Identifiers enter the table as declarations are checked.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[28rem] border-collapse font-mono text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Scope</th>
            <th className="px-3 py-2">Kind</th>
            <th className="px-3 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={`${s.scope}-${s.name}-${s.eventId}`} className="border-t border-border">
              <td className="px-3 py-2 text-fg">{s.name}</td>
              <td className="px-3 py-2 text-muted">{s.varType}</td>
              <td className="px-3 py-2 text-muted">{s.scope}</td>
              <td className="px-3 py-2 text-muted">{s.kind}</td>
              <td className="px-3 py-2 text-muted">
                {s.value === null || s.value === undefined || typeof s.value === "object"
                  ? "—"
                  : String(s.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SemanticView({ result, maxEventId }: { result: CompileResult; maxEventId: number }) {
  const checks = upTo(result.checks, maxEventId);
  if (checks.length === 0) {
    return <p className="text-sm text-muted">Semantic checks run after a valid parse.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 font-mono text-sm">
      {checks.map((c) => (
        <li
          key={c.eventId}
          className={cn("flex items-start gap-2 rounded-sm px-2 py-1.5", c.ok ? "text-ok" : "text-err")}
        >
          {c.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span>{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

function TacView({
  quads,
  event,
  title,
}: {
  quads: CompileResult["ir"];
  event: PipelineEvent | null;
  title: string;
}) {
  if (quads.length === 0) {
    return <p className="text-sm text-muted">{title} appears instruction by instruction from the AST.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[32rem] border-collapse font-mono text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted">
            <th className="w-12 px-3 py-2">#</th>
            <th className="px-3 py-2">Result</th>
            <th className="px-3 py-2">Op</th>
            <th className="px-3 py-2">Arg1</th>
            <th className="px-3 py-2">Arg2</th>
          </tr>
        </thead>
        <tbody>
          {quads.map((q, i) => (
            <tr
              key={q.id}
              className={cn(
                "border-t border-border",
                q.eventId === event?.id ? "bg-accent/15" : "",
              )}
            >
              <td className="px-3 py-1.5 text-muted tabular-nums">{i}</td>
              <td className="px-3 py-1.5 text-fg">{q.result ?? "—"}</td>
              <td className="px-3 py-1.5 text-muted">{q.op}</td>
              <td className="px-3 py-1.5 text-muted">{q.arg1 ?? "—"}</td>
              <td className="px-3 py-1.5 text-muted">{q.arg2 ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptimizeView({
  result,
  event,
  maxEventId,
}: {
  result: CompileResult;
  event: PipelineEvent | null;
  maxEventId: number;
}) {
  const steps = upTo(result.optimizations, maxEventId);
  const showOptimized = steps.length > 0;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Before</h3>
        <TacView quads={result.ir} event={event} title="Unoptimized TAC" />
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          {showOptimized ? "After" : "Transformations"}
        </h3>
        {showOptimized ? (
          <TacView quads={result.optimizedIr} event={event} title="Optimized TAC" />
        ) : (
          <p className="text-sm text-muted">Constant folding and dead-temp elimination apply next.</p>
        )}
        {steps.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1 font-mono text-xs text-muted">
            {steps.slice(-12).map((s) => (
              <li
                key={s.id}
                className={cn("rounded-sm px-2 py-1", s.eventId === event?.id ? "bg-accent/15 text-fg" : "")}
              >
                <span className="text-fg">{s.kind}</span> · {s.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ExecuteView({ result, maxEventId }: { result: CompileResult; maxEventId: number }) {
  if (!result.execution) {
    return (
      <p className="text-sm text-muted">
        Execution runs on optimized TAC after a semantically valid program.
      </p>
    );
  }
  const prints = result.events.filter(
    (e) => e.phase === "execute" && e.kind === "print" && e.id <= maxEventId,
  );
  const done = result.events.some((e) => e.phase === "execute" && e.kind === "done" && e.id <= maxEventId);
  return (
    <div className="rounded-md bg-elevated p-4 shadow-[var(--shadow-border)]">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Program output</p>
      <pre className="min-h-32 font-mono text-sm leading-relaxed text-fg">
        {prints.map((p) => p.message).join("\n") || (done ? "(no output)" : "Running…")}
      </pre>
      {result.execution.error && (
        <p className="mt-3 text-sm text-err">{result.execution.error.message}</p>
      )}
    </div>
  );
}

function ErrorsView({ result }: { result: CompileResult }) {
  if (result.errors.length === 0) {
    return <p className="text-sm text-ok">No diagnostics. This program is valid PiGPL.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {result.errors.map((e, i) => (
        <li key={i} className="rounded-md border border-err/40 bg-err/10 px-4 py-3">
          <p className="font-mono text-xs text-err">{e.phase} error</p>
          <p className="mt-1 text-sm text-fg">{e.message}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            Line {e.line || "?"} · column {e.column || "?"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function GrammarView() {
  return (
    <pre className="overflow-auto font-mono text-xs leading-relaxed text-muted whitespace-pre">
      {GRAMMAR}
    </pre>
  );
}
