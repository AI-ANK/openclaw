import { ACCOUNTABILITY_PRINCIPLES, STANDING_DESCRIPTIONS } from "./constants.js";
import type { AgentScorecard, DimensionScores, LeaderboardEntry, Task } from "./types.js";

/**
 * Build the accountability context that gets injected into the agent's system prompt
 * via the before_prompt_build hook. This is the core mechanism: the agent "knows" its
 * performance history, standing, and what's expected of it.
 */
export function buildAccountabilityContext(
  scorecard: AgentScorecard,
  currentTask: Task | null,
  leaderboard: LeaderboardEntry[],
): string {
  const sections: string[] = [];

  // Header
  sections.push("## Your Accountability Profile");
  sections.push("");

  // Standing and scores
  const standingInfo = STANDING_DESCRIPTIONS[scorecard.standing];
  sections.push(`**Standing: ${standingInfo.title}** (Overall Score: ${scorecard.overall}/100)`);
  sections.push(standingInfo.description);
  sections.push("");

  // Dimension breakdown with improvement hints
  sections.push("### Performance Dimensions");
  sections.push(formatDimensions(scorecard.dimensions));
  sections.push("");

  // Weaknesses to improve
  const weaknesses = findWeaknesses(scorecard.dimensions);
  if (weaknesses.length > 0) {
    sections.push("### Areas for Improvement");
    for (const w of weaknesses) {
      sections.push(`- **${w.dimension}** (${w.score}/100): ${w.advice}`);
    }
    sections.push("");
  }

  // Leaderboard (competitive incentive)
  if (leaderboard.length > 1) {
    sections.push("### Team Leaderboard");
    const myRank = leaderboard.find((e) => e.agentId === scorecard.agentId);
    if (myRank) {
      sections.push(`You are ranked **#${myRank.rank} of ${leaderboard.length}** agents.`);
    }
    for (const entry of leaderboard.slice(0, 5)) {
      const marker = entry.agentId === scorecard.agentId ? " (you)" : "";
      sections.push(`  ${entry.rank}. ${entry.agentId}${marker} - ${entry.overall}/100 [${entry.standing}]`);
    }
    sections.push("");
  }

  // Track record
  sections.push(`Tasks completed: ${scorecard.totalTasksCompleted} | Questions asked: ${scorecard.totalQuestionsAsked}`);
  sections.push("");

  // Incentive
  sections.push(`**Incentive:** ${standingInfo.incentive}`);
  sections.push("");

  // Current task
  if (currentTask) {
    sections.push("### Your Current Task");
    sections.push(`**${currentTask.title}** [${currentTask.priority} priority]`);
    sections.push(currentTask.description);
    if (currentTask.acceptanceCriteria && currentTask.acceptanceCriteria.length > 0) {
      sections.push("");
      sections.push("**Acceptance Criteria:**");
      for (const criterion of currentTask.acceptanceCriteria) {
        sections.push(`- [ ] ${criterion}`);
      }
    }
    sections.push("");
  }

  // Constitutional principles filtered by standing
  const applicablePrinciples = ACCOUNTABILITY_PRINCIPLES.filter((p) =>
    p.standings.includes(scorecard.standing),
  );
  if (applicablePrinciples.length > 0) {
    sections.push("### Your Operating Principles");
    for (const principle of applicablePrinciples) {
      sections.push(`- ${principle.text}`);
    }
    sections.push("");
  }

  // Scoring transparency
  sections.push("### How You Are Evaluated");
  sections.push("After each task, an independent judge evaluates your work on:");
  sections.push("- **Completion** (30%): Did you meet all acceptance criteria?");
  sections.push("- **Quality** (25%): Is your output well-crafted and correct?");
  sections.push("- **Proactivity** (20%): Did you go beyond minimum requirements?");
  sections.push("- **Reliability** (15%): Were there errors or tool failures?");
  sections.push("- **Initiative** (10%): Did you suggest improvements or ask smart questions?");
  sections.push("");
  sections.push("Use the `task_board` tool to view and claim tasks. Use `task_complete` to submit your work with a self-assessment. Use `task_question` to ask clarifying questions (this positively impacts your initiative score).");

  return sections.join("\n");
}

function formatDimensions(dims: DimensionScores): string {
  const bars = (score: number): string => {
    const filled = Math.round(score / 10);
    return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
  };

  return [
    `  Completion:  ${bars(dims.completion)} ${dims.completion}/100`,
    `  Quality:     ${bars(dims.quality)} ${dims.quality}/100`,
    `  Proactivity: ${bars(dims.proactivity)} ${dims.proactivity}/100`,
    `  Reliability: ${bars(dims.reliability)} ${dims.reliability}/100`,
    `  Initiative:  ${bars(dims.initiative)} ${dims.initiative}/100`,
  ].join("\n");
}

type Weakness = { dimension: string; score: number; advice: string };

function findWeaknesses(dims: DimensionScores): Weakness[] {
  const adviceMap: Record<keyof DimensionScores, string> = {
    completion: "Focus on meeting every acceptance criterion. Double-check before submitting.",
    quality: "Take extra care with your output. Review for correctness and cleanliness.",
    proactivity: "Look for ways to go beyond the minimum requirements. Suggest improvements.",
    reliability: "Reduce tool errors and avoid failures. Test your approach before committing.",
    initiative: "Ask clarifying questions using task_question. Propose improvements proactively.",
  };

  const weaknesses: Weakness[] = [];
  for (const [dim, score] of Object.entries(dims) as Array<[keyof DimensionScores, number]>) {
    if (score < 50) {
      weaknesses.push({ dimension: dim, score, advice: adviceMap[dim] });
    }
  }
  return weaknesses.sort((a, b) => a.score - b.score);
}
