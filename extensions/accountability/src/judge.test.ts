import { describe, expect, it } from "vitest";
import { buildJudgePrompt } from "./judge.js";
import type { Task } from "./types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Build user authentication",
    description: "Implement JWT-based auth with login and signup endpoints",
    status: "review",
    priority: "high",
    createdAt: Date.now(),
    acceptanceCriteria: [
      "Login endpoint returns JWT token",
      "Signup validates email format",
      "Passwords hashed with bcrypt",
    ],
    ...overrides,
  };
}

describe("buildJudgePrompt", () => {
  it("includes task details", () => {
    const prompt = buildJudgePrompt(makeTask(), "I built the auth system", "I think it's good, 80/100");
    expect(prompt).toContain("Build user authentication");
    expect(prompt).toContain("JWT-based auth");
  });

  it("includes acceptance criteria", () => {
    const prompt = buildJudgePrompt(makeTask(), "output", "self");
    expect(prompt).toContain("Login endpoint returns JWT token");
    expect(prompt).toContain("Signup validates email format");
    expect(prompt).toContain("Passwords hashed with bcrypt");
  });

  it("includes agent output and self-critique", () => {
    const prompt = buildJudgePrompt(makeTask(), "Built all endpoints", "Score: 85/100");
    expect(prompt).toContain("Built all endpoints");
    expect(prompt).toContain("Score: 85/100");
  });

  it("includes all evaluation dimensions", () => {
    const prompt = buildJudgePrompt(makeTask(), "output", "self");
    expect(prompt).toContain("completion");
    expect(prompt).toContain("quality");
    expect(prompt).toContain("proactivity");
    expect(prompt).toContain("reliability");
    expect(prompt).toContain("initiative");
  });

  it("requests JSON output format", () => {
    const prompt = buildJudgePrompt(makeTask(), "output", "self");
    expect(prompt).toContain("Return ONLY a valid JSON object");
    expect(prompt).toContain("overallScore");
    expect(prompt).toContain("calibrationDelta");
  });

  it("includes scoring weights", () => {
    const prompt = buildJudgePrompt(makeTask(), "output", "self");
    expect(prompt).toContain("completion 30%");
    expect(prompt).toContain("quality 25%");
    expect(prompt).toContain("proactivity 20%");
    expect(prompt).toContain("reliability 15%");
    expect(prompt).toContain("initiative 10%");
  });

  it("handles missing acceptance criteria", () => {
    const task = makeTask({ acceptanceCriteria: undefined });
    const prompt = buildJudgePrompt(task, "output", "self");
    expect(prompt).toContain("(none specified)");
  });
});
