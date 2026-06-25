# Atlas public company research demo

A small Atlas demo that turns public sources into a cited research memo.

The domain here is public biotech companies. The pattern is more general: wire Atlas to the sources your workflow trusts, give it a focused question, and get back a report with citations instead of a pile of search results.

## Quickstart

```bash
git clone https://github.com/steel-dev/atlas-demo.git
cd atlas-demo
npm install
cp .env.example .env
```

Fill in the required keys:

```bash
ZAI_API_KEY=...
OPENAI_API_KEY=...
ATLAS_SEC_EMAIL=you@example.com
```

Optional search and fetch providers:

```bash
TAVILY_API_KEY=...
EXA_API_KEY=...
BRAVE_API_KEY=...
STEEL_API_KEY=...
```

Run the demo:

```bash
npm run research -- \
  --company "Butterfly Network" \
  --ticker BFLY \
  --topic "Midjourney collaboration or reported connection" \
  --effort balanced \
  --budget 2 \
  --out reports/bfly-midjourney.md
```

Without `--out`, the CLI prints the memo to stdout. Use `--json` for the full Atlas result and `--store` to persist the run journal.

## What this demo does

You give it:

- a public company
- a ticker
- a program, product, or risk question

It reads from:

- SEC EDGAR filings
- ClinicalTrials.gov
- PubMed
- optional web search
- optional Steel browser fetches

It writes:

- a cited memo
- a source map and evidence table
- filing disclosures, clinical evidence, risks, contradictions, and open questions

This is not investment, legal, or medical advice. It only uses public evidence and should not infer private facts.

## Why Atlas

Atlas handles the research loop that most teams end up rebuilding:

- planning what needs to be answered
- searching and fetching sources
- keeping source records around
- tracking claims
- checking the draft before the final answer
- binding citations
- streaming progress events
- persisting a run journal when you need one

This repo adds the biotech-specific pieces: source adapters, tools, instructions, and model routing. Swap those out and the same structure can become a securities-risk researcher, clinical evidence scout, supplier compliance researcher, or internal research workflow.

Read the launch post: [Atlas: a deep research harness you can own](https://steel.dev/blog/atlas-sdk).

Install Atlas in your own app:

```bash
npm install @steel-dev/atlas ai @ai-sdk/openai
```

## Sources used

| Source | Job |
| --- | --- |
| SEC EDGAR | Company filings, risk factors, management disclosure, 10-K, 10-Q, 8-K |
| ClinicalTrials.gov | Trial status, NCT IDs, interventions, phase, sponsor, enrollment |
| PubMed | Peer-reviewed clinical and scientific evidence |
| Tavily, Exa, or Brave | Optional current web context |
| Steel | Optional browser fetch for pages that need real rendering |

## How it works

```text
question
  -> Atlas lead agent
  -> domain search: EDGAR + PubMed
  -> domain tool: ClinicalTrials.gov
  -> optional web search
  -> optional Steel browser fetch
  -> claim ledger
  -> verification pass
  -> cited memo
```

The demo config lives in [src/index.ts](src/index.ts). Model routing lives in [src/model-routing.ts](src/model-routing.ts). Domain adapters live in [src/domain](src/domain).

## Model routing

The default profile is `hybrid`: GLM handles broad exploration, while GPT-5.5 handles verification and final writing.

| Profile | Lead | Research | Extract | Verify | Write | Best for |
| --- | --- | --- | --- | --- | --- | --- |
| `hybrid` | GLM | GLM | GLM | GPT-5.5 | GPT-5.5 | General runs |
| `high-stakes` | GPT-5.5 | GLM | GLM | GPT-5.5 | GPT-5.5 | More conservative memos |
| `cheap` | GLM | GLM | GLM | GLM | GLM | Fast experiments |

Run a profile:

```bash
npm run research -- --profile hybrid --company "Company Name" --ticker TICKER --topic "risk question"
npm run research -- --profile high-stakes --company "Company Name" --ticker TICKER --topic "risk question"
npm run research -- --profile cheap --company "Company Name" --ticker TICKER --topic "risk question"
```

`balanced` is the default effort. `deep` and `max` spend more work on verification.

## Customize it

Change the generated research question in [src/index.ts](src/index.ts):

```ts
const question = buildQuestion(opts);
```

Add another source by implementing either:

- `SearchProvider`, for sources that behave like search
- `researchTool`, for sources the agent should call with structured input

Included adapters:

- [src/domain/edgar.ts](src/domain/edgar.ts)
- [src/domain/pubmed.ts](src/domain/pubmed.ts)
- [src/domain/clinicaltrials.ts](src/domain/clinicaltrials.ts)

## Use Atlas in your app

Minimal server-side setup:

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { Atlas, basicFetch, steel, tavily } from "@steel-dev/atlas";

const glm = createOpenAI({
  apiKey: process.env.ZAI_API_KEY!,
  baseURL: "https://api.z.ai/api/paas/v4",
}).chat("glm-5.2");

const verifier = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})("gpt-5.5");

const atlas = new Atlas({
  model: glm,
  models: {
    verify: verifier,
    entail: verifier,
    write: verifier,
  },
  search: process.env.TAVILY_API_KEY ? tavily() : undefined,
  fetch: process.env.STEEL_API_KEY
    ? [basicFetch(), steel({ proxy: true })]
    : [basicFetch()],
});

const result = await atlas.research("Research a public company risk profile", {
  effort: "balanced",
  budget: { maxUSD: 2 },
});

console.log(result.report);
```

Keep Atlas on the server side. It uses provider keys, search keys, and optional Steel keys.

## Scripts

```bash
npm run research     # requires --company, --ticker, and --topic
npm test             # run unit tests
npm run typecheck    # TypeScript check
npm run build        # compile to dist/
npm run start        # run compiled output
```

## Contributing

This repo is a demo, not a supported product. We are not planning ongoing support or feature development for it.

Bug fixes and small improvements are welcome, but production use should start from a fork or copy that you adapt to your own sources, prompts, models, and compliance needs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
