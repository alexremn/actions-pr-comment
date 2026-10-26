import * as core from "@actions/core";
import { Config } from "./config.js";
import { CommentRef, CommentsApi } from "./comments.js";
import { buildBody, MAX_BODY_BYTES } from "./tag.js";

export interface ModeResult {
  id: number;
  body: string;
  htmlUrl: string;
}

// Oldest first. More than one only when parallel runs each created the comment.
async function findExisting(config: Config, api: CommentsApi): Promise<CommentRef[]> {
  return config.commentTag ? api.findAll(config.commentTag) : [];
}

async function removeAll(api: CommentsApi, comments: CommentRef[]): Promise<void> {
  for (const comment of comments) await api.remove(comment.id);
}

async function applyReactions(config: Config, api: CommentsApi, id: number): Promise<void> {
  if (config.reactions.length) {
    await api.addReactions(id, config.reactions);
  }
}

async function writeComment(config: Config, api: CommentsApi, existingId?: number): Promise<ModeResult> {
  const { text, truncated } = buildBody(config.body, config.commentTag);
  if (truncated) {
    core.warning(`The comment body is larger than GitHub's limit of ${MAX_BODY_BYTES} bytes and was truncated.`);
  }
  const ref = existingId ? await api.update(existingId, text) : await api.create(text);
  await applyReactions(config, api, ref.id);
  return { id: ref.id, body: ref.body, htmlUrl: ref.htmlUrl };
}

export async function runMode(config: Config, api: CommentsApi): Promise<ModeResult | null> {
  const existing = await findExisting(config, api);

  switch (config.mode) {
    case "delete": {
      if (!config.commentTag) {
        core.warning("delete mode has no comment-tag; nothing to delete.");
      }
      await removeAll(api, existing);
      return null;
    }
    case "recreate": {
      await removeAll(api, existing);
      return writeComment(config, api);
    }
    case "upsert":
    case "delete-on-completion": {
      const [first, ...duplicates] = existing;
      if (first) {
        const result = await writeComment(config, api, first.id);
        if (duplicates.length) {
          core.info(`Removing ${duplicates.length} duplicate comment(s) tagged "${config.commentTag}".`);
          // Best effort: the comment is already written, and failing now would drop the outputs and
          // the post-step state, leaking a delete-on-completion comment. The next run retries.
          await removeAll(api, duplicates).catch((err) =>
            core.warning(`Could not remove duplicate comments: ${err instanceof Error ? err.message : String(err)}`),
          );
        }
        return result;
      }
      if (config.createIfNotExists) return writeComment(config, api);
      return null;
    }
  }
}
