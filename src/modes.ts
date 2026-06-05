import * as core from "@actions/core";
import { Config } from "./config";
import { CommentsApi } from "./comments";
import { appendTag } from "./tag";

export interface ModeResult {
  id: number;
  body: string;
  htmlUrl: string;
}

async function findExisting(config: Config, api: CommentsApi) {
  return config.commentTag ? api.find(config.commentTag) : null;
}

async function applyReactions(config: Config, api: CommentsApi, id: number): Promise<void> {
  if (config.reactions.length) {
    await api.addReactions(id, config.reactions);
  }
}

async function writeComment(config: Config, api: CommentsApi, existingId?: number): Promise<ModeResult> {
  const body = appendTag(config.body, config.commentTag);
  const ref = existingId ? await api.update(existingId, body) : await api.create(body);
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
      if (existing) await api.remove(existing.id);
      return null;
    }
    case "recreate": {
      if (existing) await api.remove(existing.id);
      return writeComment(config, api);
    }
    case "upsert":
    case "delete-on-completion": {
      if (existing) return writeComment(config, api, existing.id);
      if (config.createIfNotExists) return writeComment(config, api);
      return null;
    }
  }
}
