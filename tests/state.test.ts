import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";

jest.unstable_mockModule("@actions/core", () => core);

const { saveCommentId, readCommentId } = await import("../src/state.js");

describe("state", () => {
  it("saves the comment id as a string", () => {
    saveCommentId(42);
    expect(core.saveState).toHaveBeenCalledWith("comment-id", "42");
  });

  it("reads back a numeric id", () => {
    core.getState.mockReturnValue("42");
    expect(readCommentId()).toBe(42);
  });

  it("returns null when no state is set", () => {
    core.getState.mockReturnValue("");
    expect(readCommentId()).toBeNull();
  });
});
