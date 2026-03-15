import { Type } from "@sinclair/typebox";
import type { EvaluationJudge } from "./judge.js";
import type { ScorecardStore } from "./scorecard.js";
import type { TaskBoard } from "./task-board.js";

/**
 * Create the task_board tool — agents use this to view and claim tasks.
 * Actions: list, claim, status, decompose
 */
export function createTaskBoardTool(taskBoard: TaskBoard, scorecardStore: ScorecardStore) {
  return {
    name: "task_board",
    label: "Task Board",
    description:
      "View, claim, and manage tasks on the accountability board. Use 'list' to see open tasks, 'claim' to take a task, 'status' to check your current task and scorecard, 'decompose' to break a vague task into subtasks.",
    parameters: Type.Object({
      action: Type.String({
        description: "Action to perform: list, claim, status, or decompose",
      }),
      taskId: Type.Optional(Type.String({ description: "Task ID (for claim or decompose)" })),
      subtasks: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String(),
            description: Type.String(),
          }),
          { description: "Subtasks for decompose action" },
        ),
      ),
    }),

    async execute(id: string, params: Record<string, unknown>, context: { agentId?: string }) {
      const action = String(params.action ?? "");
      const agentId = context.agentId ?? "unknown";
      const taskId = typeof params.taskId === "string" ? params.taskId : undefined;

      switch (action) {
        case "list": {
          const tasks = await taskBoard.getOpenTasks();
          if (tasks.length === 0) {
            return { content: [{ type: "text", text: "No open tasks on the board." }] };
          }
          const lines = tasks.map(
            (t) => `- [${t.priority.toUpperCase()}] ${t.title} (${t.id})\n  ${t.description}`,
          );
          return {
            content: [{ type: "text", text: `Open tasks (${tasks.length}):\n\n${lines.join("\n\n")}` }],
          };
        }

        case "claim": {
          const claimed = await taskBoard.claimTask(agentId, taskId);
          if (!claimed) {
            return {
              content: [{ type: "text", text: taskId ? `Task ${taskId} is not available.` : "No open tasks to claim." }],
            };
          }
          const criteria = claimed.acceptanceCriteria?.map((c) => `  - ${c}`).join("\n") ?? "  (none)";
          return {
            content: [{
              type: "text",
              text: `Claimed task: ${claimed.title} (${claimed.id})\nPriority: ${claimed.priority}\nDescription: ${claimed.description}\n\nAcceptance Criteria:\n${criteria}`,
            }],
          };
        }

        case "status": {
          const current = await taskBoard.getAgentCurrentTask(agentId);
          const scorecard = await scorecardStore.loadScorecard(agentId);
          const leaderboard = await scorecardStore.getLeaderboard();
          const myRank = leaderboard.find((e) => e.agentId === agentId);

          const parts: string[] = [];
          parts.push(`Agent: ${agentId}`);
          parts.push(`Standing: ${scorecard.standing.toUpperCase()} (${scorecard.overall}/100)`);
          parts.push(`Rank: #${myRank?.rank ?? "?"} of ${leaderboard.length}`);
          parts.push(`Tasks completed: ${scorecard.totalTasksCompleted}`);
          parts.push("");

          if (current) {
            parts.push(`Current task: ${current.title} (${current.id}) [${current.status}]`);
          } else {
            parts.push("No active task. Use task_board with action 'list' to see available tasks.");
          }

          return { content: [{ type: "text", text: parts.join("\n") }] };
        }

        case "decompose": {
          if (!taskId) {
            return { content: [{ type: "text", text: "taskId required for decompose action." }] };
          }
          const subtasks = params.subtasks as Array<{ title: string; description: string }> | undefined;
          if (!subtasks || subtasks.length === 0) {
            return { content: [{ type: "text", text: "subtasks array required for decompose action." }] };
          }
          const created = await taskBoard.decomposeTask(taskId, subtasks);
          const lines = created.map((t) => `- ${t.title} (${t.id})`);
          return {
            content: [{ type: "text", text: `Created ${created.length} subtasks:\n${lines.join("\n")}` }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${action}. Use list, claim, status, or decompose.` }],
          };
      }
    },
  };
}

/**
 * Create the task_complete tool — agents submit completed work with self-assessment.
 */
export function createTaskCompleteTool(
  taskBoard: TaskBoard,
  scorecardStore: ScorecardStore,
  judge: EvaluationJudge,
) {
  return {
    name: "task_complete",
    label: "Task Complete",
    description:
      "Submit completed task work with a mandatory self-assessment. The work will be evaluated by an independent judge. Your self-assessment accuracy affects your credibility score.",
    parameters: Type.Object({
      taskId: Type.String({ description: "ID of the task to complete" }),
      summary: Type.String({ description: "Summary of the work done" }),
      selfAssessment: Type.Object(
        {
          completeness: Type.Number({ description: "Self-rated completeness 0-100" }),
          quality: Type.Number({ description: "Self-rated quality 0-100" }),
          thoroughness: Type.Number({ description: "Self-rated thoroughness 0-100" }),
          notes: Type.Optional(Type.String({ description: "Notes on what could be improved" })),
        },
        { description: "Your honest self-assessment of the work" },
      ),
      artifacts: Type.Optional(
        Type.Array(Type.String(), { description: "File paths or references to work output" }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>, context: { agentId?: string }) {
      const agentId = context.agentId ?? "unknown";
      const taskId = String(params.taskId ?? "");
      const summary = String(params.summary ?? "");
      // oxlint-disable-next-line typescript/no-explicit-any
      const selfAssessment = (params as any).selfAssessment as {
        completeness: number;
        quality: number;
        thoroughness: number;
        notes?: string;
      };

      const task = await taskBoard.getTask(taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task ${taskId} not found.` }] };
      }

      if (task.assignedAgent !== agentId) {
        return { content: [{ type: "text", text: `Task ${taskId} is not assigned to you.` }] };
      }

      const selfScore = Math.round(
        (selfAssessment.completeness + selfAssessment.quality + selfAssessment.thoroughness) / 3,
      );

      // Mark task as in review
      await taskBoard.updateTaskStatus(taskId, "review", {
        summary,
        selfCritiqueScore: selfScore,
        artifacts: (params as Record<string, unknown>).artifacts as string[] | undefined,
      });

      // Run async judge evaluation
      const selfCritiqueText = `Completeness: ${selfAssessment.completeness}/100, Quality: ${selfAssessment.quality}/100, Thoroughness: ${selfAssessment.thoroughness}/100. Notes: ${selfAssessment.notes ?? "none"}`;

      try {
        const judgeResult = await judge.evaluate(task, summary, selfCritiqueText);

        // Update task with judge result
        await taskBoard.updateTaskStatus(taskId, "done", {
          summary,
          selfCritiqueScore: selfScore,
          judgeScore: judgeResult.overallScore,
          judgeRationale: judgeResult.rationale,
        });

        // Record in scorecard
        await scorecardStore.recordTaskOutcome(agentId, {
          taskId,
          timestamp: Date.now(),
          scores: judgeResult.dimensions,
          notes: judgeResult.rationale,
        });

        const delta = judgeResult.calibrationDelta;
        const calibration =
          Math.abs(delta) < 10
            ? "well-calibrated"
            : delta > 0
              ? "overestimated (be more critical next time)"
              : "underestimated (give yourself more credit)";

        return {
          content: [{
            type: "text",
            text: [
              `Task "${task.title}" completed and evaluated.`,
              "",
              `Your self-assessment: ${selfScore}/100`,
              `Judge score: ${judgeResult.overallScore}/100`,
              `Calibration: ${calibration} (delta: ${delta > 0 ? "+" : ""}${delta})`,
              "",
              `Judge rationale: ${judgeResult.rationale}`,
            ].join("\n"),
          }],
        };
      } catch (error) {
        // If judge fails, still mark task done with self-score only
        await taskBoard.updateTaskStatus(taskId, "done", {
          summary,
          selfCritiqueScore: selfScore,
        });

        await scorecardStore.recordTaskOutcome(agentId, {
          taskId,
          timestamp: Date.now(),
          scores: {
            completion: selfAssessment.completeness,
            quality: selfAssessment.quality,
            proactivity: 50,
            reliability: 50,
            initiative: 50,
          },
          notes: `Judge unavailable; used self-assessment. Error: ${String(error)}`,
        });

        return {
          content: [{
            type: "text",
            text: `Task "${task.title}" completed. Judge evaluation unavailable; used your self-assessment (${selfScore}/100).`,
          }],
        };
      }
    },
  };
}

