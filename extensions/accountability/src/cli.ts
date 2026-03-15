import type { ScorecardStore } from "./scorecard.js";
import type { TaskBoard } from "./task-board.js";
import type { TaskPriority } from "./types.js";

/** CLI handler for `openclaw accountability` subcommands */
export function createCliHandler(taskBoard: TaskBoard, scorecardStore: ScorecardStore) {
  return async (args: string[]): Promise<string> => {
    const command = args[0] ?? "help";

    switch (command) {
      case "board":
        return await handleBoard(taskBoard);
      case "add":
        return await handleAdd(taskBoard, args.slice(1));
      case "scorecard":
        return await handleScorecard(scorecardStore, args[1]);
      case "leaderboard":
        return await handleLeaderboard(scorecardStore);
      case "history":
        return await handleHistory(scorecardStore, args[1]);
      case "reset":
        return await handleReset(scorecardStore, args[1]);
      default:
        return HELP_TEXT;
    }
  };
}

async function handleBoard(taskBoard: TaskBoard): Promise<string> {
  const tasks = await taskBoard.loadTasks();
  if (tasks.length === 0) {
    return "No tasks on the board. Use 'openclaw accountability add' to create one.";
  }

  const lines: string[] = ["TASK BOARD", "=".repeat(60), ""];

  const byStatus = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const group = byStatus.get(task.status) ?? [];
    group.push(task);
    byStatus.set(task.status, group);
  }

  for (const status of ["open", "claimed", "in_progress", "review", "done", "blocked"]) {
    const group = byStatus.get(status);
    if (!group || group.length === 0) continue;

    lines.push(`--- ${status.toUpperCase()} (${group.length}) ---`);
    for (const task of group) {
      const agent = task.assignedAgent ? ` [${task.assignedAgent}]` : "";
      const score = task.result?.judgeScore ? ` (score: ${task.result.judgeScore}/100)` : "";
      lines.push(`  [${task.priority.toUpperCase().padEnd(8)}] ${task.title} (${task.id})${agent}${score}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function handleAdd(taskBoard: TaskBoard, args: string[]): Promise<string> {
  let title = "";
  let description = "";
  let priority: TaskPriority = "medium";
  const tags: string[] = [];
  const criteria: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--title" && next) {
      title = next;
      i++;
    } else if (arg === "--description" && next) {
      description = next;
      i++;
    } else if (arg === "--priority" && next) {
      priority = next as TaskPriority;
      i++;
    } else if (arg === "--tag" && next) {
      tags.push(next);
      i++;
    } else if (arg === "--criterion" && next) {
      criteria.push(next);
      i++;
    }
  }

  if (!title) {
    return "Error: --title is required. Usage: openclaw accountability add --title \"...\" --description \"...\" [--priority high] [--tag feature] [--criterion \"...\"]";
  }

  const task = await taskBoard.addTask({
    title,
    description: description || title,
    priority,
    tags: tags.length > 0 ? tags : undefined,
    acceptanceCriteria: criteria.length > 0 ? criteria : undefined,
  });

  return `Task created: ${task.title} (${task.id}) [${task.priority}]`;
}

async function handleScorecard(scorecardStore: ScorecardStore, agentId?: string): Promise<string> {
  if (!agentId) {
    // Show all scorecards
    const all = await scorecardStore.loadAllScorecards();
    if (all.length === 0) {
      return "No agent scorecards found. Agents will get scorecards after their first task.";
    }
    const lines: string[] = ["AGENT SCORECARDS", "=".repeat(60), ""];
    for (const sc of all) {
      lines.push(`${sc.agentId}: ${sc.standing.toUpperCase()} (${sc.overall}/100) - ${sc.totalTasksCompleted} tasks completed`);
    }
    return lines.join("\n");
  }

  const sc = await scorecardStore.loadScorecard(agentId);
  const lines: string[] = [
    `SCORECARD: ${sc.agentId}`,
    "=".repeat(60),
    "",
    `Standing:    ${sc.standing.toUpperCase()}`,
    `Overall:     ${sc.overall}/100`,
    "",
    "Dimensions:",
    `  Completion:  ${sc.dimensions.completion}/100`,
    `  Quality:     ${sc.dimensions.quality}/100`,
    `  Proactivity: ${sc.dimensions.proactivity}/100`,
    `  Reliability: ${sc.dimensions.reliability}/100`,
    `  Initiative:  ${sc.dimensions.initiative}/100`,
    "",
    `Tasks completed:  ${sc.totalTasksCompleted}`,
    `Questions asked:  ${sc.totalQuestionsAsked}`,
    `Last updated:     ${new Date(sc.updatedAt).toISOString()}`,
  ];

  return lines.join("\n");
}

async function handleLeaderboard(scorecardStore: ScorecardStore): Promise<string> {
  const leaderboard = await scorecardStore.getLeaderboard();
  if (leaderboard.length === 0) {
    return "No agents on the leaderboard yet.";
  }

  const lines: string[] = ["LEADERBOARD", "=".repeat(60), ""];
  for (const entry of leaderboard) {
    const standing = entry.standing.toUpperCase().padEnd(10);
    lines.push(`  #${entry.rank}  ${entry.agentId.padEnd(20)} ${standing} ${entry.overall}/100  (${entry.totalTasksCompleted} tasks)`);
  }

  return lines.join("\n");
}

async function handleHistory(scorecardStore: ScorecardStore, agentId?: string): Promise<string> {
  if (!agentId) {
    return "Error: agentId required. Usage: openclaw accountability history <agentId>";
  }

  const sc = await scorecardStore.loadScorecard(agentId);
  if (sc.history.length === 0) {
    return `No task history for ${agentId}.`;
  }

  const lines: string[] = [`TASK HISTORY: ${agentId}`, "=".repeat(60), ""];

  // Show most recent 20 entries
  const recent = sc.history.slice(-20).reverse();
  for (const entry of recent) {
    const date = new Date(entry.timestamp).toISOString().slice(0, 10);
    const avg = Math.round(
      (entry.scores.completion + entry.scores.quality + entry.scores.proactivity +
        entry.scores.reliability + entry.scores.initiative) / 5,
    );
    lines.push(`  ${date}  Task: ${entry.taskId}  Score: ${avg}/100`);
    if (entry.notes) {
      lines.push(`           ${entry.notes.slice(0, 80)}`);
    }
  }

  return lines.join("\n");
}

async function handleReset(scorecardStore: ScorecardStore, agentId?: string): Promise<string> {
  if (!agentId) {
    return "Error: agentId required. Usage: openclaw accountability reset <agentId>";
  }

  await scorecardStore.resetScorecard(agentId);
  return `Scorecard for ${agentId} has been reset to default (standard standing, 50/100).`;
}

const HELP_TEXT = `OpenClaw Accountability Framework

Commands:
  openclaw accountability board              - View all tasks
  openclaw accountability add --title "..."  - Add a new task
  openclaw accountability scorecard [agent]  - View scorecards
  openclaw accountability leaderboard        - View agent rankings
  openclaw accountability history <agent>    - View task history
  openclaw accountability reset <agent>      - Reset agent scorecard

Add task options:
  --title "..."          Task title (required)
  --description "..."    Task description
  --priority low|medium|high|critical
  --tag <tag>            Add a tag (repeatable)
  --criterion "..."      Add acceptance criterion (repeatable)`;
