import type { context } from "@actions/github";

type Context = typeof context;

export interface Target {
  owner: string;
  repo: string;
  issueNumber: number;
}

export function resolveTarget(prNumber: number | undefined, context: Context): Target {
  const issueNumber = prNumber ?? context.issue.number;
  if (!issueNumber || Number.isNaN(issueNumber)) {
    throw new Error(
      "Could not determine the pull request number. Set `pr-number` or run on a pull_request event."
    );
  }
  return { owner: context.repo.owner, repo: context.repo.repo, issueNumber };
}
