import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PRIORITY_ORDER } from "./constants.js";
import type { Task, TaskPriority, TaskQuestion, TaskResult, TaskStatus } from "./types.js";

/** JSON-file-backed task queue */
export class TaskBoard {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "tasks.json");
  }

  async loadTasks(): Promise<Task[]> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(data) as Task[];
    } catch {
      return [];
    }
  }

  private async saveTasks(tasks: Task[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(tasks, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  async addTask(partial: {
    title: string;
    description: string;
    priority?: TaskPriority;
    tags?: string[];
    acceptanceCriteria?: string[];
  }): Promise<Task> {
    const tasks = await this.loadTasks();
    const task: Task = {
      id: crypto.randomBytes(8).toString("hex"),
      title: partial.title,
      description: partial.description,
      status: "open",
      priority: partial.priority ?? "medium",
      createdAt: Date.now(),
      tags: partial.tags,
      acceptanceCriteria: partial.acceptanceCriteria,
    };
    tasks.push(task);
    await this.saveTasks(tasks);
    return task;
  }

  /** Claim the highest-priority open task, or a specific task by ID */
  async claimTask(agentId: string, taskId?: string): Promise<Task | null> {
    const tasks = await this.loadTasks();

    let target: Task | undefined;
    if (taskId) {
      target = tasks.find((t) => t.id === taskId && t.status === "open");
    } else {
      // Pick highest priority open task
      const open = tasks
        .filter((t) => t.status === "open")
        .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
      target = open[0];
    }

    if (!target) {
      return null;
    }

    target.status = "claimed";
    target.assignedAgent = agentId;
    target.claimedAt = Date.now();
    await this.saveTasks(tasks);
    return target;
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: TaskResult,
  ): Promise<Task | null> {
    const tasks = await this.loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      return null;
    }

    task.status = status;
    if (result) {
      task.result = result;
    }
    if (status === "done") {
      task.completedAt = Date.now();
    }
    await this.saveTasks(tasks);
    return task;
  }

  async getOpenTasks(): Promise<Task[]> {
    const tasks = await this.loadTasks();
    return tasks
      .filter((t) => t.status === "open")
      .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }

  async getAgentTasks(agentId: string): Promise<Task[]> {
    const tasks = await this.loadTasks();
    return tasks.filter((t) => t.assignedAgent === agentId);
  }

  /** Get the agent's currently active task (claimed or in_progress) */
  async getAgentCurrentTask(agentId: string): Promise<Task | null> {
    const tasks = await this.loadTasks();
    return (
      tasks.find(
        (t) => t.assignedAgent === agentId && (t.status === "claimed" || t.status === "in_progress"),
      ) ?? null
    );
  }

  /** Break a vague task into concrete subtasks */
  async decomposeTask(
    taskId: string,
    subtasks: Array<{ title: string; description: string }>,
  ): Promise<Task[]> {
    const tasks = await this.loadTasks();
    const parent = tasks.find((t) => t.id === taskId);
    if (!parent) {
      throw new Error(`Task ${taskId} not found`);
    }

    const created: Task[] = [];
    for (const sub of subtasks) {
      const task: Task = {
        id: crypto.randomBytes(8).toString("hex"),
        title: sub.title,
        description: sub.description,
        status: "open",
        priority: parent.priority,
        createdAt: Date.now(),
        parentTaskId: taskId,
        tags: parent.tags,
      };
      tasks.push(task);
      created.push(task);
    }

    // Mark parent as blocked (waiting for subtasks)
    parent.status = "blocked";
    await this.saveTasks(tasks);
    return created;
  }

  /** Record a question asked by the agent about a task */
  async recordQuestion(taskId: string, question: TaskQuestion): Promise<Task | null> {
    const tasks = await this.loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      return null;
    }

    if (!task.questions) {
      task.questions = [];
    }
    task.questions.push(question);
    await this.saveTasks(tasks);
    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const tasks = await this.loadTasks();
    return tasks.find((t) => t.id === taskId) ?? null;
  }
}
