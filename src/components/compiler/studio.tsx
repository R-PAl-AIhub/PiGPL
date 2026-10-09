import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { EXAMPLES } from "@/compiler";
import { downloadText, resultToJSON, resultToReport } from "@/compiler/export";
import { STAGES, type StageId } from "@/compiler/types";
import { Button } from "@/components/ui/button";
import { StageViews } from "@/components/compiler/stage-views";
import { hydrateSource, phaseToStage, useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

const STAGE_COPY: Record<StageId, { title: string; blurb: string }> = {
  source: { title: "Source", blurb: "Characters of a PiGPL program, before any analysis." },
  lexer: { title: "Lexical analysis", blurb: "A scanner classifies each lexeme." },
  tokens: { title: "Token stream", blurb: "Characters become classified tokens." },
  parser: { title: "Parser", blurb: "Tokens reduce against the grammar." },
  ast: { title: "Abstract syntax tree", blurb: "Grammar structure becomes a tree." },
  symbols: { title: "Symbol table", blurb: "Declared names enter the table." },
  semantic: { title: "Semantic analysis", blurb: "The tree is type-checked and scoped." },
  ir: { title: "Three-address code", blurb: "The tree becomes intermediate instructions." },
  optimize: { title: "Optimization", blurb: "Semantics-preserving rewrites of TAC." },
  execute: { title: "Execute", blurb: "Optimized TAC runs and prints." },
  errors: { title: "Diagnostics", blurb: "Phase-tagged errors from the last compile." },
  grammar: { title: "Grammar", blurb: "The language the parser accepts." },
};

export function Studio() {
  const source = useStudio((s) => s.source);
  const result = useStudio((s) => s.result);
  const eventIndex = useStudio((s) => s.eventIndex);
  const playing = useStudio((s) => s.playing);
  const speed = useStudio((s) => s.speed);
  const follow = useStudio((s) => s.follow);
  const stage = useStudio((s) => s.stage);
  const exampleId = useStudio((s) => s.exampleId);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    hydrateSource();
    useStudio.getState().runCompile(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const ms = Math.round(1000 / Math.max(1, speed));
    const id = window.setInterval(() => {
      const st = useStudio.getState();
      if (!st.result || st.result.events.length === 0) {
        st.pause();
        return;
      }
      if (st.eventIndex >= st.result.events.length - 1) {
        st.pause();
        return;
      }
      const next = st.eventIndex + 1;
      const ev = st.result.events[next];
      useStudio.setState({
        eventIndex: next,
        stage: st.follow && ev ? phaseToStage(ev.phase) : st.stage,
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        useStudio.getState().togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        useStudio.getState().step(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        useStudio.getState().step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const event = result?.events[eventIndex] ?? null;
  const maxEventId = useMemo(() => {
    if (!result) return 0;
    if (!follow) return Number.MAX_SAFE_INTEGER;
    return event?.id ?? 0;
  }, [result, follow, event]);

  const errCount = result?.errors.length ?? 0;
  const copy = STAGE_COPY[stage];

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent font-mono text-sm font-semibold text-accent-fg">
            Pi
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-medium tracking-tight text-balance">PiGPL</h1>
            <p className="truncate text-sm text-muted">
              Watch a program become an executable representation
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useStudio.getState().setStage("grammar")}
          >
            <BookOpen />
            Grammar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result}
            onClick={() => {
              if (!result) return;
              downloadText("pigpl-report.txt", resultToReport(result));
            }}
          >
            <Download />
            Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result}
            onClick={() => {
              if (!result) return;
              downloadText("pigpl-compile.json", JSON.stringify(resultToJSON(result), null, 2), "application/json");
            }}
          >
            <Download />
            JSON
          </Button>
          <Button size="sm" onClick={() => useStudio.getState().runCompile(true)}>
            Compile
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-screen-2xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:p-6">
        <section className="flex min-h-0 flex-col rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] lg:col-span-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Source</h2>
            <span className="font-mono text-xs text-muted">.pig</span>
          </div>
          <label className="sr-only" htmlFor="example">
            Load example
          </label>
          <select
            id="example"
            className="mb-3 h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]"
            value={exampleId}
            suppressHydrationWarning
            onChange={(e) => {
              const id = e.target.value;
              if (id === "custom") return;
              useStudio.getState().loadExample(id);
            }}
          >
            <option value="custom">Custom program</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} — {ex.blurb}
              </option>
            ))}
          </select>
          <textarea
            value={source}
            onChange={(e) => useStudio.getState().setSource(e.target.value)}
            spellCheck={false}
            aria-label="PiGPL source"
            className="min-h-56 flex-1 resize-y rounded-md bg-elevated p-3 font-mono text-sm leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-accent/70 lg:min-h-96"
            suppressHydrationWarning
          />
          <p className="mt-3 px-1 text-xs text-muted">
            {result
              ? errCount
                ? `${errCount} diagnostic${errCount === 1 ? "" : "s"} · ${result.events.length} pipeline events`
                : `Valid · ${result.tokens.length} tokens · ${result.ir.length} TAC instructions`
              : "Compile to watch each transformation."}
          </p>
        </section>

        <section className="flex min-h-0 flex-col gap-4 lg:col-span-8">
            <nav
            aria-label="Compiler pipeline"
            className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]"
          >
            <ol className="flex flex-wrap items-center gap-1">
              {STAGES.map((s) => {
                const active = stage === s.id;
                const live = follow && event && s.phase === event.phase;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => useStudio.getState().setStage(s.id)}
                      className={cn(
                        "flex h-11 items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors duration-150",
                        active ? "bg-accent text-accent-fg" : "text-muted hover:bg-elevated hover:text-fg",
                        live && !active ? "ring-1 ring-accent/50" : "",
                      )}
                    >
                      <span className="font-mono text-xs opacity-70">{s.n}</span>
                      <span className="whitespace-nowrap">{s.label}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => useStudio.getState().setStage("errors")}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-md px-2.5 text-sm",
                    stage === "errors" ? "bg-accent text-accent-fg" : "text-muted hover:bg-elevated hover:text-fg",
                    errCount > 0 && stage !== "errors" ? "text-err" : "",
                  )}
                >
                  Errors
                  {errCount > 0 && (
                    <span className="rounded-full bg-err/20 px-2 py-0.5 font-mono text-xs text-err tabular-nums">
                      {errCount}
                    </span>
                  )}
                </button>
              </li>
            </ol>
          </nav>

          <div className="flex min-h-80 flex-1 flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-medium tracking-tight">{copy.title}</h2>
                <p className="text-sm text-muted text-pretty">{copy.blurb}</p>
              </div>
              {event && follow && (
                <p className="max-w-md truncate font-mono text-xs text-muted">{event.message}</p>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {result ? (
                <StageViews result={result} stage={stage} event={event} maxEventId={maxEventId} />
              ) : (
                <p className="text-sm text-muted">Compiling…</p>
              )}
            </div>
          </div>

          <ReplayBar />
        </section>
      </div>
    </div>
  );
}