/**
 * Create the task_question tool — agents ask clarifying questions (rewarded in scorecard).
 */
export function createTaskQuestionTool(taskBoard: TaskBoard, scorecardStore: ScorecardStore) {
  return {
    name: "task_question",
    label: "Task Question",
    description:
      "Ask a clarifying question about a task before starting work. Asking good questions is tracked and positively impacts your initiative score.",
    parameters: Type.Object({
      taskId: Type.String({ description: "ID of the task to ask about" }),
      question: Type.String({ description: "Your clarifying question" }),
      context: Type.Optional(Type.String({ description: "Context for why you are asking" })),
    }),

    async execute(_id: string, params: Record<string, unknown>, context: { agentId?: string }) {
      const agentId = context.agentId ?? "unknown";
      const taskId = String(params.taskId ?? "");
      const question = String(params.question ?? "");
      const questionContext = typeof params.context === "string" ? params.context : undefined;

      const task = await taskBoard.recordQuestion(taskId, {
        question,
        context: questionContext,
        askedAt: Date.now(),
      });

      if (!task) {
        return { content: [{ type: "text", text: `Task ${taskId} not found.` }] };
      }

      // Record the question in the scorecard (proactivity signal)
      await scorecardStore.recordQuestion(agentId);

      return {
        content: [{
          type: "text",
          text: `Question recorded for task "${task.title}". This demonstrates initiative and will positively impact your scorecard. The question will be reviewed by the task owner.`,
        }],
      };
    },
  };
}
