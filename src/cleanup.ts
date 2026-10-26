import * as core from "@actions/core";
import * as github from "@actions/github";
import { createCommentsApi } from "./comments.js";
import { parsePrNumber } from "./config.js";
import { resolveTarget } from "./context.js";
import { readCommentId } from "./state.js";

export async function cleanup(): Promise<void> {
  const id = readCommentId();
  if (!id) return;

  try {
    const token = core.getInput("github-token");
    const target = resolveTarget(parsePrNumber(core.getInput("pr-number")), github.context);
    const api = createCommentsApi(github.getOctokit(token), target);
    await api.remove(id);
  } catch (err) {
    core.warning(`Failed to delete comment ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

cleanup();
