import * as fs from "fs";
import * as path from "path";
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

// Checked-out PR code is attacker-controlled: a symlinked file or directory in it could point at
// /proc/self/environ, .git/config or ~/.docker/config.json and leak secrets into the comment.
// So no path component below the workspace may be a symlink. The workspace is matched by identity
// (dev + inode), not by string, so path aliases and letter case cannot dodge the check. Above or
// outside the workspace only the file itself is checked, so runner.temp, /tmp etc. keep working.
function readBodyFile(filePath: string): string {
  // Read the lexically normalized path so "dir/../x" cannot resolve through a symlinked dir.
  const resolved = path.resolve(filePath);
  const workspace = fs.statSync(process.env.GITHUB_WORKSPACE || process.cwd(), { bigint: true });
  const { root } = path.parse(resolved);
  let current = root;
  let inWorkspace = false;
  for (const part of path.relative(root, resolved).split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink() && (inWorkspace || current === resolved)) {
      throw new Error("symbolic links are not allowed");
    }
    if (!inWorkspace) {
      const stat = fs.statSync(current, { bigint: true });
      inWorkspace = stat.dev === workspace.dev && stat.ino === workspace.ino;
    }
  }
  return fs.readFileSync(resolved, "utf8");
}

function resolveBody(message: string, filePath: string): string {
  if (message && filePath) {
    throw new Error("Only one of `message` or `file-path` may be set.");
  }
  if (filePath) {
    try {
      return readBodyFile(filePath);
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

export function parsePrNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`Invalid pr-number "${raw}": must be a positive integer.`);
  }
  return n;
}

function parseCommentTag(raw: string): string | undefined {
  // "-->" or "--!>" would close the hidden marker early and leak the rest of the tag into the comment.
  if (/--!?>/.test(raw)) {
    throw new Error(`Invalid comment-tag "${raw}": must not contain "-->".`);
  }
  return raw || undefined;
}

function parseCreateIfNotExists(raw: string): boolean {
  if (!raw) return true;
  const value = raw.toLowerCase();
  if (value !== "true" && value !== "false") {
    core.warning(`Invalid create-if-not-exists "${raw}": expected true or false. Treating it as false.`);
  }
  return value === "true";
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

  return {
    token: core.getInput("github-token"),
    body,
    reactions: parseReactions(core.getInput("reactions")),
    prNumber: parsePrNumber(core.getInput("pr-number")),
    commentTag: parseCommentTag(core.getInput("comment-tag")),
    mode,
    createIfNotExists: parseCreateIfNotExists(core.getInput("create-if-not-exists")),
  };
}
