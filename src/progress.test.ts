// ABOUTME: unit + behavior tests for the progress module (describeEvent + streamProgress).
// ABOUTME: uses node:test + a fake heartbeat and captured sink so no real timers or stderr are involved.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResearchEvent } from "@steel-dev/atlas";
import { describeEvent, defaultHeartbeat, streamProgress, type Heartbeat, type ProgressSink } from "./progress.js";

// --- describeEvent: one assertion per surfaced event type --------------------

test("describeEvent: run.started", () => {
  const line = describeEvent({ type: "run.started", runId: "r1", question: "q", effort: "balanced", budgetUSD: 2 });
  assert.equal(line, "run r1: balanced, budget $2.00");
});

test("describeEvent: plan.updated (the planning-gap signal)", () => {
  const line = describeEvent({ type: "plan.updated", rationale: "narrow to SEC + trials" });
  assert.equal(line, "plan: narrow to SEC + trials");
});

test("describeEvent: plan.updated collapses model newlines into one line", () => {
  const line = describeEvent({ type: "plan.updated", rationale: "step one\nstep two\r\nstep three" });
  assert.equal(line, "plan: step one step two step three");
});

test("describeEvent: lead.recontexted", () => {
  const line = describeEvent({ type: "lead.recontexted", session: 2 });
  assert.equal(line, "lead: re-context session 2");
});

test("describeEvent: checklist.built", () => {
  const line = describeEvent({ type: "checklist.built", items: 5, central: 2, volatile: 1 });
  assert.equal(line, "checklist: 5 items (2 central, 1 volatile)");
});

test("describeEvent: coverage.assessed answered", () => {
  const line = describeEvent({ type: "coverage.assessed", round: 1, answered: true, gaps: [] });
  assert.equal(line, "coverage round 1: answered");
});

test("describeEvent: coverage.assessed gaps", () => {
  const line = describeEvent({ type: "coverage.assessed", round: 2, answered: false, gaps: ["a", "b", "c"] });
  assert.equal(line, "coverage round 2: 3 gaps");
});

test("describeEvent: agent.spawned", () => {
  const line = describeEvent({ type: "agent.spawned", agentId: "a1", role: "research", task: "find filings", grantUSD: 0.5, depth: 1 });
  assert.equal(line, "agent a1: research, depth 1, find filings");
});

test("describeEvent: agent.returned", () => {
  const line = describeEvent({ type: "agent.returned", agentId: "a1", role: "research", note: "ok", claimsAdded: 3, spentUSD: 0.12, stopReason: "completed" });
  assert.equal(line, "agent a1 done: ok (+3 claims, $0.1200, completed)");
});

test("describeEvent: agent.returned collapses newlines in note", () => {
  const line = describeEvent({ type: "agent.returned", agentId: "a1", role: "research", note: "line a\nline b", claimsAdded: 0, spentUSD: 0, stopReason: "stopped" });
  assert.equal(line, "agent a1 done: line a line b (+0 claims, $0.0000, stopped)");
});

test("describeEvent: search.completed", () => {
  const line = describeEvent({ type: "search.completed", query: "mrna cmv", provider: "tavily", results: 5 });
  assert.equal(line, 'search tavily: 5 results for "mrna cmv"');
});

test("describeEvent: search.failed", () => {
  const line = describeEvent({ type: "search.failed", query: "x", error: "boom" });
  assert.equal(line, 'search failed for "x": boom');
});

test("describeEvent: source.fetched", () => {
  const line = describeEvent({ type: "source.fetched", sourceId: "s1", url: "u", title: "A Filing", via: "basic", chars: 10 });
  assert.equal(line, "source s1: A Filing via basic");
});

test("describeEvent: source.fetched collapses newlines in title", () => {
  const line = describeEvent({ type: "source.fetched", sourceId: "s1", url: "u", title: "Title\n  with break", via: "steel_scrape", chars: 10 });
  assert.equal(line, "source s1: Title with break via steel_scrape");
});

test("describeEvent: source.failed", () => {
  const line = describeEvent({ type: "source.failed", url: "https://e/u", reason: "HTTP 403" });
  assert.equal(line, "source failed: https://e/u (HTTP 403)");
});

test("describeEvent: claim.verified", () => {
  const line = describeEvent({ type: "claim.verified", claimId: "c1", status: "confirmed", votes: "2/3" });
  assert.equal(line, "claim c1: confirmed (2/3)");
});

test("describeEvent: extraction.completed", () => {
  const line = describeEvent({ type: "extraction.completed", sourceId: "s2", url: "u", count: 4, unsupported: 1 });
  assert.equal(line, "extract s2: 4 claims, 1 unsupported");
});

