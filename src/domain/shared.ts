export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function clampLimit(value: number | undefined, max = 10): number {
  const n = Math.floor(value ?? max);
  if (!Number.isFinite(n)) return max;
  return Math.min(Math.max(n, 1), max);
}

export function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function fetchJson(
  url: string,
  signal: AbortSignal | undefined,
  headers: HeadersInit = {},
): Promise<unknown> {
  const resp = await fetch(url, { signal, headers });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`.trim());
  }
  return resp.json();
}

export async function fetchText(
  url: string,
  signal: AbortSignal | undefined,
  accept = "text/plain",
  headers: HeadersInit = {},
): Promise<string> {
  const resp = await fetch(url, {
    signal,
    headers: { accept, ...headers },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`.trim());
  }
  return resp.text();
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildContent(opts: {
  title: string;
  authors?: string[];
  meta?: string[];
  abstract?: string;
}): string {
  const lines = [`# ${opts.title}`];
  if (opts.authors?.length) lines.push(`Authors: ${opts.authors.join(", ")}`);
  if (opts.meta?.length) lines.push(...opts.meta);
  if (opts.abstract) lines.push("", opts.abstract);
  return lines.join("\n");
}

export function manifest(provider: string, query: string, titles: string[]): string {
  if (titles.length === 0) return `${provider}: no results for "${query}"`;
  return [
    `${provider}: added ${titles.length} sources for "${query}"`,
    ...titles.map((title) => `- ${title}`),
  ].join("\n");
}
