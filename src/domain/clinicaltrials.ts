import { jsonSchema } from "ai";
import {
  researchTool,
  type ResearchTool,
  type ToolContext,
} from "@steel-dev/atlas";
import {
  buildContent,
  clampLimit,
  collapse,
  errorMessage,
  fetchJson,
  manifest,
} from "./shared.js";

export interface ClinicalTrialsOptions {
  defaultLimit?: number;
  status?: string[];
}

const ENDPOINT = "https://clinicaltrials.gov/api/v2/studies";

export function clinicaltrials(
  opts: ClinicalTrialsOptions = {},
): ResearchTool {
  const defaultLimit = clampLimit(opts.defaultLimit ?? 5, 10);
  const status = (opts.status ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return researchTool({
    description:
      "Search ClinicalTrials.gov for trial status, design, enrollment, sponsor, interventions, and brief summaries. Use this for biotech pipeline diligence and trial verification.",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Condition, intervention, sponsor, or free-text query.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    async execute(input, ctx) {
      const query = String(input.query ?? "").trim();
      if (!query) return "clinicaltrials: empty query";

      const params = new URLSearchParams({
        "query.term": query,
        pageSize: String(defaultLimit),
        format: "json",
      });
      if (status.length) params.set("filter.overallStatus", status.join(","));

      try {
        const data = await fetchJson(`${ENDPOINT}?${params.toString()}`, ctx.signal);
        return manifest("clinicaltrials", query, ingest(data, ctx));
      } catch (err) {
        return `clinicaltrials: request failed: ${errorMessage(err)}`;
      }
    },
  });
}

function ingest(data: unknown, ctx: ToolContext): string[] {
  const studies =
    data && typeof data === "object"
      ? (data as { studies?: unknown }).studies
      : undefined;
  if (!Array.isArray(studies)) return [];

  const titles: string[] = [];
  for (const study of studies) {
    const p =
      ((study ?? {}) as { protocolSection?: Record<string, unknown> })
        .protocolSection ?? {};
    const idm = asRecord(p.identificationModule);
    const nctId = collapse(String(idm.nctId ?? ""));
    const title = collapse(String(idm.briefTitle ?? idm.officialTitle ?? ""));
    if (!nctId || !title) continue;

    const statusModule = asRecord(p.statusModule);
    const designModule = asRecord(p.designModule);
    const sponsorModule = asRecord(p.sponsorCollaboratorsModule);
    const conditionsModule = asRecord(p.conditionsModule);
    const armsModule = asRecord(p.armsInterventionsModule);
    const descriptionModule = asRecord(p.descriptionModule);
    const leadSponsor = asRecord(sponsorModule.leadSponsor);
    const enrollmentInfo = asRecord(designModule.enrollmentInfo);

    const overallStatus = collapse(
      String(statusModule.overallStatus ?? ""),
    ).replace(/_/g, " ");
    const sponsor = collapse(String(leadSponsor.name ?? ""));
    const conditions = list(conditionsModule.conditions);
    const interventions = Array.isArray(armsModule.interventions)
      ? armsModule.interventions
          .map((i) => collapse(String(asRecord(i).name ?? "")))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const studyType = collapse(String(designModule.studyType ?? ""));
    const phases = list(designModule.phases).map((x) => x.replace(/_/g, " "));
    const enrollment = enrollmentInfo.count;
    const abstract = collapse(String(descriptionModule.briefSummary ?? ""));

    const typeLine = [studyType, phases.join("/")].filter(Boolean).join(" | ");
    const meta: string[] = [];
    if (overallStatus) meta.push(`Status: ${overallStatus}`);
    if (typeLine) meta.push(typeLine);
    if (conditions.length) meta.push(`Conditions: ${conditions.join(", ")}`);
    if (interventions.length) {
      meta.push(`Interventions: ${interventions.join(", ")}`);
    }
    if (sponsor) meta.push(`Sponsor: ${sponsor}`);
    if (typeof enrollment === "number") meta.push(`Enrollment: ${enrollment}`);

    ctx.addSource({
      url: `https://clinicaltrials.gov/study/${nctId}`,
      title,
      content: buildContent({ title, meta, abstract }),
    });
    titles.push(title);
  }

  return titles;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => collapse(String(v))).filter(Boolean).slice(0, 8)
    : [];
}
