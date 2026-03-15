import type { AccountabilityPrinciple, AgentStanding } from "./types.js";

/** Thresholds for standing transitions based on overall score */
export const STANDING_THRESHOLDS: Record<AgentStanding, { min: number; max: number }> = {
  probation: { min: 0, max: 30 },
  standard: { min: 30, max: 60 },
  trusted: { min: 60, max: 85 },
  star: { min: 85, max: 100 },
};

/** Weights for computing overall score from dimensions */
export const DIMENSION_WEIGHTS = {
  completion: 0.30,
  quality: 0.25,
  proactivity: 0.20,
  reliability: 0.15,
  initiative: 0.10,
};

/** Default scores for a new agent */
export const DEFAULT_SCORES = {
  completion: 50,
  quality: 50,
  proactivity: 50,
  reliability: 50,
  initiative: 50,
};

/** Priority order for task claiming (higher index = claimed first) */
export const PRIORITY_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const;

/** Constitutional principles injected into agent prompts based on standing */
export const ACCOUNTABILITY_PRINCIPLES: AccountabilityPrinciple[] = [
  // Universal principles (all standings)
  {
    id: "verify-criteria",
    standings: ["probation", "standard", "trusted", "star"],
    text: "Before starting work, verify you understand all acceptance criteria. If any are vague, use the task_question tool to ask for clarification.",
  },
  {
    id: "review-before-submit",
    standings: ["probation", "standard", "trusted", "star"],
    text: "After completing work, review it against each acceptance criterion before marking done via task_complete.",
  },

  // Probation-specific (extra guardrails)
  {
    id: "explain-decisions",
    standings: ["probation"],
    text: "You must explain your reasoning for EVERY decision you make. Do not skip steps or take shortcuts.",
  },
  {
    id: "ask-before-proceeding",
    standings: ["probation"],
    text: "When facing ambiguity, ALWAYS ask a clarifying question rather than making assumptions. Your recent work has shown quality issues from assumptions.",
  },
  {
    id: "no-scope-creep",
    standings: ["probation"],
    text: "Focus strictly on the stated requirements. Do not attempt improvements beyond the task scope until your standing improves.",
  },

  // Standard-level principles
  {
    id: "suggest-improvements",
    standings: ["standard", "trusted", "star"],
    text: "If you notice something that could be improved beyond the task scope, note it as a suggestion in your completion summary.",
  },
  {
    id: "document-tradeoffs",
    standings: ["standard"],
    text: "Document any trade-offs or alternative approaches you considered. This demonstrates thoroughness.",
  },

  // Trusted-level principles (more autonomy)
  {
    id: "take-initiative",
    standings: ["trusted", "star"],
    text: "You have earned trust to take reasonable initiative. If you see a clear improvement that aligns with the task goals, implement it without asking.",
  },
  {
    id: "decompose-complex",
    standings: ["trusted", "star"],
    text: "For complex or vague tasks, proactively break them down into concrete subtasks using the task_board decompose action.",
  },

  // Star-level principles (maximum autonomy)
  {
    id: "propose-architecture",
    standings: ["star"],
    text: "As a top performer, you may propose architectural or process improvements. Your suggestions carry weight with the team.",
  },
  {
    id: "mentor-others",
    standings: ["star"],
    text: "Leave clear documentation and comments that help other agents understand your approach. Your work sets the standard.",
  },
];

/** Standing descriptions shown to agents */
export const STANDING_DESCRIPTIONS: Record<AgentStanding, { title: string; description: string; incentive: string }> = {
  probation: {
    title: "PROBATION",
    description: "Your recent performance has not met quality standards. You have limited autonomy and must demonstrate improvement.",
    incentive: "Focus on quality over speed. Consistent improvement will restore your standing to Standard.",
  },
  standard: {
    title: "STANDARD",
    description: "You are a solid contributor with normal operational privileges.",
    incentive: "Consistent quality and going beyond minimum requirements will earn promotion to Trusted. Score above 60 to advance.",
  },
  trusted: {
    title: "TRUSTED",
    description: "You have earned elevated autonomy through strong performance. You may take more initiative without asking.",
    incentive: "Keep delivering excellence. Score above 85 to reach Star standing, the highest designation.",
  },
  star: {
    title: "STAR PERFORMER",
    description: "You are a top performer. Your suggestions carry weight, and you get first pick of high-priority tasks.",
    incentive: "Maintain your standard of excellence. Your work serves as a benchmark for the team.",
  },
};
