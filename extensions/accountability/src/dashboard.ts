import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ScorecardStore } from "./scorecard.js";
import type { TaskBoard } from "./task-board.js";

const DASHBOARD_PREFIX = "/plugins/accountability";
const API_PREFIX = `${DASHBOARD_PREFIX}/api`;
const DASHBOARD_HTML_URL = new URL("../assets/dashboard.html", import.meta.url);

/** Create HTTP handler for the accountability dashboard */
export function createDashboardHandler(taskBoard: TaskBoard, scorecardStore: ScorecardStore) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = parseUrl(req.url);
    if (!url) return false;

    // API routes
    if (url.startsWith(`${API_PREFIX}/tasks`) && req.method === "GET") {
      return await handleGetTasks(taskBoard, res);
    }
    if (url.startsWith(`${API_PREFIX}/tasks`) && req.method === "POST") {
      return await handleCreateTask(taskBoard, req, res);
    }
    if (url.startsWith(`${API_PREFIX}/scorecards`) && req.method === "GET") {
      return await handleGetScorecards(scorecardStore, res);
    }
    if (url.startsWith(`${API_PREFIX}/leaderboard`) && req.method === "GET") {
      return await handleGetLeaderboard(scorecardStore, res);
    }

    // Serve dashboard HTML
    if (url === DASHBOARD_PREFIX || url === `${DASHBOARD_PREFIX}/`) {
      return await serveDashboard(res);
    }

    return false;
  };
}

function parseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, "http://localhost");
    return u.pathname;
  } catch {
    return raw.split("?")[0] ?? null;
  }
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): boolean {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
  return true;
}

async function handleGetTasks(taskBoard: TaskBoard, res: ServerResponse): Promise<boolean> {
  const tasks = await taskBoard.loadTasks();
  return jsonResponse(res, 200, { tasks });
}

async function handleCreateTask(
  taskBoard: TaskBoard,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const body = await readBody(req);
  try {
    const data = JSON.parse(body);
    const task = await taskBoard.addTask({
      title: data.title ?? "Untitled",
      description: data.description ?? "",
      priority: data.priority ?? "medium",
      tags: data.tags,
      acceptanceCriteria: data.acceptanceCriteria,
    });
    return jsonResponse(res, 201, { task });
  } catch {
    return jsonResponse(res, 400, { error: "Invalid JSON body" });
  }
}

async function handleGetScorecards(
  scorecardStore: ScorecardStore,
  res: ServerResponse,
): Promise<boolean> {
  const scorecards = await scorecardStore.loadAllScorecards();
  return jsonResponse(res, 200, { scorecards });
}

async function handleGetLeaderboard(
  scorecardStore: ScorecardStore,
  res: ServerResponse,
): Promise<boolean> {
  const leaderboard = await scorecardStore.getLeaderboard();
  return jsonResponse(res, 200, { leaderboard });
}

async function serveDashboard(res: ServerResponse): Promise<boolean> {
  try {
    const htmlPath = fileURLToPath(DASHBOARD_HTML_URL);
    const html = await fs.readFile(htmlPath, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return true;
  } catch {
    res.statusCode = 500;
    res.end("Dashboard not found");
    return true;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
