import * as core from "@actions/core";

jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(() => ({})),
  context: { repo: { owner: "o", repo: "r" }, issue: { number: 5 }, payload: {} },
}));

const remove = jest.fn();
const readCommentId = jest.fn();
jest.mock("../src/comments", () => ({ createCommentsApi: () => ({ remove }) }));
jest.mock("../src/state", () => ({ readCommentId: () => readCommentId() }));

import { cleanup } from "../src/cleanup";

describe("cleanup", () => {
  it("removes the tracked comment when state has an id", async () => {
    (core.getInput as jest.Mock).mockReturnValue("token");
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
    (core.getInput as jest.Mock).mockReturnValue("token");
    readCommentId.mockReturnValue(7);
    remove.mockRejectedValueOnce(new Error("gone"));
    await expect(cleanup()).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalled();
  });
});