function ReplayBar() {
  const result = useStudio((s) => s.result);
  const eventIndex = useStudio((s) => s.eventIndex);
  const playing = useStudio((s) => s.playing);
  const speed = useStudio((s) => s.speed);
  const total = result?.events.length ?? 0;
  const max = Math.max(0, total - 1);

  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] md:flex-row md:items-center">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Reset"
          onClick={() => useStudio.getState().seek(0)}
        >
          <RotateCcw />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Step back"
          onClick={() => useStudio.getState().step(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon"
          aria-label={playing ? "Pause" : "Play compilation"}
          onClick={() => useStudio.getState().togglePlay()}
          disabled={!result || total === 0}
        >
          {playing ? <Pause /> : <Play className="ml-px" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Step forward"
          onClick={() => useStudio.getState().step(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <label className="flex min-w-0 flex-1 items-center gap-3 px-2">
        <span className="sr-only">Timeline</span>
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(eventIndex, max)}
          onChange={(e) => useStudio.getState().seek(Number(e.target.value))}
          className="h-11 w-full accent-accent"
          disabled={total === 0}
          suppressHydrationWarning
        />
        <span className="w-20 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
          {total ? eventIndex + 1 : 0}/{total}
        </span>
      </label>
      <label className="flex items-center gap-2 px-2 text-xs text-muted">
        Speed
        <input
          type="range"
          min={2}
          max={28}
          value={speed}
          onChange={(e) => useStudio.getState().setSpeed(Number(e.target.value))}
          className="h-11 w-24 accent-accent"
          suppressHydrationWarning
        />
      </label>
    </div>
  );
}
