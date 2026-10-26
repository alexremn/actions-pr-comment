import type { getOctokit } from "@actions/github";
import { Target } from "./context.js";
import { hasTag } from "./tag.js";
import { Reaction } from "./config.js";

export interface CommentRef {
  id: number;
  body: string;
  htmlUrl: string;
}

export interface CommentsApi {
  findAll(tag: string): Promise<CommentRef[]>;
  create(body: string): Promise<CommentRef>;
  update(id: number, body: string): Promise<CommentRef>;
  remove(id: number): Promise<void>;
  addReactions(id: number, reactions: Reaction[]): Promise<void>;
}

type Octokit = ReturnType<typeof getOctokit>;

// The marker is public, so anyone who can comment could plant it; only comments written by this
// token's identity may be matched. GitHub decides authorship server-side via `viewerDidAuthor`.
const AUTHORED_QUERY = "query($ids: [ID!]!) { nodes(ids: $ids) { ... on IssueComment { viewerDidAuthor } } }";
const MAX_NODES_PER_QUERY = 100;

type AuthoredNodes = ({ viewerDidAuthor?: boolean } | null)[];

async function queryAuthored(octokit: Octokit, ids: string[]): Promise<AuthoredNodes> {
  try {
    return (await octokit.graphql<{ nodes: AuthoredNodes }>(AUTHORED_QUERY, { ids })).nodes;
  } catch (err) {
    // A comment deleted after listing comes back null with a NOT_FOUND error: not ours, keep the rest.
    // Anything else (e.g. FORBIDDEN) must fail, or every run would post a duplicate comment.
    const { errors, data } = err as { errors?: { type?: string }[]; data?: { nodes?: AuthoredNodes } };
    if (data?.nodes && errors?.every((e) => e.type === "NOT_FOUND")) return data.nodes;
    throw err;
  }
}

function toRef(data: { id: number; body?: string | null; html_url: string }): CommentRef {
  return { id: data.id, body: data.body ?? "", htmlUrl: data.html_url };
}

export function createCommentsApi(octokit: Octokit, target: Target): CommentsApi {
  const base = { owner: target.owner, repo: target.repo };

  return {
    // Every tagged comment this token's account wrote, oldest first. All of them, not just the
    // first, so parallel runs that each created one can be cleaned up.
    async findAll(tag) {
      const all = await octokit.paginate(octokit.rest.issues.listComments, {
        ...base,
        issue_number: target.issueNumber,
        per_page: 100,
      });
      const tagged = all.filter((c) => c.body != null && hasTag(c.body, tag));
      const authored: CommentRef[] = [];
      for (let i = 0; i < tagged.length; i += MAX_NODES_PER_QUERY) {
        const batch = tagged.slice(i, i + MAX_NODES_PER_QUERY);
        const nodes = await queryAuthored(octokit, batch.map((c) => c.node_id));
        authored.push(...batch.filter((_, j) => nodes[j]?.viewerDidAuthor).map(toRef));
      }
      return authored;
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
      try {
        await octokit.rest.issues.deleteComment({ ...base, comment_id: id });
      } catch (err) {
        // Already gone, e.g. removed by a parallel run: the goal is met.
        if ((err as { status?: number } | null)?.status !== 404) throw err;
      }
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
