import type { GitHub } from "@actions/github/lib/utils";
import { Target } from "./context";
import { hasTag } from "./tag";
import { Reaction } from "./config";

export interface CommentRef {
  id: number;
  body: string;
  htmlUrl: string;
}

export interface CommentsApi {
  find(tag: string): Promise<CommentRef | null>;
  create(body: string): Promise<CommentRef>;
  update(id: number, body: string): Promise<CommentRef>;
  remove(id: number): Promise<void>;
  addReactions(id: number, reactions: Reaction[]): Promise<void>;
}

type Octokit = InstanceType<typeof GitHub>;

function toRef(data: { id: number; body?: string | null; html_url: string }): CommentRef {
  return { id: data.id, body: data.body ?? "", htmlUrl: data.html_url };
}

export function createCommentsApi(octokit: Octokit, target: Target): CommentsApi {
  const base = { owner: target.owner, repo: target.repo };

  return {
    async find(tag) {
      const all = await octokit.paginate(octokit.rest.issues.listComments, {
        ...base,
        issue_number: target.issueNumber,
        per_page: 100,
      });
      const match = all.find((c) => c.body != null && hasTag(c.body, tag));
      return match ? toRef(match) : null;
    },
    async create(body) {
      const { data } = await octokit.rest.issues.createComment({
        ...base,
        issue_number: target.issueNumber,
        body,
      });
      return toRef(data);
    },
    async update(id, body) {
      const { data } = await octokit.rest.issues.updateComment({
        ...base,
        comment_id: id,
        body,
      });
      return toRef(data);
    },
    async remove(id) {
      await octokit.rest.issues.deleteComment({ ...base, comment_id: id });
    },
    async addReactions(id, reactions) {
      for (const content of reactions) {
        await octokit.rest.reactions.createForIssueComment({
          ...base,
          comment_id: id,
          content: content,
        });
      }
    },
  };
}
