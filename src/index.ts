#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  Atlas,
  basicFetch,
  brave,
  exa,
  fileStore,
  steel,
  tavily,
  type AtlasConfig,
  type Budget,
  type Effort,
  type FetchProvider,
  type ResearchResult,
  type SearchProvider,
} from "@steel-dev/atlas";
import { clinicaltrials } from "./domain/clinicaltrials.js";
import { edgar } from "./domain/edgar.js";
import { pubmed } from "./domain/pubmed.js";
import { env } from "./domain/shared.js";
import {
  parseModelProfile,
  resolveModelRouting,
  type ModelProfile,
} from "./model-routing.js";
import { streamProgress } from "./progress.js";

const USAGE = `atlas-demo: public-biotech diligence researcher

Usage:
  npm run research -- [options]

Options:
      --company NAME       Public company name (default: Moderna)
      --ticker SYMBOL      Ticker symbol (default: MRNA)
      --topic TEXT         Program, product, or risk focus (default: CMV vaccine program)
      --profile NAME       hybrid | high-stakes | cheap (default: MODEL_PROFILE or hybrid)
      --effort LEVEL       fast | balanced | deep | max (default: balanced)
      --budget USD         Best-effort Atlas budget cap
      --store DIR          Persist Atlas run journal for resume/debug
      --out FILE           Write markdown report to a file
      --json FILE          Write full ResearchResult JSON to a file
      --quiet              Suppress progress events
  -h, --help               Show this help

Example:
  npm run research -- --company "Moderna" --ticker MRNA --topic "CMV vaccine program" --budget 2 --out reports/moderna-cmv.md
`;

interface CliOptions {
  company: string;
  ticker: string;
  topic: string;
  profile: ModelProfile;
  effort: Effort;
  budget: Budget;
  store?: string;
  out?: string;
  json?: string;
  quiet: boolean;
}

async function main(): Promise<void> {
  loadEnv();
  const opts = parseCli();
  assertRequiredEnvironment();

  const modelRouting = resolveModelRouting(opts.profile);
  const fetch = resolveFetchProviders();
  const search = resolveSearchProviders();
  const config: AtlasConfig = {
    ...modelRouting,
    search,
    fetch,
    tools: {
      clinical_trials: clinicaltrials({ defaultLimit: 8 }),
    },
    instructions: verticalInstructions(),
    concurrency: { models: 4, io: 8 },
    ...(opts.store ? { store: fileStore(opts.store) } : {}),
  };

  const atlas = new Atlas(config);
  const question = buildQuestion(opts);
  const run = atlas.start(question, {
    effort: opts.effort,
    ...(Object.keys(opts.budget).length ? { budget: opts.budget } : {}),
  });

  const { reportedTerminalError } = await streamProgress(run.events(), process.stderr, { quiet: opts.quiet });

  try {
    const result = await run.result();
    writeOutputs(result, opts);
  } catch (err) {
    // A run.error was already surfaced inline by the progress stream; exit
    // non-zero without duplicating it. Other errors fall through to the catch.
    if (!reportedTerminalError) throw err;
    process.exitCode = 1;
  }
}

function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    return;
  }
}

