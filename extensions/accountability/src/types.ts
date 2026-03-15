/** Task status progression: open → claimed → in_progress → review → done (or blocked at any point) */
export type TaskStatus = "open" | "claimed" | "in_progress" | "review" | "done" | "blocked";

export type TaskPriority = "low" | "medium" | "high" | "critical";

/** Agent standing — determines prompt injection level and autonomy */
export type AgentStanding = "probation" | "standard" | "trusted" | "star";

/** Result of a completed task, including self-assessment and judge evaluation */
export type TaskResult = {
  summary: string;
  artifacts?: string[];
  selfCritiqueScore?: number;
  judgeScore?: number;
  judgeRationale?: string;
};

/** A question asked by the agent about a task (tracked for proactivity scoring) */
export type TaskQuestion = {
  question: string;
  context?: string;
  askedAt: number;
  answeredAt?: number;
  answer?: string;
};

/** A task on the board */
export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  createdAt: number;
  claimedAt?: number;
  completedAt?: number;
  tags?: string[];
  acceptanceCriteria?: string[];
  result?: TaskResult;
  parentTaskId?: string;
  questions?: TaskQuestion[];
};

/** A single scorecard entry for one completed task */
export type ScorecardEntry = {
  taskId: string;
  timestamp: number;
  scores: {
    completion: number;
    quality: number;
    proactivity: number;
    reliability: number;
    initiative: number;
  };
  notes?: string;
};

/** Dimension scores for an agent (each 0-100) */
export type DimensionScores = {
  completion: number;
  quality: number;
  proactivity: number;
  reliability: number;
  initiative: number;
};

/** Persistent agent scorecard — the agent's professional identity */
export type AgentScorecard = {
  agentId: string;
  overall: number;
  dimensions: DimensionScores;
  history: ScorecardEntry[];
  standing: AgentStanding;
  totalTasksCompleted: number;
  totalQuestionsAsked: number;
  updatedAt: number;
};

/** Result from the LLM judge evaluation */
export type JudgeResult = {
  overallScore: number;
  dimensions: DimensionScores;
  rationale: string;
  /** selfCritiqueScore - judgeScore; positive means agent overestimated */
  calibrationDelta: number;
};

/** A constitutional principle injected based on standing */
export type AccountabilityPrinciple = {
  id: string;
  standings: AgentStanding[];
  text: string;
};

/** Leaderboard entry for cross-agent comparison */
export type LeaderboardEntry = {
  agentId: string;
  overall: number;
  standing: AgentStanding;
  totalTasksCompleted: number;
  rank: number;
};

/** Plugin configuration resolved from openclaw config */
export type AccountabilityConfig = {
  dataDir: string;
  evaluationModel?: string;
  evaluationProvider?: string;
  scorecardDecayDays: number;
  selfCritiqueEnabled: boolean;
};
