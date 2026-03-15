import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DEFAULT_SCORES, DIMENSION_WEIGHTS, STANDING_THRESHOLDS } from "./constants.js";
import type {
  AgentScorecard,
  AgentStanding,
  DimensionScores,
  LeaderboardEntry,
  ScorecardEntry,
} from "./types.js";

/** Persistent scorecard store — one file per agent */
export class ScorecardStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "scorecards");
  }

  async loadScorecard(agentId: string): Promise<AgentScorecard> {
    try {
      const data = await fs.readFile(this.scorecardPath(agentId), "utf-8");
      return JSON.parse(data) as AgentScorecard;
    } catch {
      return this.createDefault(agentId);
    }
  }

  async saveScorecard(scorecard: AgentScorecard): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = this.scorecardPath(scorecard.agentId);
    const tmp = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(scorecard, null, 2));
    await fs.rename(tmp, filePath);
  }

  async recordTaskOutcome(
    agentId: string,
    entry: ScorecardEntry,
  ): Promise<AgentScorecard> {
    const scorecard = await this.loadScorecard(agentId);
    scorecard.history.push(entry);
    scorecard.totalTasksCompleted += 1;
    scorecard.updatedAt = Date.now();

    // Recompute dimensions from history with decay
    this.recomputeDimensions(scorecard);
    scorecard.standing = computeStanding(scorecard.overall);

    await this.saveScorecard(scorecard);
    return scorecard;
  }

  /** Record that an agent asked a clarifying question (proactivity signal) */
  async recordQuestion(agentId: string): Promise<void> {
    const scorecard = await this.loadScorecard(agentId);
    scorecard.totalQuestionsAsked += 1;
    scorecard.updatedAt = Date.now();
    await this.saveScorecard(scorecard);
  }

  /** Record a tool error for an agent (reliability signal) */
  async recordToolError(agentId: string): Promise<void> {
    const scorecard = await this.loadScorecard(agentId);
    // Small reliability penalty per tool error
    scorecard.dimensions.reliability = Math.max(0, scorecard.dimensions.reliability - 2);
    scorecard.overall = computeOverallScore(scorecard.dimensions);
    scorecard.standing = computeStanding(scorecard.overall);
    scorecard.updatedAt = Date.now();
    await this.saveScorecard(scorecard);
  }

  /** Get all scorecards for the leaderboard */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const scorecards = await this.loadAllScorecards();
    return scorecards
      .sort((a, b) => b.overall - a.overall)
      .map((sc, i) => ({
        agentId: sc.agentId,
        overall: sc.overall,
        standing: sc.standing,
        totalTasksCompleted: sc.totalTasksCompleted,
        rank: i + 1,
      }));
  }

  async loadAllScorecards(): Promise<AgentScorecard[]> {
    try {
      const files = await fs.readdir(this.dir);
      const scorecards: AgentScorecard[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const data = await fs.readFile(path.join(this.dir, file), "utf-8");
            scorecards.push(JSON.parse(data) as AgentScorecard);
          } catch {
            // skip corrupted files
          }
        }
      }
      return scorecards;
    } catch {
      return [];
    }
  }

  async resetScorecard(agentId: string): Promise<AgentScorecard> {
    const scorecard = this.createDefault(agentId);
    await this.saveScorecard(scorecard);
    return scorecard;
  }

  /** Apply exponential decay to older entries and recompute dimensions */
  decayScores(scorecard: AgentScorecard, decayDays: number): AgentScorecard {
    const copy = structuredClone(scorecard);
    this.recomputeDimensions(copy, decayDays);
    copy.standing = computeStanding(copy.overall);
    return copy;
  }

  private recomputeDimensions(scorecard: AgentScorecard, decayDays = 30): void {
    const { history } = scorecard;
    if (history.length === 0) {
      return;
    }

    const now = Date.now();
    const decayMs = decayDays * 24 * 60 * 60 * 1000;
    let totalWeight = 0;
    const sums: DimensionScores = { completion: 0, quality: 0, proactivity: 0, reliability: 0, initiative: 0 };

    for (const entry of history) {
      const age = now - entry.timestamp;
      // Exponential decay: weight = e^(-age/decayMs)
      const weight = Math.exp(-age / decayMs);
      totalWeight += weight;

      for (const dim of Object.keys(sums) as Array<keyof DimensionScores>) {
        sums[dim] += (entry.scores[dim] ?? 50) * weight;
      }
    }

    if (totalWeight > 0) {
      for (const dim of Object.keys(sums) as Array<keyof DimensionScores>) {
        scorecard.dimensions[dim] = Math.round(sums[dim] / totalWeight);
      }
    }

    scorecard.overall = computeOverallScore(scorecard.dimensions);
  }

  private createDefault(agentId: string): AgentScorecard {
    return {
      agentId,
      overall: computeOverallScore(DEFAULT_SCORES),
      dimensions: { ...DEFAULT_SCORES },
      history: [],
      standing: "standard",
      totalTasksCompleted: 0,
      totalQuestionsAsked: 0,
      updatedAt: Date.now(),
    };
  }

  private scorecardPath(agentId: string): string {
    // Sanitize agent ID for safe file paths
    const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }
}

/** Compute weighted overall score from dimensions */
export function computeOverallScore(dimensions: DimensionScores): number {
  let score = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    score += (dimensions[dim as keyof DimensionScores] ?? 50) * weight;
  }
  return Math.round(score);
}

/** Determine standing from overall score */
export function computeStanding(overall: number): AgentStanding {
  if (overall >= STANDING_THRESHOLDS.star.min) return "star";
  if (overall >= STANDING_THRESHOLDS.trusted.min) return "trusted";
  if (overall >= STANDING_THRESHOLDS.standard.min) return "standard";
  return "probation";
}
