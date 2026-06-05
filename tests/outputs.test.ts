import * as core from "@actions/core";
import { setOutputs } from "../src/outputs";

jest.mock("@actions/core");

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
