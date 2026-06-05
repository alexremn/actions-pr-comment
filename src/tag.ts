const PREFIX = "actions-pr-comment";

export function buildMarker(tag: string): string {
  return `<!-- ${PREFIX}:${tag} -->`;
}

export function appendTag(body: string, tag?: string): string {
  if (!tag) return body;
  return `${body}\n\n${buildMarker(tag)}`;
}

export function hasTag(body: string, tag: string): boolean {
  return body.includes(buildMarker(tag));
}
