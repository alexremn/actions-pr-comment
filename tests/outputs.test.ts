import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";

jest.unstable_mockModule("@actions/core", () => core);

const { setOutputs } = await import("../src/outputs.js");

describe("setOutputs", () => {
  it("sets id, body and html-url when a result exists", () => {
    setOutputs({ id: 5, body: "b", htmlUrl: "u" });
    expect(core.setOutput).toHaveBeenCalledWith("id", 5);
    expect(core.setOutput).toHaveBeenCalledWith("body", "b");
    expect(core.setOutput).toHaveBeenCalledWith("html-url", "u");
  });

  it("does nothing when result is null", () => {
    setOutputs(null);
    expect(core.setOutput).not.toHaveBeenCalled();
  });
});
