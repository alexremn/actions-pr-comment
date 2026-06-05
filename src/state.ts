import * as core from "@actions/core";

const KEY = "comment-id";

export function saveCommentId(id: number): void {
  core.saveState(KEY, String(id));
}

export function readCommentId(): number | null {
  const raw = core.getState(KEY);
  return raw ? Number(raw) : null;
}
