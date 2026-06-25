// ABOUTME: maps a ResearchEvent to a single progress line, or null when deliberately suppressed.
// ABOUTME: drains an event async iterable, writing one line per surfaced event plus a heartbeat dot on silence.
import type { ResearchEvent } from "@steel-dev/atlas";
import { collapse } from "./domain/shared.js";

/**
 * Render one progress line for an event, or null to suppress it.
 *
 * Atlas emits 28 event types; every type is handled explicitly. A handful of
 * high-volume, low-signal stream types (report deltas, per-claim extractions,
 * raw tool blobs) are intentionally suppressed to keep the terminal readable.
 * Free-text fields are collapsed to one line via the shared collapse() helper so
 * a model-generated newline can never break the one-line-per-event contract.
 * The default arm is an exhaustiveness guard: if Atlas adds a new variant, this
 * becomes a compile error so it gets an explicit case (to surface or suppress).
 */
export function describeEvent(event: ResearchEvent): string | null {
  switch (event.type) {
    case "run.started":
      return `run ${event.runId}: ${event.effort}, budget $${event.budgetUSD.toFixed(2)}`;
    case "plan.updated":
      return `plan: ${collapse(event.rationale)}`;
    case "lead.recontexted":
      return `lead: re-context session ${event.session}`;
    case "checklist.built":
      return `checklist: ${event.items} items (${event.central} central, ${event.volatile} volatile)`;
    case "coverage.assessed":
      return `coverage round ${event.round}: ${event.answered ? "answered" : `${event.gaps.length} gaps`}`;
    case "agent.spawned":
      return `agent ${event.agentId}: ${event.role}, depth ${event.depth}, ${collapse(event.task)}`;
    case "agent.returned":
      return `agent ${event.agentId} done: ${collapse(event.note)} (+${event.claimsAdded} claims, $${event.spentUSD.toFixed(4)}, ${event.stopReason})`;
    case "search.completed":
      return `search ${event.provider}: ${event.results} results for "${collapse(event.query)}"`;
    case "search.failed":
      return `search failed for "${collapse(event.query)}": ${collapse(event.error)}`;
    case "source.fetched":
      return `source ${event.sourceId}: ${collapse(event.title)} via ${event.via}`;
    case "source.failed":
      return `source failed: ${event.url} (${collapse(event.reason)})`;
    case "claim.extracted":
      // Suppressed: fires once per claim (dozens per source) before verification.
      // The aggregate arrives via extraction.completed; the verdict via claim.verified.
      return null;
    case "extraction.completed":
      return `extract ${event.sourceId}: ${event.count} claims${event.unsupported ? `, ${event.unsupported} unsupported` : ""}${event.error ? ` — ${collapse(event.error)}` : ""}`;
    case "claim.verified":
      return `claim ${event.claimId}: ${event.status} (${event.votes})`;
    case "report.drafting":
      return "drafting report";
    case "report.delta":
      // Suppressed: streaming token chunks, many per second. report.drafting /
      // report.completed bracket the section; the full text is written via --out/--json.
      return null;
    case "report.reset":
      // Suppressed: internal report-state, no standalone meaning.
      return null;
    case "report.completed":
      return `report complete (${event.report.length} chars)`;
    case "citation.bound":
      return `citation ${event.claimId}: ${event.ok ? "bound" : "unsupported"}`;
    case "budget.warning":
      return `budget warning: $${event.spentUSD.toFixed(4)} / $${event.limitUSD.toFixed(2)} (${(event.fraction * 100).toFixed(0)}%)`;
    case "safety.flag":
      return `safety ${event.kind}: ${collapse(event.detail)}${event.url ? ` (${event.url})` : ""}`;
    case "pricing.missing":
      return `pricing missing for ${event.modelId}: ${collapse(event.detail)}`;
    case "model.fallback":
      return `model fallback for ${event.roles.join(", ")}: ${event.modelId} (${collapse(event.detail)})`;
    case "run_code.unavailable":
      return `run_code unavailable: ${collapse(event.detail)}`;
    case "rate.limited":
      return `rate limited: retry in ${event.retryAfterSeconds}s`;
    case "tool.event":
      // Suppressed: untyped tool result blobs with no stable schema to format.
      return null;
    case "run.completed":
      return `completed: $${event.stats.costUSD.toFixed(4)}, ${event.stats.sourcesFetched} sources, ${event.stats.claimsConfirmed} confirmed claims, stop=${event.stats.stopReason}`;
    case "run.error":
      return `error: ${collapse(event.message)}${event.recoverable ? " (recoverable)" : ""}`;
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return null;
    }
  }
}

/** Minimal write target so tests can pass a buffer and the CLI can pass process.stderr. */
export interface ProgressSink {
  write(chunk: string): void;
}

/** A periodic life-signal started after each line and stopped on the next event. */
export interface Heartbeat {
  start(cb: () => void): void;
  stop(): void;
}

export interface ProgressOptions {
  quiet?: boolean;
}

/** Outcome of draining a research event stream. */
export interface StreamProgressResult {
  /** True if a terminal run.error event was surfaced to the sink. */
  reportedTerminalError: boolean;
}

/** Production heartbeat backed by setInterval. Cleared on stop so the process can exit. */
export function defaultHeartbeat(intervalMs = 5000): Heartbeat {
  let handle: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    if (handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
  };
  return {
    start(cb: () => void) {
      stop();
      handle = setInterval(cb, intervalMs);
    },
    stop,
  };
}

/**
 * Consume a research event stream, writing one line per surfaced event to the
 * sink. During silent stretches the heartbeat writes dots so the terminal is
 * never visually dead; a dot run is newline-wrapped before the next real line,
 * and also closed with a newline if the stream ends mid-dot-run. In quiet mode
 * (opts.quiet) events are drained with no output and no heartbeat. The heartbeat
 * is always stopped in a finally block (normal end, error, quiet, or the
 * iterator being torn down), so no timer is left dangling. Returns whether a
 * terminal run.error was surfaced, so a caller can avoid duplicating it.
 */
export async function streamProgress(
  events: AsyncIterable<ResearchEvent>,
  sink: ProgressSink,
  opts: ProgressOptions = {},
  heartbeat: Heartbeat = defaultHeartbeat(),
): Promise<StreamProgressResult> {
  let dotsWritten = false;
  let reportedTerminalError = false;

  const emit = (line: string): void => {
    if (dotsWritten) {
      sink.write("\n");
      dotsWritten = false;
    }
    heartbeat.stop();
    sink.write(`${line}\n`);
    heartbeat.start(() => {
      sink.write(".");
      dotsWritten = true;
    });
  };

  try {
    for await (const event of events) {
      if (opts.quiet) continue;
      const line = describeEvent(event);
      if (line) {
        if (event.type === "run.error") reportedTerminalError = true;
        emit(line);
      }
    }
  } finally {
    if (dotsWritten) sink.write("\n");
    heartbeat.stop();
  }

  return { reportedTerminalError };
}
