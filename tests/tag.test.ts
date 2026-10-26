import { appendTag, hasTag, buildMarker, buildBody, MAX_BODY_BYTES } from "../src/tag.js";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const marker = "<!-- actions-pr-comment:t -->";

describe("buildBody", () => {
  it("appends the marker and leaves a normal body alone", () => {
    expect(buildBody("hello", "t")).toEqual({ text: `hello\n\n${marker}`, truncated: false });
  });

  it("neutralizes another tag's marker without changing what renders", () => {
    const { text } = buildBody("x <!-- actions-pr-comment:other --> y", "t");
    expect(hasTag(text, "other")).toBe(false);
    expect(text).toContain("<!-- actions-pr-comment\u200b:other -->");
    expect(hasTag(text, "t")).toBe(true);
  });

  it("neutralizes markers even without a tag of its own", () => {
    expect(buildBody("<!-- actions-pr-comment:other -->").text).toBe("<!-- actions-pr-comment\u200b:other -->");
  });

  it("neutralizes nested markers so only its own marker remains", () => {
    const { text } = buildBody("<!-- actions-pr-comment:<!-- actions-pr-comment:x -->", "t");
    expect(text.split("<!-- actions-pr-comment:").length - 1).toBe(1);
    expect(text.endsWith(marker)).toBe(true);
  });

  it("keeps a body that is exactly at the limit", () => {
    const body = "a".repeat(MAX_BODY_BYTES - bytes(`\n\n${marker}`));
    const { text, truncated } = buildBody(body, "t");
    expect(truncated).toBe(false);
    expect(bytes(text)).toBe(MAX_BODY_BYTES);
  });

  it("truncates one byte over the limit and keeps the marker last", () => {
    const body = "a".repeat(MAX_BODY_BYTES - bytes(`\n\n${marker}`) + 1);
    const { text, truncated } = buildBody(body, "t");
    expect(truncated).toBe(true);
    expect(bytes(text)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(text).toContain("truncated");
    expect(text.endsWith(marker)).toBe(true);
    expect(hasTag(text, "t")).toBe(true);
  });

  it.each([
    ["2-byte", "é"],
    ["3-byte", "€"],
    ["4-byte", "😀"],
  ])("never splits a %s character", (_, char) => {
    for (const extra of [0, 1, 2, 3]) {
      const { text } = buildBody("a".repeat(extra) + char.repeat(MAX_BODY_BYTES), "t");
      expect(bytes(text)).toBeLessThanOrEqual(MAX_BODY_BYTES);
      expect(text).not.toContain("�");
      expect(Buffer.from(text, "utf8").toString("utf8")).toBe(text);
    }
  });

  it("truncates without a tag", () => {
    const { text, truncated } = buildBody("a".repeat(MAX_BODY_BYTES + 10));
    expect(truncated).toBe(true);
    expect(bytes(text)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(text.endsWith("_…truncated: the comment exceeded GitHub's size limit._")).toBe(true);
  });
});

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

  it("only counts a marker at the very end", () => {
    expect(hasTag("see <!-- actions-pr-comment:deploy --> above", "deploy")).toBe(false);
    expect(hasTag("hello\n\n<!-- actions-pr-comment:deploy -->\n", "deploy")).toBe(true);
  });
});
