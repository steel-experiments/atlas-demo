import { createOpenAI } from "@ai-sdk/openai";
import type { AtlasConfig } from "@steel-dev/atlas";
import { env } from "./domain/shared.js";

export type ModelProfile = "hybrid" | "high-stakes" | "cheap";

export function parseModelProfile(raw: string | undefined): ModelProfile {
  const value = (raw ?? env("MODEL_PROFILE") ?? "hybrid").trim();
  if (value === "hybrid" || value === "high-stakes" || value === "cheap") {
    return value;
  }
  throw new Error(
    `model profile must be hybrid, high-stakes, or cheap. Received "${value}".`,
  );
}

export function resolveModelRouting(
  profile: ModelProfile,
): Pick<AtlasConfig, "model" | "models"> {
  const cheap = createGlmModel();
  if (profile === "cheap") {
    return { model: cheap };
  }

  const strong = createOpenAiModel();

  if (profile === "high-stakes") {
    return {
      model: strong,
      models: {
        research: cheap,
        extract: cheap,
        screen: cheap,
        verify: strong,
        entail: strong,
        write: strong,
      },
    };
  }

  return {
    model: cheap,
    models: {
      research: cheap,
      extract: cheap,
      screen: cheap,
      verify: strong,
      entail: strong,
      write: strong,
    },
  };
}

function createGlmModel(): AtlasConfig["model"] {
  const apiKey = env("ATLAS_ZAI_API_KEY", "ZAI_API_KEY");
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is required for GLM model routing.");
  }
  const baseURL =
    env("ATLAS_ZAI_BASE_URL", "ZAI_BASE_URL") ??
    "https://api.z.ai/api/paas/v4";
  const modelId = env("ATLAS_GLM_MODEL", "GLM_MODEL") ?? "glm-5.2";
  return createOpenAI({ apiKey, baseURL }).chat(modelId);
}

function createOpenAiModel(): AtlasConfig["model"] {
  const apiKey = env("ATLAS_OPENAI_API_KEY", "OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for hybrid and high-stakes profiles.");
  }
  const modelId =
    env("ATLAS_OPENAI_VERIFY_MODEL", "OPENAI_VERIFY_MODEL") ?? "gpt-5.5";
  return createOpenAI({ apiKey })(modelId);
}
