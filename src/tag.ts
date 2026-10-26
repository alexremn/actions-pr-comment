const PREFIX = "actions-pr-comment";
const MARKER_START = `<!-- ${PREFIX}:`;

// GitHub rejects comment bodies over 262,144 UTF-8 bytes (its error text still says "65536 characters").
export const MAX_BODY_BYTES = 262_144;
const TRUNCATION_NOTICE = "\n\n_…truncated: the comment exceeded GitHub's size limit._";

export interface CommentBody {
  text: string;
  truncated: boolean;
}

export function buildMarker(tag: string): string {
  return `${MARKER_START}${tag} -->`;
}

export function appendTag(body: string, tag?: string): string {
  if (!tag) return body;
  return `${body}\n\n${buildMarker(tag)}`;
}

// This action always puts the marker last, so only a marker at the very end counts. A comment by
// the same account that merely mentions the marker elsewhere (e.g. another workflow on the shared
// github-actions[bot] quoting it) is not ours and must never be updated or deleted.
export function hasTag(body: string, tag: string): boolean {
  return body.trimEnd().endsWith(buildMarker(tag));
}

// Untrusted text could carry another tag's marker and make this comment match that tag. A zero-width
// space breaks the match without changing what renders, since the marker sits in a hidden HTML comment.
function neutralizeMarkers(body: string): string {
  return body.replaceAll(MARKER_START, `<!-- ${PREFIX}\u200b:`);
}

function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf8");
  let end = Math.max(0, maxBytes);
  // Step back over UTF-8 continuation bytes (10xxxxxx) so no character is cut in half.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}

// The final comment text: the user's body with foreign markers neutralized, cut to GitHub's size
// limit if needed, and our own marker last so it survives truncation.
export function buildBody(body: string, tag?: string): CommentBody {
  const safe = neutralizeMarkers(body);
  const text = appendTag(safe, tag);
  if (Buffer.byteLength(text, "utf8") <= MAX_BODY_BYTES) return { text, truncated: false };
  const suffix = appendTag(TRUNCATION_NOTICE, tag);
  return { text: truncateUtf8(safe, MAX_BODY_BYTES - Buffer.byteLength(suffix, "utf8")) + suffix, truncated: true };
}
