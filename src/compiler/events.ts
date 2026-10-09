import type { Phase, PipelineEvent, SourceLoc } from "./types.ts";

export class EventLog {
  events: PipelineEvent[] = [];
  private nextId = 1;

  emit(
    phase: Phase,
    kind: string,
    message: string,
    loc?: SourceLoc,
    payload?: Record<string, unknown>,
  ): PipelineEvent {
    const event: PipelineEvent = {
      id: this.nextId++,
      phase,
      kind,
      message,
      loc,
      payload,
    };
    this.events.push(event);
    return event;
  }
}
