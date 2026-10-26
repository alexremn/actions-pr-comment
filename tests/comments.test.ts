import { jest } from "@jest/globals";
import { createCommentsApi } from "../src/comments.js";
import { Target } from "../src/context.js";

const target: Target = { owner: "o", repo: "r", issueNumber: 5 };

function fakeOctokit(comments: any[] = []) {
  return {
    paginate: jest.fn(async () => comments),
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
  it("find returns the first comment carrying the tag", async () => {
    const oct = fakeOctokit([
      { id: 1, body: "nope", html_url: "u1" },
      { id: 2, body: "x\n\n<!-- actions-pr-comment:t -->", html_url: "u2" },
    ]);
    const api = createCommentsApi(oct as any, target);
    expect(await api.find("t")).toEqual({ id: 2, body: expect.any(String), htmlUrl: "u2" });
  });

  it("find returns null when no comment matches", async () => {
    const api = createCommentsApi(fakeOctokit([{ id: 1, body: "x", html_url: "u" }]) as any, target);
    expect(await api.find("t")).toBeNull();
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

  it("find paginates all comments on the target issue", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).find("t");
    expect(oct.paginate).toHaveBeenCalledWith(oct.rest.issues.listComments, {
      owner: "o",
      repo: "r",
      issue_number: 5,
      per_page: 100,
    });
  });

  it("find skips comments without a body", async () => {
    const oct = fakeOctokit([
      { id: 1, body: null, html_url: "u1" },
      { id: 2, body: "<!-- actions-pr-comment:t -->", html_url: "u2" },
    ]);
    expect((await createCommentsApi(oct as any, target).find("t"))?.id).toBe(2);
  });

  it("find does not match a tag that only shares a prefix", async () => {
    const oct = fakeOctokit([{ id: 1, body: "<!-- actions-pr-comment:tag-2 -->", html_url: "u" }]);
    expect(await createCommentsApi(oct as any, target).find("tag")).toBeNull();
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

  it("addReactions sends each reaction in order", async () => {
    const oct = fakeOctokit();
    await createCommentsApi(oct as any, target).addReactions(7, ["heart", "eyes"]);
    expect(oct.rest.reactions.createForIssueComment.mock.calls).toEqual([
      [{ owner: "o", repo: "r", comment_id: 7, content: "heart" }],
      [{ owner: "o", repo: "r", comment_id: 7, content: "eyes" }],
    ]);
  });
});