function parseCli(): CliOptions {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    options: {
      company: { type: "string" },
      ticker: { type: "string" },
      topic: { type: "string" },
      profile: { type: "string" },
      effort: { type: "string" },
      budget: { type: "string" },
      store: { type: "string" },
      out: { type: "string" },
      json: { type: "string" },
      quiet: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (parsed.values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const effort = parseEffort(parsed.values.effort);
  const budget: Budget = {};
  if (parsed.values.budget !== undefined) {
    budget.maxUSD = parsePositiveNumber(parsed.values.budget, "--budget");
  }

  return {
    company: parsed.values.company ?? "Moderna",
    ticker: parsed.values.ticker ?? "MRNA",
    topic: parsed.values.topic ?? "CMV vaccine program",
    profile: parseModelProfile(parsed.values.profile),
    effort,
    budget,
    store: parsed.values.store,
    out: parsed.values.out,
    json: parsed.values.json,
    quiet: parsed.values.quiet === true,
  };
}

function parseEffort(raw: string | undefined): Effort {
  if (raw === undefined) return "balanced";
  if (raw === "fast" || raw === "balanced" || raw === "deep" || raw === "max") {
    return raw;
  }
  throw new Error(`--effort must be fast, balanced, deep, or max. Received "${raw}".`);
}

function parsePositiveNumber(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number. Received "${raw}".`);
  }
  return value;
}

function assertRequiredEnvironment(): void {
  if (!env("ATLAS_SEC_EMAIL", "SEC_EMAIL", "ATLAS_SEC_USER_AGENT")) {
    throw new Error(
      "Set ATLAS_SEC_EMAIL in .env. SEC EDGAR requires a contact email.",
    );
  }
}

function resolveFetchProviders(): FetchProvider[] {
  const providers: FetchProvider[] = [basicFetch()];
  if (env("ATLAS_STEEL_API_KEY", "STEEL_API_KEY")) {
    providers.push(steel({ proxy: true }));
  }
  return providers;
}

function resolveSearchProviders(): AtlasConfig["search"] {
  const web: SearchProvider[] = [];
  if (env("ATLAS_TAVILY_API_KEY", "TAVILY_API_KEY")) web.push(tavily());
  if (env("ATLAS_EXA_API_KEY", "EXA_API_KEY")) web.push(exa());
  if (env("ATLAS_BRAVE_API_KEY", "BRAVE_API_KEY")) web.push(brave());

  return {
    ...(web.length ? { web } : {}),
    finance: [
      edgar({
        defaultLimit: 8,
        forms: ["10-K", "10-Q", "8-K", "S-1"],
      }),
    ],
    medical: [pubmed({ defaultLimit: 8, sort: "date" })],
  };
}

function verticalInstructions(): string {
  return [
    "You are a public-biotech diligence analyst using public sources.",
    "Prioritize primary sources: SEC filings, trial registries, peer-reviewed abstracts, and company disclosures.",
    "Separate company disclosure, clinical evidence, trial registry status, market context, and unresolved questions.",
    "Do not provide investment, legal, or medical advice. State this briefly only where a recommendation might otherwise sound like advice.",
    "When sources conflict, preserve the conflict and explain which source is more authoritative for that specific claim.",
    "Prefer exact filing dates, form types, trial IDs, endpoints, enrollment figures, and publication years over general summaries.",
  ].join("\n");
}

function buildQuestion(opts: CliOptions): string {
  return `Build a public-source diligence memo on ${opts.company} (${opts.ticker}), focused on ${opts.topic}.

Use the vertical sources available to you:
- EDGAR for recent 10-K, 10-Q, 8-K, S-1, risk factor, and management disclosure.
- ClinicalTrials.gov through the clinical_trials tool for trial status, NCT IDs, enrollment, phase, sponsor, endpoints, and intervention details.
- PubMed for clinical or scientific evidence.
- Web search, if configured, only for current context that primary sources do not cover.

The memo should answer:
1. What is the current public status of ${opts.topic}?
2. What has management disclosed in SEC filings or official company materials?
3. What do trial registries and publications support, and what do they not support?
4. What are the most important catalysts, risks, and contradictions?
5. What claims remain unresolved from public data?

Format the memo with concise sections:
- Executive view
- Source map
- Evidence table
- Filing disclosures
- Clinical evidence
- Risks and open questions
- Bottom line

Bind important claims to citations. Do not infer private facts.`;
}

function writeOutputs(result: ResearchResult, opts: CliOptions): void {
  if (opts.out) {
    writeFile(opts.out, result.report);
    process.stderr.write(`report written to ${opts.out}\n`);
  } else {
    process.stdout.write(`${result.report}\n`);
  }

  if (opts.json) {
    writeFile(opts.json, `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`json written to ${opts.json}\n`);
  }
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`atlas-demo: ${message}\n`);
  process.exit(1);
});
