import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskBoard } from "./task-board.js";

describe("TaskBoard", () => {
  let tmpDir: string;
  let board: TaskBoard;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "accountability-test-"));
    board = new TaskBoard(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("starts with empty task list", async () => {
    const tasks = await board.loadTasks();
    expect(tasks).toEqual([]);
  });

  it("adds a task with defaults", async () => {
    const task = await board.addTask({
      title: "Build login page",
      description: "Create a login form with email and password fields",
    });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe("Build login page");
    expect(task.status).toBe("open");
    expect(task.priority).toBe("medium");
    expect(task.createdAt).toBeGreaterThan(0);
  });

  it("adds a task with explicit fields", async () => {
    const task = await board.addTask({
      title: "Fix critical bug",
      description: "Fix the crash on startup",
      priority: "critical",
      tags: ["bug", "urgent"],
      acceptanceCriteria: ["No crash on startup", "All tests pass"],
    });

    expect(task.priority).toBe("critical");
    expect(task.tags).toEqual(["bug", "urgent"]);
    expect(task.acceptanceCriteria).toEqual(["No crash on startup", "All tests pass"]);
  });

  it("persists tasks across loads", async () => {
    await board.addTask({ title: "Task 1", description: "desc" });
    await board.addTask({ title: "Task 2", description: "desc" });

    const board2 = new TaskBoard(tmpDir);
    const tasks = await board2.loadTasks();
    expect(tasks).toHaveLength(2);
  });

  describe("claimTask", () => {
    it("claims the highest priority task when no ID specified", async () => {
      await board.addTask({ title: "Low", description: "d", priority: "low" });
      await board.addTask({ title: "Critical", description: "d", priority: "critical" });
      await board.addTask({ title: "Medium", description: "d", priority: "medium" });

      const claimed = await board.claimTask("agent-1");
      expect(claimed?.title).toBe("Critical");
      expect(claimed?.status).toBe("claimed");
      expect(claimed?.assignedAgent).toBe("agent-1");
      expect(claimed?.claimedAt).toBeGreaterThan(0);
    });

    it("claims a specific task by ID", async () => {
      const t1 = await board.addTask({ title: "Task 1", description: "d" });
      await board.addTask({ title: "Task 2", description: "d", priority: "critical" });

      const claimed = await board.claimTask("agent-1", t1.id);
      expect(claimed?.title).toBe("Task 1");
    });

    it("returns null when no open tasks", async () => {
      const result = await board.claimTask("agent-1");
      expect(result).toBeNull();
    });

    it("returns null for already claimed task", async () => {
      const task = await board.addTask({ title: "Task", description: "d" });
      await board.claimTask("agent-1", task.id);

      const result = await board.claimTask("agent-2", task.id);
      expect(result).toBeNull();
    });
  });

  describe("updateTaskStatus", () => {
    it("updates status and sets completedAt for done tasks", async () => {
      const task = await board.addTask({ title: "Task", description: "d" });
      const updated = await board.updateTaskStatus(task.id, "done", {
        summary: "Completed successfully",
      });

      expect(updated?.status).toBe("done");
      expect(updated?.completedAt).toBeGreaterThan(0);
      expect(updated?.result?.summary).toBe("Completed successfully");
    });

    it("returns null for unknown task", async () => {
      const result = await board.updateTaskStatus("nonexistent", "done");
      expect(result).toBeNull();
    });
  });

  describe("getOpenTasks", () => {
    it("returns open tasks sorted by priority", async () => {
      await board.addTask({ title: "Low", description: "d", priority: "low" });
      await board.addTask({ title: "High", description: "d", priority: "high" });
      await board.addTask({ title: "Medium", description: "d", priority: "medium" });

      const open = await board.getOpenTasks();
      expect(open.map((t) => t.title)).toEqual(["High", "Medium", "Low"]);
    });

    it("excludes claimed tasks", async () => {
      const t = await board.addTask({ title: "Task", description: "d" });
      await board.claimTask("agent-1", t.id);

      const open = await board.getOpenTasks();
      expect(open).toHaveLength(0);
    });
  });

  describe("decomposeTask", () => {
    it("creates subtasks linked to parent", async () => {
      const parent = await board.addTask({
        title: "Big Feature",
        description: "Build everything",
        priority: "high",
        tags: ["feature"],
      });

      const subtasks = await board.decomposeTask(parent.id, [
        { title: "Step 1", description: "First step" },
        { title: "Step 2", description: "Second step" },
      ]);

      expect(subtasks).toHaveLength(2);
      expect(subtasks[0]?.parentTaskId).toBe(parent.id);
      expect(subtasks[0]?.priority).toBe("high");
      expect(subtasks[0]?.tags).toEqual(["feature"]);

      // Parent should be blocked
      const updated = await board.getTask(parent.id);
      expect(updated?.status).toBe("blocked");
    });
  });

  describe("recordQuestion", () => {
    it("records a question on a task", async () => {
      const task = await board.addTask({ title: "Task", description: "d" });
      const updated = await board.recordQuestion(task.id, {
        question: "What auth method should I use?",
        context: "There are multiple options",
        askedAt: Date.now(),
      });

      expect(updated?.questions).toHaveLength(1);
      expect(updated?.questions?.[0]?.question).toBe("What auth method should I use?");
    });
  });

  describe("getAgentCurrentTask", () => {
    it("returns claimed task for agent", async () => {
      const t = await board.addTask({ title: "Task", description: "d" });
      await board.claimTask("agent-1", t.id);

      const current = await board.getAgentCurrentTask("agent-1");
      expect(current?.title).toBe("Task");
    });

    it("returns null when agent has no active task", async () => {
      const result = await board.getAgentCurrentTask("agent-1");
      expect(result).toBeNull();
    });
  });
});
