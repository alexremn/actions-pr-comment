import * as core from "@actions/core";
import * as github from "@actions/github";
import { parseConfig } from "./config.js";
import { resolveTarget } from "./context.js";
import { createCommentsApi } from "./comments.js";
import { runMode } from "./modes.js";
import { setOutputs } from "./outputs.js";
import { saveCommentId } from "./state.js";

export async function run(): Promise<void> {
  try {
    const config = parseConfig();
    const target = resolveTarget(config.prNumber, github.context);
    const octokit = github.getOctokit(config.token);
    const api = createCommentsApi(octokit, target);

    const result = await runMode(config, api);
    setOutputs(result);

    if (config.mode === "delete-on-completion" && result) {
      saveCommentId(result.id);
    }
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
