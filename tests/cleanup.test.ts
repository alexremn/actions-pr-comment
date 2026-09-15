import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";

const remove = jest.fn<(id: number) => Promise<void>>();
const readCommentId = jest.fn<() => number | null>();

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => ({
  getOctokit: jest.fn(() => ({})),
  context: { repo: { owner: "o", repo: "r" }, issue: { number: 5 }, payload: {} },
}));
jest.unstable_mockModule("../src/comments.js", () => ({ createCommentsApi: () => ({ remove }) }));
jest.unstable_mockModule("../src/state.js", () => ({ readCommentId }));

const { cleanup } = await import("../src/cleanup.js");

describe("cleanup", () => {
  it("removes the tracked comment when state has an id", async () => {
    core.getInput.mockReturnValue("token");
    readCommentId.mockReturnValue(7);
    await cleanup();
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("does nothing when there is no saved id", async () => {
    readCommentId.mockReturnValue(null);
    await cleanup();
    expect(remove).not.toHaveBeenCalled();
  });

  it("never throws if removal fails", async () => {
    core.getInput.mockReturnValue("token");
    readCommentId.mockReturnValue(7);
    remove.mockRejectedValueOnce(new Error("gone"));
    await expect(cleanup()).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalled();
  });
});
