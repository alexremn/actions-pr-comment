import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";
import type { Target } from "../src/context.js";

const remove = jest.fn<(id: number) => Promise<void>>();
const readCommentId = jest.fn<() => number | null>();
const getOctokit = jest.fn((_token: string) => ({}));
const createCommentsApi = jest.fn((_octokit: unknown, _target: Target) => ({ remove }));

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => ({
  getOctokit,
  context: { repo: { owner: "o", repo: "r" }, issue: { number: 5 }, payload: {} },
}));
jest.unstable_mockModule("../src/comments.js", () => ({ createCommentsApi }));
jest.unstable_mockModule("../src/state.js", () => ({ readCommentId }));

const { cleanup } = await import("../src/cleanup.js");

function withInputs(values: Record<string, string>) {
  core.getInput.mockImplementation((name) => values[name] ?? "");
}

describe("cleanup", () => {
  it("removes the tracked comment when state has an id", async () => {
    withInputs({ "github-token": "token" });
    readCommentId.mockReturnValue(7);
    await cleanup();
    expect(getOctokit).toHaveBeenCalledWith("token");
    expect(createCommentsApi).toHaveBeenCalledWith(expect.anything(), { owner: "o", repo: "r", issueNumber: 5 });
    expect(remove).toHaveBeenCalledWith(7);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("targets an explicit pr-number", async () => {
    withInputs({ "github-token": "token", "pr-number": "42" });
    readCommentId.mockReturnValue(7);
    await cleanup();
    expect(createCommentsApi).toHaveBeenCalledWith(expect.anything(), { owner: "o", repo: "r", issueNumber: 42 });
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("does nothing when there is no saved id", async () => {
    readCommentId.mockReturnValue(null);
    await cleanup();
    expect(remove).not.toHaveBeenCalled();
  });

  it("never throws if removal fails", async () => {
    withInputs({ "github-token": "token" });
    readCommentId.mockReturnValue(7);
    remove.mockRejectedValueOnce(new Error("gone"));
    await expect(cleanup()).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith("Failed to delete comment 7: gone");
  });

  it("warns instead of throwing on an invalid pr-number", async () => {
    withInputs({ "github-token": "token", "pr-number": "abc" });
    readCommentId.mockReturnValue(7);
    await expect(cleanup()).resolves.toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringMatching(/Failed to delete comment 7: Invalid pr-number/));
  });

  it("stringifies non-Error failures", async () => {
    withInputs({ "github-token": "token" });
    readCommentId.mockReturnValue(7);
    remove.mockRejectedValueOnce("nope");
    await cleanup();
    expect(core.warning).toHaveBeenCalledWith("Failed to delete comment 7: nope");
  });
});
