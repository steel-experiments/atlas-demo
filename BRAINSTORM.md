# Atlas Vertical Demo Brainstorm

## Goal

Build a proof of concept that shows Atlas as a customizable deep research SDK, not only a generic web researcher. The demo should combine public data sources, domain-specific adapters, source-aware prompting, and model routing.

## Candidate Verticals

### 1. Public Biotech Diligence

Research a public biotech company or program by combining:

- EDGAR filings for 10-K, 10-Q, 8-K, and risk factor disclosures
- ClinicalTrials.gov for pipeline status and trial design
- PubMed for peer-reviewed clinical evidence
- Web search for recent company, regulatory, or market context

Why it works: this uses both securities and health sources, highlights source quality differences, and makes verification valuable because claims can cross public filings, registries, and medical literature.

### 2. Pure Securities Risk Analyst

Research a public company through EDGAR filings, recent 8-Ks, and broader web search. Useful for revenue concentration, debt maturity, litigation, customer risk, and management guidance.

Why it works: EDGAR is a strong primary source. The downside is that the demo can look like a filing search wrapper unless it adds a clear vertical workflow.

### 3. Clinical Evidence Scout

Research a treatment, disease area, or intervention through PubMed, ClinicalTrials.gov, Semantic Scholar, and OpenAlex.

Why it works: medical research has natural citation pressure. The downside is that it needs careful non-medical-advice framing and can miss the business angle that makes EDGAR useful.

### 4. Supplier and Compliance Research

Research vendors, sanctions, certifications, public web records, and regulatory material.

Why it works: it is commercially relatable. The downside is that fewer adapters already exist in Atlas, so the demo would spend more effort on new integrations.

## Chosen Demo

Use public biotech diligence. It is a vertical agent with a clear audience: a product team, investor-relations analyst, corp-dev analyst, or research workflow builder who needs a grounded memo across public sources.

The first runnable prompt focuses on a public company and a program or risk question:

> Build a public-source diligence memo on Moderna (MRNA), focused on its CMV vaccine program.

## Model Routing

Default profile: `hybrid`.

- GLM handles lead, research, extraction, and cheap screening.
- GPT-5.5 handles verification, entailment, and final writing.

This keeps routine exploration cheaper while reserving the stronger model for claim checking and the final memo. For more conservative runs, the `high-stakes` profile uses GPT-5.5 as the lead and writer while still using GLM for research and extraction.
