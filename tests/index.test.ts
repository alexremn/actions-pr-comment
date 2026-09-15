import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";
import type { Config } from "../src/config.js";
import type { ModeResult } from "../src/modes.js";

const runMode = jest.fn<() => Promise<ModeResult | null>>();
const setOutputs = jest.fn();
const saveCommentId = jest.fn();
const parseConfig = jest.fn<() => Config>();

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => ({
  getOctokit: jest.fn(() => ({})),
  context: { repo: { owner: "o", repo: "r" }, issue: { number: 5 }, payload: {} },
}));
jest.unstable_mockModule("../src/modes.js", () => ({ runMode }));
jest.unstable_mockModule("../src/outputs.js", () => ({ setOutputs }));
jest.unstable_mockModule("../src/state.js", () => ({ saveCommentId }));
jest.unstable_mockModule("../src/comments.js", () => ({ createCommentsApi: jest.fn(() => ({})) }));
jest.unstable_mockModule("../src/config.js", () => ({ parseConfig }));

const { run } = await import("../src/index.js");

const config: Config = {
  token: "t",
  body: "b",
  reactions: [],
  mode: "delete-on-completion",
  createIfNotExists: true,
};

describe("run", () => {
  it("saves state for delete-on-completion results", async () => {
    parseConfig.mockReturnValue(config);
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
    parseConfig.mockReturnValue(config);
    runMode.mockResolvedValue(null);
    await run();
    expect(saveCommentId).not.toHaveBeenCalled();
  });
});
