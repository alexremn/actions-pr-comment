import { createCommentsApi } from "../src/comments";
import { Target } from "../src/context";

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
});
