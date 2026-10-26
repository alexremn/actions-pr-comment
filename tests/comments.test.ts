import { jest } from "@jest/globals";
import { createCommentsApi } from "../src/comments.js";
import { Target } from "../src/context.js";

const target: Target = { owner: "o", repo: "r", issueNumber: 5 };

const marker = "<!-- actions-pr-comment:t -->";

// `authored` decides viewerDidAuthor per GraphQL node id; by default the token wrote everything.
function fakeOctokit(comments: any[] = [], authored: (nodeId: string) => boolean = () => true) {
  return {
    paginate: jest.fn(async () => comments),
    graphql: jest.fn(async (_query: string, { ids }: { ids: string[] }) => ({
      nodes: ids.map((id) => ({ viewerDidAuthor: authored(id) })),
    })),
    rest: {
      issues: {
        listComments: jest.fn(),
        createComment: jest.fn(async ({ body }: any) => ({
          data: { id: 100, body, html_url: "url" },
        })),
        updateComment: jest.fn(async ({ comment_id, body }: any) => ({
          data: { id: comment_id, body, html_url: "url" },
        })),
        deleteComment: jest.fn(async () => ({})),
      },
      reactions: { createForIssueComment: jest.fn(async () => ({})) },
    },
  };
}

describe("CommentsApi", () => {
  it("findAll returns the tagged comments", async () => {
    const oct = fakeOctokit([
      { id: 1, body: "nope", html_url: "u1" },
      { id: 2, body: "x\n\n<!-- actions-pr-comment:t -->", html_url: "u2" },
    ]);
    const api = createCommentsApi(oct as any, target);
    expect(await api.findAll("t")).toEqual([{ id: 2, body: expect.any(String), htmlUrl: "u2" }]);
  });

  it("findAll returns nothing when no comment matches", async () => {
    const oct = fakeOctokit([{ id: 1, body: "x", html_url: "u" }]);
    expect(await createCommentsApi(oct as any, target).findAll("t")).toEqual([]);
    expect(oct.graphql).not.toHaveBeenCalled();
  });

  it("findAll skips a tagged comment planted by someone else", async () => {
    const oct = fakeOctokit(
      [
        { id: 1, node_id: "FOREIGN", body: marker, html_url: "u1" },
        { id: 2, node_id: "MINE", body: `x\n\n${marker}`, html_url: "u2" },
      ],
      (id) => id === "MINE",
    );
    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([2]);
    expect(oct.graphql).toHaveBeenCalledWith(expect.stringContaining("viewerDidAuthor"), { ids: ["FOREIGN", "MINE"] });
  });

  it("findAll returns nothing when every tagged comment belongs to someone else", async () => {
    const oct = fakeOctokit([{ id: 1, node_id: "FOREIGN", body: marker, html_url: "u" }], () => false);
    expect(await createCommentsApi(oct as any, target).findAll("t")).toEqual([]);
  });

  // Shape of @octokit/graphql's GraphqlResponseError: it throws whenever the response has `errors`.
  const graphqlError = (types: string[], nodes: unknown[]) =>
    Object.assign(new Error("Request failed due to following response errors"), {
      errors: types.map((type) => ({ type, message: type })),
      data: { nodes },
    });

  it("findAll skips a tagged comment deleted after listing (NOT_FOUND) and keeps checking", async () => {
    const oct = fakeOctokit([
      { id: 1, node_id: "GONE", body: marker, html_url: "u1" },
      { id: 2, node_id: "MINE", body: marker, html_url: "u2" },
    ]);
    oct.graphql.mockRejectedValueOnce(graphqlError(["NOT_FOUND"], [null, { viewerDidAuthor: true }]));
    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([2]);
  });

  it("findAll fails instead of guessing when GitHub refuses the authorship check", async () => {
    const oct = fakeOctokit([{ id: 1, node_id: "MINE", body: marker, html_url: "u" }]);
    oct.graphql.mockRejectedValueOnce(graphqlError(["NOT_FOUND", "FORBIDDEN"], [null]));
    await expect(createCommentsApi(oct as any, target).findAll("t")).rejects.toThrow(/response errors/);
  });

  it("findAll fails on a transport error", async () => {
    const oct = fakeOctokit([{ id: 1, node_id: "MINE", body: marker, html_url: "u" }]);
    oct.graphql.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(createCommentsApi(oct as any, target).findAll("t")).rejects.toThrow("socket hang up");
  });

  it("findAll checks authorship only for tagged comments, 100 per query", async () => {
    const tagged = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, node_id: `N${i + 1}`, body: marker, html_url: "u" }));
    const oct = fakeOctokit([{ id: 999, node_id: "UNTAGGED", body: "x", html_url: "u" }, ...tagged], (id) => id === "N150");

    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([150]);
    expect(oct.graphql.mock.calls.map(([, vars]) => vars.ids.length)).toEqual([100, 50]);
    expect(oct.graphql.mock.calls[0][1].ids).not.toContain("UNTAGGED");
  });

  it("findAll returns every authored comment across batches, oldest first", async () => {
    const tagged = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, node_id: `N${i + 1}`, body: marker, html_url: "u" }));
    const oct = fakeOctokit(tagged, (id) => id === "N3" || id === "N150");
    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([3, 150]);
    expect(oct.graphql).toHaveBeenCalledTimes(2);
  });

  it("create maps html_url to htmlUrl", async () => {
    const api = createCommentsApi(fakeOctokit() as any, target);
    expect(await api.create("hi")).toEqual({ id: 100, body: "hi", htmlUrl: "url" });
  });

  it("update passes the comment id through", async () => {
    const api = createCommentsApi(fakeOctokit() as any, target);
    expect(await api.update(7, "hi")).toEqual({ id: 7, body: "hi", htmlUrl: "url" });
  });

  it("addReactions calls the API once per reaction", async () => {
    const oct = fakeOctokit();
    const api = createCommentsApi(oct as any, target);
    await api.addReactions(7, ["+1", "rocket"]);
    expect(oct.rest.reactions.createForIssueComment).toHaveBeenCalledTimes(2);
  });

  it("findAll paginates all comments on the target issue", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).findAll("t");
    expect(oct.paginate).toHaveBeenCalledWith(oct.rest.issues.listComments, {
      owner: "o",
      repo: "r",
      issue_number: 5,
      per_page: 100,
    });
  });

  it("findAll skips comments without a body", async () => {
    const oct = fakeOctokit([
      { id: 1, body: null, html_url: "u1" },
      { id: 2, body: "<!-- actions-pr-comment:t -->", html_url: "u2" },
    ]);
    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([2]);
  });

  it("findAll does not match a tag that only shares a prefix", async () => {
    const oct = fakeOctokit([{ id: 1, body: "<!-- actions-pr-comment:tag-2 -->", html_url: "u" }]);
    expect(await createCommentsApi(oct as any, target).findAll("tag")).toEqual([]);
  });

  it("create posts to the target issue", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).create("hi");
    expect(oct.rest.issues.createComment).toHaveBeenCalledWith({ owner: "o", repo: "r", issue_number: 5, body: "hi" });
  });

  it("create maps a null body to an empty string", async () => {
    const oct = fakeOctokit();
    oct.rest.issues.createComment.mockResolvedValueOnce({ data: { id: 1, body: null, html_url: "u" } });
    expect((await createCommentsApi(oct as any, target).create("hi")).body).toBe("");
  });

  it("remove deletes the comment by id", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).remove(7);
    expect(oct.rest.issues.deleteComment).toHaveBeenCalledWith({ owner: "o", repo: "r", comment_id: 7 });
  });

  it("remove treats an already-deleted comment as removed", async () => {
    const oct = fakeOctokit();
    oct.rest.issues.deleteComment.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    await expect(createCommentsApi(oct as any, target).remove(7)).resolves.toBeUndefined();
  });

  it("findAll ignores a comment of its own account that only mentions the marker mid-body", async () => {
    const oct = fakeOctokit([
      { id: 1, node_id: "QUOTE", body: `quoting ${marker} here`, html_url: "u1" },
      { id: 2, node_id: "MINE", body: `x\n\n${marker}`, html_url: "u2" },
    ]);
    expect((await createCommentsApi(oct as any, target).findAll("t")).map((c) => c.id)).toEqual([2]);
    expect(oct.graphql).toHaveBeenCalledWith(expect.any(String), { ids: ["MINE"] });
  });

  it("remove rethrows a non-object error unchanged", async () => {
    const oct = fakeOctokit();
    oct.rest.issues.deleteComment.mockRejectedValueOnce(null);
    await expect(createCommentsApi(oct as any, target).remove(7)).rejects.toBeNull();
  });

  it("remove still fails on other errors", async () => {
    const oct = fakeOctokit();
    oct.rest.issues.deleteComment.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));
    await expect(createCommentsApi(oct as any, target).remove(7)).rejects.toThrow("Forbidden");
  });

  it("addReactions sends each reaction in order", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).addReactions(7, ["heart", "eyes"]);
    expect(oct.rest.reactions.createForIssueComment.mock.calls).toEqual([
      [{ owner: "o", repo: "r", comment_id: 7, content: "heart" }],
      [{ owner: "o", repo: "r", comment_id: 7, content: "eyes" }],
    ]);
  });
});
