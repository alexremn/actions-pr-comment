import * as fs from "fs";
import * as core from "@actions/core";

export type Mode = "upsert" | "recreate" | "delete" | "delete-on-completion";
export type Reaction = "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes";

export const VALID_MODES: Mode[] = ["upsert", "recreate", "delete", "delete-on-completion"];
export const VALID_REACTIONS: Reaction[] = ["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"];

export interface Config {
  token: string;
  body: string;
  reactions: Reaction[];
  prNumber?: number;
  commentTag?: string;
  mode: Mode;
  createIfNotExists: boolean;
}

function resolveBody(message: string, filePath: string): string {
  if (message && filePath) {
    throw new Error("Only one of `message` or `file-path` may be set.");
  }
  if (filePath) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (err) {
      throw new Error(`Cannot read file-path "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return message;
}

function parseReactions(raw: string): Reaction[] {
  if (!raw.trim()) return [];
  const items = raw.split(",").map((r) => r.trim()).filter(Boolean);
  for (const r of items) {
    if (!VALID_REACTIONS.includes(r as Reaction)) {
      throw new Error(`Invalid reaction "${r}". Allowed: ${VALID_REACTIONS.join(", ")}.`);
    }
  }
  return items as Reaction[];
}

export function parseConfig(): Config {
  const rawMode = core.getInput("mode") || "upsert";
  if (!VALID_MODES.includes(rawMode as Mode)) {
    throw new Error(`Invalid mode "${rawMode}". Allowed: ${VALID_MODES.join(", ")}.`);
  }
  const mode = rawMode as Mode;

  const body = resolveBody(core.getInput("message"), core.getInput("file-path"));
  if (!body && mode !== "delete") {
    throw new Error("One of `message` or `file-path` is required for this mode.");
  }

  const prNumberRaw = core.getInput("pr-number");
  const createRaw = core.getInput("create-if-not-exists");

  let prNumber: number | undefined;
  if (prNumberRaw) {
    prNumber = Number(prNumberRaw);
    if (Number.isNaN(prNumber)) {
      throw new Error(`Invalid pr-number "${prNumberRaw}": must be a number.`);
    }
  }

  return {
    token: core.getInput("github-token"),
    body,
    reactions: parseReactions(core.getInput("reactions")),
    prNumber,
    commentTag: core.getInput("comment-tag") || undefined,
    mode,
    createIfNotExists: createRaw ? createRaw === "true" : true,
  };
}
