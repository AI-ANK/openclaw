import { describe, expect, it } from "vitest";
import { buildAccountabilityContext } from "./prompt-injection.js";
import type { AgentScorecard, LeaderboardEntry, Task } from "./types.js";

function makeScorecard(overrides: Partial<AgentScorecard> = {}): AgentScorecard {
  return {
    agentId: "test-agent",
    overall: 50,
    dimensions: {
      completion: 50,
      quality: 50,
      proactivity: 50,
      reliability: 50,
      initiative: 50,
    },
    history: [],
    standing: "standard",
    totalTasksCompleted: 5,
    totalQuestionsAsked: 2,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Build login page",
    description: "Create a login form with email and password",
    status: "claimed",
    priority: "high",
    createdAt: Date.now(),
    acceptanceCriteria: ["Email validation", "Password minimum 8 chars"],
    ...overrides,
  };
}

describe("buildAccountabilityContext", () => {
  it("includes standing and overall score", () => {
    const ctx = buildAccountabilityContext(makeScorecard(), null, []);
    expect(ctx).toContain("STANDARD");
    expect(ctx).toContain("50/100");
  });

  it("includes dimension scores with bars", () => {
    const ctx = buildAccountabilityContext(makeScorecard(), null, []);
    expect(ctx).toContain("Completion:");
    expect(ctx).toContain("Quality:");
    expect(ctx).toContain("Proactivity:");
  });

  it("shows current task details when provided", () => {
    const ctx = buildAccountabilityContext(makeScorecard(), makeTask(), []);
    expect(ctx).toContain("Build login page");
    expect(ctx).toContain("high priority");
    expect(ctx).toContain("Email validation");
    expect(ctx).toContain("Password minimum 8 chars");
  });

  it("shows weaknesses for low dimensions", () => {
    const sc = makeScorecard({
      dimensions: {
        completion: 30,
        quality: 25,
        proactivity: 80,
        reliability: 70,
        initiative: 60,
      },
    });
    const ctx = buildAccountabilityContext(sc, null, []);
    expect(ctx).toContain("Areas for Improvement");
    expect(ctx).toContain("quality");
    expect(ctx).toContain("completion");
  });

  it("does not show weaknesses when all dimensions are good", () => {
    const sc = makeScorecard({
      dimensions: {
        completion: 80,
        quality: 75,
        proactivity: 70,
        reliability: 65,
        initiative: 60,
      },
    });
    const ctx = buildAccountabilityContext(sc, null, []);
    expect(ctx).not.toContain("Areas for Improvement");
  });

  it("includes leaderboard when multiple agents", () => {
    const leaderboard: LeaderboardEntry[] = [
      { agentId: "agent-a", overall: 85, standing: "star", totalTasksCompleted: 10, rank: 1 },
      { agentId: "test-agent", overall: 50, standing: "standard", totalTasksCompleted: 5, rank: 2 },
      { agentId: "agent-c", overall: 30, standing: "standard", totalTasksCompleted: 3, rank: 3 },
    ];
    const ctx = buildAccountabilityContext(makeScorecard(), null, leaderboard);
    expect(ctx).toContain("Team Leaderboard");
    expect(ctx).toContain("#2 of 3");
    expect(ctx).toContain("(you)");
  });

  it("uses probation-specific principles for low standing", () => {
    const sc = makeScorecard({ standing: "probation", overall: 20 });
    const ctx = buildAccountabilityContext(sc, null, []);
    expect(ctx).toContain("PROBATION");
    expect(ctx).toContain("explain your reasoning for EVERY decision");
    expect(ctx).toContain("ALWAYS ask a clarifying question");
  });

  it("uses star-specific principles for top standing", () => {
    const sc = makeScorecard({ standing: "star", overall: 92 });
    const ctx = buildAccountabilityContext(sc, null, []);
    expect(ctx).toContain("STAR PERFORMER");
    expect(ctx).toContain("propose architectural or process improvements");
    expect(ctx).toContain("sets the standard");
  });

  it("includes evaluation criteria transparency", () => {
    const ctx = buildAccountabilityContext(makeScorecard(), null, []);
    expect(ctx).toContain("How You Are Evaluated");
    expect(ctx).toContain("Completion (30%)");
    expect(ctx).toContain("task_board");
    expect(ctx).toContain("task_complete");
    expect(ctx).toContain("task_question");
  });

  it("includes task completion and question stats", () => {
    const sc = makeScorecard({ totalTasksCompleted: 12, totalQuestionsAsked: 7 });
    const ctx = buildAccountabilityContext(sc, null, []);
    expect(ctx).toContain("Tasks completed: 12");
    expect(ctx).toContain("Questions asked: 7");
  });
});