test("describeEvent: extraction.completed with error", () => {
  const line = describeEvent({ type: "extraction.completed", sourceId: "s2", url: "u", count: 0, unsupported: 0, error: "parse failed" });
  assert.equal(line, "extract s2: 0 claims — parse failed");
});

test("describeEvent: report.drafting", () => {
  const line = describeEvent({ type: "report.drafting" });
  assert.equal(line, "drafting report");
});

test("describeEvent: report.completed", () => {
  const line = describeEvent({ type: "report.completed", report: "hello world" });
  assert.equal(line, "report complete (11 chars)");
});

test("describeEvent: citation.bound ok", () => {
  const line = describeEvent({ type: "citation.bound", claimId: "c1", sentence: "s", ok: true });
  assert.equal(line, "citation c1: bound");
});

test("describeEvent: citation.bound unsupported", () => {
  const line = describeEvent({ type: "citation.bound", claimId: "c1", sentence: "s", ok: false });
  assert.equal(line, "citation c1: unsupported");
});

test("describeEvent: budget.warning", () => {
  const line = describeEvent({ type: "budget.warning", spentUSD: 0.5, limitUSD: 2, fraction: 0.25 });
  assert.equal(line, "budget warning: $0.5000 / $2.00 (25%)");
});

test("describeEvent: safety.flag with url", () => {
  const line = describeEvent({ type: "safety.flag", kind: "ssrf", detail: "internal IP", url: "http://10.0.0.1" });
  assert.equal(line, "safety ssrf: internal IP (http://10.0.0.1)");
});

test("describeEvent: safety.flag without url leaves no trailing parens", () => {
  const line = describeEvent({ type: "safety.flag", kind: "injection", detail: "odd input" });
  assert.equal(line, "safety injection: odd input");
});

test("describeEvent: pricing.missing", () => {
  const line = describeEvent({ type: "pricing.missing", modelId: "gpt-x", detail: "no rate card" });
  assert.equal(line, "pricing missing for gpt-x: no rate card");
});

test("describeEvent: model.fallback", () => {
  const line = describeEvent({ type: "model.fallback", roles: ["research", "verify"], modelId: "gpt-4o-mini", detail: "primary 429" });
  assert.equal(line, "model fallback for research, verify: gpt-4o-mini (primary 429)");
});

test("describeEvent: run_code.unavailable", () => {
  const line = describeEvent({ type: "run_code.unavailable", detail: "no sandbox" });
  assert.equal(line, "run_code unavailable: no sandbox");
});

test("describeEvent: rate.limited (explains the wait)", () => {
  const line = describeEvent({ type: "rate.limited", retryAfterSeconds: 120 });
  assert.equal(line, "rate limited: retry in 120s");
});

test("describeEvent: run.completed", () => {
  const line = describeEvent({
    type: "run.completed",
    stats: {
      effort: "balanced", searches: 10, searchCacheHits: 0, modelCacheHits: 0, modelGatePeakWidth: 4,
      sourcesFetched: 13, sourcesFailed: 0, claimsExtracted: 0, claimsUnsupported: 0, claimsVerified: 0,
      claimsConfirmed: 0, claimsScreened: 0, claimsContested: 0, claimsRefuted: 0, citationsBound: 0,
      citationsUnsupported: 0, dupesDropped: 0, agentsSpawned: 0, maxDepth: 0, singleAgent: true,
      tokens: { lead: { input: 1, output: 2 } }, costUSD: 0.5422, durationMs: 1000,
      budgetExhausted: false, tokensExhausted: false, agentCapReached: false, stopReason: "completed",
    },
  });
  assert.equal(line, "completed: $0.5422, 13 sources, 0 confirmed claims, stop=completed");
});

test("describeEvent: run.error recoverable", () => {
  const line = describeEvent({ type: "run.error", message: "boom", recoverable: true });
  assert.equal(line, "error: boom (recoverable)");
});

test("describeEvent: run.error fatal", () => {
  const line = describeEvent({ type: "run.error", message: "boom", recoverable: false });
  assert.equal(line, "error: boom");
});

// --- describeEvent: deliberately suppressed types return null ----------------

for (const suppressed of [
  { type: "report.delta", text: "chunk" },
  { type: "report.reset" },
  { type: "claim.extracted", claimId: "c1", sourceId: "s1", text: "a claim", importance: "central" },
  { type: "tool.event", tool: "clinical_trials", data: { n: 3 } },
] as ResearchEvent[]) {
  test(`describeEvent: ${suppressed.type} suppressed (null)`, () => {
    assert.equal(describeEvent(suppressed), null);
  });
}

// --- streamProgress behavior --------------------------------------------------

