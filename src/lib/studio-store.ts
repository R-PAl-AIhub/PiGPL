import { create } from "zustand";
import { compile, EXAMPLES, type CompileResult } from "@/compiler";
import type { PipelineEvent, StageId } from "@/compiler/types";

const STORAGE_KEY = "pigpl-source-v1";
const DEFAULT_SOURCE = EXAMPLES[0]!.source;
const DEFAULT_RESULT = compile(DEFAULT_SOURCE);

function phaseToStage(phase: PipelineEvent["phase"]): StageId {
  switch (phase) {
    case "lexer":
      return "tokens";
    case "parser":
      return "parser";
    case "ast":
      return "ast";
    case "symbols":
      return "symbols";
    case "semantic":
      return "semantic";
    case "ir":
      return "ir";
    case "optimize":
      return "optimize";
    case "execute":
      return "execute";
    default:
      return "source";
  }
}

export interface StudioState {
  source: string;
  result: CompileResult | null;
  eventIndex: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  stage: StageId;
  exampleId: string;
  setSource: (source: string) => void;
  loadExample: (id: string) => void;
  runCompile: (autoplay?: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  step: (delta: number) => void;
  seek: (index: number) => void;
  setSpeed: (speed: number) => void;
  setStage: (stage: StageId) => void;
  currentEvent: () => PipelineEvent | null;
}

export const useStudio = create<StudioState>((set, get) => ({
  source: DEFAULT_SOURCE,
  result: DEFAULT_RESULT,
  eventIndex: 0,
  playing: false,
  speed: 10,
  follow: false,
  stage: "tokens",
  exampleId: EXAMPLES[0]!.id,

  setSource: (source) => set({ source, exampleId: "custom" }),

  loadExample: (id) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    set({ source: ex.source, exampleId: id });
  },

  runCompile: (autoplay = true) => {
    const { source } = get();
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      /* ignore */
    }
    const result = compile(source);
    set({
      result,
      eventIndex: 0,
      playing: autoplay && result.events.length > 0,
      follow: true,
      stage: "tokens",
    });
  },

  play: () => {
    const { result, eventIndex } = get();
    if (!result || result.events.length === 0) return;
    const atEnd = eventIndex >= result.events.length - 1;
    set({
      playing: true,
      follow: true,
      eventIndex: atEnd ? 0 : eventIndex,
    });
  },

  pause: () => set({ playing: false }),

  togglePlay: () => {
    const { playing } = get();
    if (playing) get().pause();
    else get().play();
  },

  step: (delta) => {
    const { result, eventIndex, follow } = get();
    if (!result) return;
    const max = Math.max(0, result.events.length - 1);
    const next = Math.min(max, Math.max(0, eventIndex + delta));
    const ev = result.events[next];
    set({
      eventIndex: next,
      playing: false,
      stage: follow && ev ? phaseToStage(ev.phase) : get().stage,
    });
  },

  seek: (index) => {
    const { result, follow } = get();
    if (!result) return;
    const max = Math.max(0, result.events.length - 1);
    const next = Math.min(max, Math.max(0, index));
    const ev = result.events[next];
    set({
      eventIndex: next,
      playing: false,
      stage: follow && ev ? phaseToStage(ev.phase) : get().stage,
    });
  },

  setSpeed: (speed) => set({ speed: Math.min(40, Math.max(1, speed)) }),

  setStage: (stage) => {
    const { result } = get();
    if (result) {
      const ev = result.events.find((e) => phaseToStage(e.phase) === stage);
      if (ev) {
        set({ stage, follow: false, playing: false, eventIndex: ev.id - 1 });
        return;
      }
    }
    set({ stage, follow: false, playing: false });
  },

  currentEvent: () => {
    const { result, eventIndex } = get();
    return result?.events[eventIndex] ?? null;
  },
}));

export function hydrateSource() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim() && saved !== useStudio.getState().source) {
      useStudio.setState({ source: saved, exampleId: "custom" });
      useStudio.getState().runCompile(false);
    }
  } catch {
    /* ignore */
  }
}

export { phaseToStage };
