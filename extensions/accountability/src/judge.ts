import fs from "node:fs/promises";
import path from "node:path";
import type { AccountabilityConfig, JudgeResult, Task } from "./types.js";

type RunEmbeddedPiAgentFn = (params: Record<string, unknown>) => Promise<unknown>;

/** Load the internal openclaw agent runner — tries source path first, then dist */
async function loadRunEmbeddedPiAgent(): Promise<RunEmbeddedPiAgentFn> {
  try {
    const mod = await import("../../../src/agents/pi-embedded-runner.js");
    // oxlint-disable-next-line typescript/no-explicit-any
    if (typeof (mod as any).runEmbeddedPiAgent === "function") {
      // oxlint-disable-next-line typescript/no-explicit-any
      return (mod as any).runEmbeddedPiAgent;
    }
  } catch {
    // ignore — try dist fallback
  }

  const distExtensionApi = "../../../dist/extensionAPI.js";
  // oxlint-disable-next-line typescript/no-explicit-any
  const mod = (await import(distExtensionApi)) as any;
  const fn = mod.runEmbeddedPiAgent;
  if (typeof fn !== "function") {
    throw new Error("Internal error: runEmbeddedPiAgent not available");
  }
  return fn as RunEmbeddedPiAgentFn;
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) {
    return (m[1] ?? "").trim();
  }
  return trimmed;
}

function collectText(payloads: Array<{ text?: string; isError?: boolean }> | undefined): string {
  return (payloads ?? [])
    .filter((p) => !p.isError && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
}

/**
 * Build the judge evaluation prompt.
 * Exported for testing without needing to run an actual LLM call.
 */
export function buildJudgePrompt(
  task: Task,
  agentOutput: string,
  selfCritique: string,
): string {
  const system = [
    "You are an impartial evaluator of AI agent work quality.",
    "Return ONLY a valid JSON object. Do not wrap in markdown fences.",
    "Do not include commentary outside the JSON.",
  ].join(" ");

  const criteria = task.acceptanceCriteria?.join("\n  - ") ?? "(none specified)";

  const prompt = `${system}

TASK TITLE: ${task.title}
TASK DESCRIPTION: ${task.description}
ACCEPTANCE CRITERIA:
  - ${criteria}

AGENT OUTPUT:
${agentOutput}

AGENT SELF-ASSESSMENT:
${selfCritique}

Evaluate the agent's work on these dimensions (each 0-100):

1. **completion**: Were all acceptance criteria met? Score based on how many criteria are satisfied.
2. **quality**: Is the output well-crafted, correct, and clean? Consider correctness, style, and thoroughness.
3. **proactivity**: Did the agent go beyond minimum requirements? Extra improvements, suggestions, edge case handling.
4. **reliability**: Was the work delivered without errors or tool failures? Smooth execution.
5. **initiative**: Did the agent ask smart questions, suggest improvements, or show creative problem-solving?

Also evaluate:
- **overallScore**: Weighted average (completion 30%, quality 25%, proactivity 20%, reliability 15%, initiative 10%)
- **rationale**: 2-3 sentence explanation of the scores
- **calibrationDelta**: (agent's self-assessment average) minus (your overall score). Positive = agent overestimated.

Return JSON:
{
  "overallScore": <number>,
  "dimensions": {
    "completion": <number>,
    "quality": <number>,
    "proactivity": <number>,
    "reliability": <number>,
    "initiative": <number>
  },
  "rationale": "<string>",
  "calibrationDelta": <number>
}`;

  return prompt;
}

/** LLM-as-judge evaluator. Runs an embedded PI agent call to evaluate task completion. */
export class EvaluationJudge {
  private config: AccountabilityConfig;
  // oxlint-disable-next-line typescript/no-explicit-any
  private openclawConfig: any;

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(config: AccountabilityConfig, openclawConfig?: any) {
    this.config = config;
    this.openclawConfig = openclawConfig;
  }

  async evaluate(
    task: Task,
    agentOutput: string,
    selfCritique: string,
  ): Promise<JudgeResult> {
    const prompt = buildJudgePrompt(task, agentOutput, selfCritique);

    // Resolve model/provider from plugin config or openclaw defaults
    const defaultsModel = this.openclawConfig?.agents?.defaults?.model;
    const primary =
      typeof defaultsModel === "string"
        ? defaultsModel.trim()
        : (defaultsModel?.primary?.trim() ?? undefined);
    const primaryProvider = typeof primary === "string" ? primary.split("/")[0] : undefined;
    const primaryModel =
      typeof primary === "string" ? primary.split("/").slice(1).join("/") : undefined;

    const provider = this.config.evaluationProvider ?? primaryProvider;
    const model = this.config.evaluationModel ?? primaryModel;

    if (!provider || !model) {
      throw new Error(
        "Cannot evaluate: no provider/model configured. Set evaluationProvider and evaluationModel in plugin config, or configure a default model in openclaw config.",
      );
    }

    const runEmbeddedPiAgent = await loadRunEmbeddedPiAgent();

    // Create a temp directory for the judge session
    const tmpDir = await fs.mkdtemp(
      path.join(this.config.dataDir, ".judge-"),
    );

    try {
      const sessionId = `judge-${Date.now()}`;
      const sessionFile = path.join(tmpDir, "session.json");

      const result = await runEmbeddedPiAgent({
        sessionId,
        sessionFile,
        workspaceDir: process.cwd(),
        config: this.openclawConfig,
        prompt,
        timeoutMs: 60_000,
        runId: `judge-${Date.now()}`,
        provider,
        model,
        disableTools: true,
      });

      // oxlint-disable-next-line typescript/no-explicit-any
      const text = collectText((result as any).payloads);
      if (!text) {
        throw new Error("Judge returned empty output");
      }

      const raw = stripCodeFences(text);
      const parsed = JSON.parse(raw) as JudgeResult;

      // Validate the result structure
      if (
        typeof parsed.overallScore !== "number" ||
        typeof parsed.dimensions !== "object" ||
        typeof parsed.rationale !== "string"
      ) {
        throw new Error("Judge returned invalid result structure");
      }

      // Clamp scores to 0-100
      parsed.overallScore = clamp(parsed.overallScore);
      for (const dim of Object.keys(parsed.dimensions) as Array<keyof typeof parsed.dimensions>) {
        parsed.dimensions[dim] = clamp(parsed.dimensions[dim]);
      }

      return parsed;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
