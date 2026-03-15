import type { Task } from "./types.js";

/**
 * Build self-critique guidance that gets injected into the system prompt.
 * This encourages the agent to evaluate its own work before submitting.
 * NOT a separate LLM call — it's guidance within the agent's normal reasoning.
 */
export function buildSelfCritiqueGuidance(selfCritiqueEnabled: boolean): string {
  if (!selfCritiqueEnabled) {
    return "";
  }

  return [
    "",
    "### Self-Critique Protocol",
    "Before calling `task_complete`, you MUST self-evaluate your work:",
    "1. Review each acceptance criterion — is it met? What is the evidence?",
    "2. Rate your own work honestly (0-100) on: completeness, quality, thoroughness",
    "3. Identify anything you could have done better",
    "4. Note improvements you noticed but did not implement (shows awareness)",
    "5. Provide this assessment in the `selfAssessment` parameter of `task_complete`",
    "",
    "Your self-assessment accuracy is tracked. Agents who accurately predict their judge scores",
    "earn higher self-awareness scores. Overestimating your work hurts your credibility.",
    "",
  ].join("\n");
}

/**
 * Format task context for the self-critique prompt shown to agents.
 * Used when an agent is about to complete a task.
 */
export function formatTaskForCritique(task: Task): string {
  const parts: string[] = [];
  parts.push(`Task: ${task.title}`);
  parts.push(`Description: ${task.description}`);

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    parts.push("Acceptance Criteria:");
    for (const criterion of task.acceptanceCriteria) {
      parts.push(`  - ${criterion}`);
    }
  }

  return parts.join("\n");
}
