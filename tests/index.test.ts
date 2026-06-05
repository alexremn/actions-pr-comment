import * as core from "@actions/core";

jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(() => ({})),
  context: { repo: { owner: "o", repo: "r" }, issue: { number: 5 }, payload: {} },
}));

const runMode = jest.fn();
const setOutputs = jest.fn();
const saveCommentId = jest.fn();
const createCommentsApi = jest.fn(() => ({}));
const parseConfig = jest.fn();

jest.mock("../src/modes", () => ({ runMode: (...a: any[]) => runMode(...a) }));
jest.mock("../src/outputs", () => ({ setOutputs: (...a: any[]) => setOutputs(...a) }));
jest.mock("../src/state", () => ({ saveCommentId: (...a: any[]) => saveCommentId(...a) }));
jest.mock("../src/comments", () => ({ createCommentsApi: (...a: any[]) => (createCommentsApi as any)(...a) }));
jest.mock("../src/config", () => ({ parseConfig: () => parseConfig() }));

import { run } from "../src/index";

describe("run", () => {
  it("saves state for delete-on-completion results", async () => {
    parseConfig.mockReturnValue({ token: "t", mode: "delete-on-completion", prNumber: undefined });
    runMode.mockResolvedValue({ id: 7, body: "b", htmlUrl: "u" });
    await run();
    expect(setOutputs).toHaveBeenCalledWith({ id: 7, body: "b", htmlUrl: "u" });
    expect(saveCommentId).toHaveBeenCalledWith(7);
  });

  it("fails the action on error", async () => {
    parseConfig.mockImplementation(() => { throw new Error("boom"); });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith("boom");
  });

  it("does not save state when result is null", async () => {
    parseConfig.mockReturnValue({ token: "t", mode: "delete-on-completion", prNumber: undefined });
    runMode.mockResolvedValue(null);
    await run();
    expect(saveCommentId).not.toHaveBeenCalled();
  });
});
