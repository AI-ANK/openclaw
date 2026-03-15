import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScorecardStore, computeOverallScore, computeStanding } from "./scorecard.js";

describe("computeOverallScore", () => {
  it("returns 50 for default scores", () => {
    const score = computeOverallScore({
      completion: 50,
      quality: 50,
      proactivity: 50,
      reliability: 50,
      initiative: 50,
    });
    expect(score).toBe(50);
  });

  it("weights dimensions correctly", () => {
    // completion=100 (weight 0.30), rest=0
    const score = computeOverallScore({
      completion: 100,
      quality: 0,
      proactivity: 0,
      reliability: 0,
      initiative: 0,
    });
    expect(score).toBe(30);
  });

  it("returns 100 for perfect scores", () => {
    const score = computeOverallScore({
      completion: 100,
      quality: 100,
      proactivity: 100,
      reliability: 100,
      initiative: 100,
    });
    expect(score).toBe(100);
  });
});

describe("computeStanding", () => {
  it("returns probation for low scores", () => {
    expect(computeStanding(0)).toBe("probation");
    expect(computeStanding(29)).toBe("probation");
  });

  it("returns standard for mid-range scores", () => {
    expect(computeStanding(30)).toBe("standard");
    expect(computeStanding(59)).toBe("standard");
  });

  it("returns trusted for high scores", () => {
    expect(computeStanding(60)).toBe("trusted");
    expect(computeStanding(84)).toBe("trusted");
  });

  it("returns star for top scores", () => {
    expect(computeStanding(85)).toBe("star");
    expect(computeStanding(100)).toBe("star");
  });
});

describe("ScorecardStore", () => {
  let tmpDir: string;
  let store: ScorecardStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scorecard-test-"));
    store = new ScorecardStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a default scorecard for unknown agent", async () => {
    const sc = await store.loadScorecard("agent-new");
    expect(sc.agentId).toBe("agent-new");
    expect(sc.overall).toBe(50);
    expect(sc.standing).toBe("standard");
    expect(sc.totalTasksCompleted).toBe(0);
    expect(sc.history).toEqual([]);
  });

  it("persists and loads scorecard", async () => {
    const sc = await store.loadScorecard("agent-1");
    sc.dimensions.completion = 90;
    sc.overall = computeOverallScore(sc.dimensions);
    await store.saveScorecard(sc);

    const loaded = await store.loadScorecard("agent-1");
    expect(loaded.dimensions.completion).toBe(90);
  });

  it("records task outcome and recomputes standing", async () => {
    const sc = await store.recordTaskOutcome("agent-1", {
      taskId: "task-1",
      timestamp: Date.now(),
      scores: {
        completion: 95,
        quality: 90,
        proactivity: 85,
        reliability: 92,
        initiative: 80,
      },
    });

    expect(sc.totalTasksCompleted).toBe(1);
    expect(sc.overall).toBeGreaterThan(80);
    expect(sc.standing).toBe("star");
  });

  it("degrades standing with poor task outcomes", async () => {
    const sc = await store.recordTaskOutcome("agent-2", {
      taskId: "task-1",
      timestamp: Date.now(),
      scores: {
        completion: 10,
        quality: 15,
        proactivity: 5,
        reliability: 10,
        initiative: 5,
      },
    });

    expect(sc.overall).toBeLessThan(30);
    expect(sc.standing).toBe("probation");
  });

  it("records tool errors and reduces reliability", async () => {
    const before = await store.loadScorecard("agent-1");
    const reliabilityBefore = before.dimensions.reliability;

    await store.recordToolError("agent-1");
    const after = await store.loadScorecard("agent-1");
    expect(after.dimensions.reliability).toBeLessThan(reliabilityBefore);
  });

  it("records questions and increments counter", async () => {
    await store.recordQuestion("agent-1");
    await store.recordQuestion("agent-1");

    const sc = await store.loadScorecard("agent-1");
    expect(sc.totalQuestionsAsked).toBe(2);
  });

  describe("leaderboard", () => {
    it("ranks agents by overall score", async () => {
      await store.recordTaskOutcome("agent-a", {
        taskId: "t1",
        timestamp: Date.now(),
        scores: { completion: 90, quality: 90, proactivity: 90, reliability: 90, initiative: 90 },
      });
      await store.recordTaskOutcome("agent-b", {
        taskId: "t2",
        timestamp: Date.now(),
        scores: { completion: 40, quality: 40, proactivity: 40, reliability: 40, initiative: 40 },
      });
      await store.recordTaskOutcome("agent-c", {
        taskId: "t3",
        timestamp: Date.now(),
        scores: { completion: 70, quality: 70, proactivity: 70, reliability: 70, initiative: 70 },
      });

      const lb = await store.getLeaderboard();
      expect(lb).toHaveLength(3);
      expect(lb[0]?.agentId).toBe("agent-a");
      expect(lb[0]?.rank).toBe(1);
      expect(lb[1]?.agentId).toBe("agent-c");
      expect(lb[1]?.rank).toBe(2);
      expect(lb[2]?.agentId).toBe("agent-b");
      expect(lb[2]?.rank).toBe(3);
    });
  });

  describe("decayScores", () => {
    it("reduces weight of older entries", async () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Record an old excellent score and a recent poor score
      await store.recordTaskOutcome("agent-1", {
        taskId: "old",
        timestamp: thirtyDaysAgo,
        scores: { completion: 95, quality: 95, proactivity: 95, reliability: 95, initiative: 95 },
      });
      const sc = await store.recordTaskOutcome("agent-1", {
        taskId: "recent",
        timestamp: now,
        scores: { completion: 30, quality: 30, proactivity: 30, reliability: 30, initiative: 30 },
      });

      const decayed = store.decayScores(sc, 30);
      // Recent score should dominate, so overall should be closer to 30 than 95
      expect(decayed.overall).toBeLessThan(50);
    });
  });

  it("resets scorecard to default", async () => {
    await store.recordTaskOutcome("agent-1", {
      taskId: "t1",
      timestamp: Date.now(),
      scores: { completion: 90, quality: 90, proactivity: 90, reliability: 90, initiative: 90 },
    });

    const reset = await store.resetScorecard("agent-1");
    expect(reset.overall).toBe(50);
    expect(reset.totalTasksCompleted).toBe(0);
    expect(reset.history).toEqual([]);
  });
});
