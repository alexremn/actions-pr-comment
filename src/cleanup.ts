import * as core from "@actions/core";
import * as github from "@actions/github";
import { createCommentsApi } from "./comments.js";
import { resolveTarget } from "./context.js";
import { readCommentId } from "./state.js";

export async function cleanup(): Promise<void> {
  const id = readCommentId();
  if (!id) return;

  try {
    const token = core.getInput("github-token");
    const prNumberRaw = core.getInput("pr-number");
    const prNumber = prNumberRaw ? Number(prNumberRaw) : undefined;
    const target = resolveTarget(prNumber && !Number.isNaN(prNumber) ? prNumber : undefined, github.context);
    const api = createCommentsApi(github.getOctokit(token), target);
    await api.remove(id);
  } catch (err) {
    core.warning(`Failed to delete comment ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

cleanup();
