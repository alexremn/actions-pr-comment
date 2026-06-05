import { appendTag, hasTag, buildMarker } from "../src/tag";

describe("tag", () => {
  it("builds a stable hidden marker", () => {
    expect(buildMarker("deploy")).toBe("<!-- actions-pr-comment:deploy -->");
  });

  it("appends the marker to a body", () => {
    expect(appendTag("hello", "deploy")).toBe(
      "hello\n\n<!-- actions-pr-comment:deploy -->"
    );
  });

  it("returns the body unchanged when no tag is given", () => {
    expect(appendTag("hello", undefined)).toBe("hello");
  });

  it("detects its own marker", () => {
    const body = appendTag("hello", "deploy");
    expect(hasTag(body, "deploy")).toBe(true);
    expect(hasTag(body, "other")).toBe(false);
    expect(hasTag("plain comment", "deploy")).toBe(false);
  });
});
