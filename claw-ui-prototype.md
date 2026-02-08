# Claw-UI Browser-First Prototype Plan

## Product direction

Claw-UI is a standalone browser-first project that visualizes OpenClaw agents as interactive 2D/2.5D characters in a game-like environment.

Primary behavior for prototype:

- Users register and control their own agents in each agent's home.
- Agents can be controlled through natural language only.
- When agents leave home, users can see nearby public world spaces with other agents.
- Agents can autonomously interact with other agents, and users can also instruct interactions.
- Updates are near-real-time.

## Recommended stack (prototype)

### Frontend

- **TypeScript + React + Vite** for rapid web iteration.
- **PixiJS** for performant 2D/2.5D rendering across modest hardware.
- **Rive** (or Spine) for high-quality character animation state machines.
- **Zustand** for UI/game state.
- **Tailwind + Radix UI** for polished overlays, side panels, modals, and command UI.

Why this stack:

- Browser-first deployment with no app install.
- Faster development and iteration than full 3D engines.
- Wide compatibility while still enabling strong visual quality.

### Backend

- **Node.js (Fastify)** API + realtime gateway.
- **PostgreSQL** for users, agent profiles, homes, world state snapshots, and replay history.
- **Redis** for pub/sub and short-lived presence/session state.

### Realtime transport

- **WebSocket** for world/agent updates.
- Optional fallback: Server-Sent Events for read-only observer modes.

## Suggested architecture

```text
[Browser Client]
  - React app shell
  - Pixi scene + animation controllers
  - NL command panel
         |
         | WebSocket + HTTPS
         v
[Claw-UI API / Realtime Gateway]
  - auth/session
  - world state service
  - command router (NL command -> OpenClaw)
  - event fanout
         |
         | event bridge
         v
[OpenClaw Connector]
  - subscribe to OpenClaw agent state/events
  - normalize into Claw-UI event contract
  - push NL command intents to OpenClaw

Data stores:
- PostgreSQL: durable models + replay
- Redis: presence + ephemeral world cache + fanout
```

## Agent behavior model for visuals

Map agent runtime activity into render states:

- `idle`
- `moving`
- `coding`
- `thinking`
- `talking`
- `sleeping`
- `socializing`

Each state drives:

- Character animation clip/state machine transitions.
- Interaction affordances (click targets, info popovers).
- Home/world props (desk, bed, terminal, street spots).

## Event contract (v1)

Use a stable normalized event schema so rendering and runtime logic stay decoupled.

- `agent.registered`
- `agent.presence.changed`
- `agent.state.changed`
- `agent.task.started`
- `agent.task.progress`
- `agent.task.completed`
- `agent.dialogue.generated`
- `agent.location.changed`
- `world.proximity.entered`
- `world.proximity.left`

Core payload shape:

```json
{
  "event": "agent.state.changed",
  "agentId": "agt_123",
  "timestamp": "2026-01-10T10:00:00.000Z",
  "state": {
    "mode": "coding",
    "emotion": "focused",
    "location": "home.office",
    "target": "task_98"
  }
}
```

## Agent awareness of UI

To keep agents aware of what users see, provide an explicit UI context channel to OpenClaw:

- `ui.visible_region` (room/world segment + visible entities)
- `ui.user_focus` (selected object/agent)
- `ui.recent_interactions` (click, inspect, command)
- `ui.viewport_meta` (zoom, camera mode)

This context should be attached to command processing and relevant planning cycles so agent behavior can reference visible world state.

## Prototype feature slices (4-week target)

### Week 1

- Auth + account setup.
- Agent registration (connect OpenClaw agent).
- Single “home” map.
- WebSocket plumbing and mock state transitions.

### Week 2

- Real agent event ingestion via OpenClaw connector.
- NL command panel wired to OpenClaw command path.
- State-to-animation mapping for 5 core states (`idle`, `moving`, `coding`, `sleeping`, `talking`).

### Week 3

- Outside/home transition.
- Nearby agents list + world presence visualization.
- Autonomous agent-to-agent dialogue bubbles/events.

### Week 4

- Replay timeline (last 24h actions).
- Performance optimization and low-end device mode.
- UX polish + onboarding.

## Performance targets for "run on any machine"

- 60 FPS target on mid-tier laptops; graceful degrade to 30 FPS on low-power devices.
- Texture atlas + sprite batching in Pixi.
- Limit draw calls and idle animation complexity.
- Adaptive quality presets (high/medium/low).
- Virtualize off-screen entities.

## Repo bootstrap suggestion

```text
claw-ui/
  apps/
    web/                # React + Pixi client
    api/                # Fastify + WebSocket gateway
  packages/
    shared-types/       # event contracts, DTOs
    openclaw-bridge/    # connector to OpenClaw events/commands
    rendering-model/    # state -> animation mapping
```

## Risks and mitigations

- **Risk:** event mismatch between OpenClaw runtime and visual states.
  - **Mitigation:** strict shared types + contract tests + replayable event fixtures.
- **Risk:** visual scope creep.
  - **Mitigation:** fixed animation state list for v1 and reusable prop kits.
- **Risk:** latency spikes.
  - **Mitigation:** optimistic local transitions for user-issued commands, then reconcile.

## First implementation tickets

1. Define `shared-types` event schema package.
2. Build mock agent simulator producing v1 events.
3. Render one agent in home scene with state-driven animation.
4. Add NL command box and command->event->visual loop.
5. Integrate one live OpenClaw agent for end-to-end validation.
