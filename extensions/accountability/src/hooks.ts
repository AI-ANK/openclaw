import type { AccountabilityConfig } from "./types.js";
import type { ScorecardStore } from "./scorecard.js";
import type { TaskBoard } from "./task-board.js";
import { buildAccountabilityContext } from "./prompt-injection.js";
import { buildSelfCritiqueGuidance } from "./self-critique.js";

/**
 * Create the before_prompt_build hook handler.
 * Injects accountability context into the agent's system prompt based on its scorecard.
 */
export function createBeforePromptBuildHook(
  taskBoard: TaskBoard,
  scorecardStore: ScorecardStore,
  config: AccountabilityConfig,
) {
  return async (_event: unknown, ctx: { agentId?: string }) => {
    const agentId = ctx.agentId;
    if (!agentId) {
      return {};
    }

    const scorecard = scorecardStore.decayScores(
      await scorecardStore.loadScorecard(agentId),
      config.scorecardDecayDays,
    );
    const currentTask = await taskBoard.getAgentCurrentTask(agentId);
    const leaderboard = await scorecardStore.getLeaderboard();

    const accountabilityContext = buildAccountabilityContext(scorecard, currentTask, leaderboard);
    const selfCritiqueGuidance = buildSelfCritiqueGuidance(config.selfCritiqueEnabled);

    return {
      prependSystemContext: accountabilityContext + selfCritiqueGuidance,
    };
  };
}

/**
 * Create the after_tool_call hook handler.
 * Tracks tool errors for reliability scoring.
 */
export function createAfterToolCallHook(scorecardStore: ScorecardStore) {
  return async (event: { error?: boolean; toolName?: string }, ctx: { agentId?: string }) => {
    if (!ctx.agentId) {
      return;
    }

    if (event.error) {
      await scorecardStore.recordToolError(ctx.agentId);
    }
  };
}
