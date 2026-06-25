# Public Biotech Diligence with Atlas

A vertical deep-research agent that turns public biotech sources into a cited diligence memo.

This repo is a demo for [Atlas](https://github.com/steel-dev/atlas), the open-source deep research SDK from Steel. Atlas gives you the research loop: search, browser fetch, source ingestion, claim tracking, verification, and a cited report. This demo shows how to customize that loop for one industry.

```bash
npm install @steel-dev/atlas ai @ai-sdk/openai
```

## What This Shows

Atlas is not only a generic web researcher. You can point it at a vertical, add domain sources, route different roles to different models, and keep the final report grounded in verified public evidence.

This demo researches a public biotech company by combining:

| Source | Job |
| --- | --- |
| SEC EDGAR | Company filings, risk factors, management disclosure, 10-K, 10-Q, 8-K |
| ClinicalTrials.gov | Trial status, NCT IDs, interventions, phase, sponsor, enrollment |
| PubMed | Peer-reviewed clinical and scientific evidence |
| Tavily, Exa, or Brave | Optional current web context |
| Steel | Optional browser fetch for pages that need real rendering |

Default run:

```text
company: Moderna
ticker:  MRNA
topic:   CMV vaccine program
output:  cited public-source diligence memo
```

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

Optional source and fetch providers:

```bash
TAVILY_API_KEY=...
EXA_API_KEY=...
BRAVE_API_KEY=...
STEEL_API_KEY=...
```

Run the default memo:

```bash
npm run research
```

Run a specific diligence question:

```bash
npm run research -- \
  --company "Moderna" \
  --ticker MRNA \
  --topic "CMV vaccine program" \
  --effort balanced \
  --budget 2 \
  --out reports/moderna-cmv.md
```

## How It Works

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

The demo config lives in [src/index.ts](src/index.ts). The model routing lives in [src/model-routing.ts](src/model-routing.ts). The domain adapters live in [src/domain](src/domain).

## Model Routing

The default profile is `hybrid`: cheaper GLM models do broad exploration, while GPT-5.5 handles verification and final writing.

| Profile | Lead | Research | Extract | Verify | Write | Best For |
| --- | --- | --- | --- | --- | --- | --- |
| `hybrid` | GLM | GLM | GLM | GPT-5.5 | GPT-5.5 | Default demo runs |
| `high-stakes` | GPT-5.5 | GLM | GLM | GPT-5.5 | GPT-5.5 | More conservative diligence |
| `cheap` | GLM | GLM | GLM | GLM | GLM | Fast experiments |

Run a profile:

```bash
npm run research -- --profile hybrid
npm run research -- --profile high-stakes
npm run research -- --profile cheap
```

`balanced` is the default effort. In the current Atlas envelope, `balanced` uses the `verify` role for the verification panel. `deep` and `max` escalate the panel to the lead model.

## Customize It

Change the vertical question in [src/index.ts](src/index.ts):

```ts
const question = buildQuestion(opts);
```

Add another domain source by implementing either:

- `SearchProvider`, for sources that behave like search
- `researchTool`, for sources the agent should call directly with structured input

The demo already includes:

- [src/domain/edgar.ts](src/domain/edgar.ts)
- [src/domain/pubmed.ts](src/domain/pubmed.ts)
- [src/domain/clinicaltrials.ts](src/domain/clinicaltrials.ts)

Atlas also has example adapters or source integrations for arXiv, OpenAlex, Semantic Scholar, and Wikipedia.

## Use Atlas In Your Own App

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
npm run research     # run the demo CLI
npm test             # run unit tests (node:test via tsx)
npm run typecheck    # TypeScript check
npm run build        # compile to dist/
npm run start        # run compiled output
```

## Publish Checklist

Before publishing this demo:

```bash
rm -rf node_modules package-lock.json
npm install
npm test
npm run typecheck
npm run build
```

Make sure `package-lock.json` resolves `@steel-dev/atlas` from the public npm registry, not a local tarball.

## Next Ideas

This same pattern can become:

- a securities risk researcher using EDGAR plus web context
- a clinical evidence scout using PubMed, ClinicalTrials.gov, OpenAlex, and Semantic Scholar
- a supplier diligence researcher with custom compliance sources
- an internal research workflow with your own private adapters

Atlas gives you the loop. The vertical is where you add judgment.