function fakeHeartbeat() {
  let cb: (() => void) | null = null;
  const status = { running: false, startedEver: false };
  const hb: Heartbeat & { tick(): void; status: typeof status } = {
    start(fn: () => void) { cb = fn; status.running = true; status.startedEver = true; },
    stop() { cb = null; status.running = false; },
    tick() { if (cb) cb(); },
    status,
  };
  return hb;
}

function captureSink() {
  let buf = "";
  const sink: ProgressSink = { write: (c: string) => { buf += c; } };
  return { sink, getOut: () => buf };
}

const runStarted: ResearchEvent = { type: "run.started", runId: "r1", question: "q", effort: "balanced", budgetUSD: 2 };
const planUpdated: ResearchEvent = { type: "plan.updated", rationale: "narrow to SEC" };

test("streamProgress: surfaces events to the sink, newline-terminated", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() { yield runStarted; yield planUpdated; }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(), "run r1: balanced, budget $2.00\nplan: narrow to SEC\n");
});

test("streamProgress: suppressed events are skipped without a blank line", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  const delta: ResearchEvent = { type: "report.delta", text: "a streaming chunk" };
  async function* events() { yield runStarted; yield delta; yield planUpdated; }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(), "run r1: balanced, budget $2.00\nplan: narrow to SEC\n");
});

test("streamProgress: quiet drains the stream without writing or starting the heartbeat", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  let yielded = 0;
  async function* events() {
    for (const e of [runStarted, planUpdated]) {
      yielded++;
      yield e;
    }
  }
  await streamProgress(events(), sink, { quiet: true }, hb);
  assert.equal(yielded, 2, "the stream was actually consumed");
  assert.equal(getOut(), "");
  assert.equal(hb.status.startedEver, false);
});

test("streamProgress: a heartbeat dot run is newline-wrapped before the next real line", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() {
    yield runStarted;
    hb.tick(); // simulate silence elapsing before the next event
    yield planUpdated;
  }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(),"run r1: balanced, budget $2.00\n.\nplan: narrow to SEC\n");
});

test("streamProgress: multiple dots accumulate then wrap", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() {
    yield runStarted;
    hb.tick();
    hb.tick();
    yield planUpdated;
  }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(),"run r1: balanced, budget $2.00\n..\nplan: narrow to SEC\n");
});

test("streamProgress: no leading newline when no dots preceded the first event", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() { yield runStarted; }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(),"run r1: balanced, budget $2.00\n");
});

test("streamProgress: heartbeat is stopped after normal completion", async () => {
  const { sink } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() { yield runStarted; yield planUpdated; }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(hb.status.running, false);
  assert.equal(hb.status.startedEver, true);
});

test("streamProgress: heartbeat is stopped even when the stream throws", async () => {
  const { sink } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() {
    yield runStarted;
    throw new Error("stream blew up");
  }
  await assert.rejects(streamProgress(events(), sink, {}, hb), /stream blew up/);
  assert.equal(hb.status.running, false);
});

test("streamProgress: a trailing dot run is closed with a newline at end of stream", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() {
    yield runStarted;
    hb.tick();
  }
  await streamProgress(events(), sink, {}, hb);
  assert.equal(getOut(), "run r1: balanced, budget $2.00\n.\n");
});

test("streamProgress: a trailing dot run is closed even when the stream throws", async () => {
  const { sink, getOut } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() {
    yield runStarted;
    hb.tick();
    throw new Error("late boom");
  }
  await assert.rejects(streamProgress(events(), sink, {}, hb), /late boom/);
  assert.equal(getOut(), "run r1: balanced, budget $2.00\n.\n");
  assert.equal(hb.status.running, false);
});

test("defaultHeartbeat: the real timer fires the callback and stop clears it", async () => {
  const hb = defaultHeartbeat(10);
  let ticks = 0;
  // Resolve on the first fire so the assertion is event-driven, not wall-clock dependent.
  await new Promise<void>((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error("real timer did not fire")), 1000);
    hb.start(() => { ticks++; clearTimeout(guard); resolve(); });
  });
  hb.stop();
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  assert.equal(ticks, 1, "fired exactly once, then stop() prevented further ticks");
});

test("streamProgress: reports a terminal error when run.error is surfaced", async () => {
  const { sink } = captureSink();
  const hb = fakeHeartbeat();
  const err: ResearchEvent = { type: "run.error", message: "kaboom", recoverable: false };
  async function* events() { yield runStarted; yield err; }
  const result = await streamProgress(events(), sink, {}, hb);
  assert.equal(result.reportedTerminalError, true);
});

test("streamProgress: reports no terminal error on a clean stream", async () => {
  const { sink } = captureSink();
  const hb = fakeHeartbeat();
  async function* events() { yield runStarted; yield planUpdated; }
  const result = await streamProgress(events(), sink, {}, hb);
  assert.equal(result.reportedTerminalError, false);
});
