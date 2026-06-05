import * as core from "@actions/core";
import { saveCommentId, readCommentId } from "../src/state";

jest.mock("@actions/core");

describe("state", () => {
  it("saves the comment id as a string", () => {
    saveCommentId(42);
    expect(core.saveState).toHaveBeenCalledWith("comment-id", "42");
  });

  it("reads back a numeric id", () => {
    (core.getState as jest.Mock).mockReturnValue("42");
    expect(readCommentId()).toBe(42);
  });

  it("returns null when no state is set", () => {
    (core.getState as jest.Mock).mockReturnValue("");
    expect(readCommentId()).toBeNull();
  });
});
