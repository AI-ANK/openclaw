import path from "node:path";
import os from "node:os";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/accountability";
import { createDashboardHandler } from "./src/dashboard.js";
import { createBeforePromptBuildHook, createAfterToolCallHook } from "./src/hooks.js";
import { EvaluationJudge } from "./src/judge.js";
import { ScorecardStore } from "./src/scorecard.js";
import { TaskBoard } from "./src/task-board.js";
import { createTaskBoardTool, createTaskCompleteTool, createTaskQuestionTool } from "./src/tools.js";
import type { AccountabilityConfig } from "./src/types.js";

const plugin = {
  id: "accountability",
  name: "Accountability",
  description: "Psychology-inspired AI agent accountability framework with task board, scorecards, and evaluation.",
  register(api: OpenClawPluginApi) {
    // Resolve plugin configuration
    // oxlint-disable-next-line typescript/no-explicit-any
    const rawConfig = (api.pluginConfig ?? {}) as any;
    const config: AccountabilityConfig = {
      dataDir: rawConfig.dataDir ?? path.join(os.homedir(), ".openclaw", "accountability"),
      evaluationModel: rawConfig.evaluationModel,
      evaluationProvider: rawConfig.evaluationProvider,
      scorecardDecayDays: rawConfig.scorecardDecayDays ?? 30,
      selfCritiqueEnabled: rawConfig.selfCritiqueEnabled ?? true,
    };

    // Instantiate core services
    const taskBoard = new TaskBoard(config.dataDir);
    const scorecardStore = new ScorecardStore(config.dataDir);
    const judge = new EvaluationJudge(config, api.config);

    // Register agent-facing tools
    api.registerTool(createTaskBoardTool(taskBoard, scorecardStore) as unknown as AnyAgentTool);
    api.registerTool(createTaskCompleteTool(taskBoard, scorecardStore, judge) as unknown as AnyAgentTool);
    api.registerTool(createTaskQuestionTool(taskBoard, scorecardStore) as unknown as AnyAgentTool);

    // Register lifecycle hooks
    api.on("before_prompt_build", createBeforePromptBuildHook(taskBoard, scorecardStore, config));
    api.on("after_tool_call", createAfterToolCallHook(scorecardStore));

    // Register HTTP route for web dashboard
    api.registerHttpRoute({
      path: "/plugins/accountability",
      auth: "plugin",
      match: "prefix",
      handler: createDashboardHandler(taskBoard, scorecardStore),
    });
  },
};

export default plugin;
