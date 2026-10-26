import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";
import type { Config, Reaction } from "../src/config.js";
import type { CommentsApi, CommentRef } from "../src/comments.js";

jest.unstable_mockModule("@actions/core", () => core);

const { runMode } = await import("../src/modes.js");
const { MAX_BODY_BYTES } = await import("../src/tag.js");

function baseConfig(over: Partial<Config> = {}): Config {
  return {
    token: "t",
    body: "hello",
    reactions: [],
    commentTag: "tag1",
    mode: "upsert",
    createIfNotExists: true,
    ...over,
  };
}

function fakeApi(found: CommentRef[] = []): jest.Mocked<CommentsApi> {
  return {
    findAll: jest.fn(async (_tag: string) => found),
    create: jest.fn(async (body: string) => ({ id: 1, body, htmlUrl: "u" })),
    update: jest.fn(async (id: number, body: string) => ({ id, body, htmlUrl: "u" })),
    remove: jest.fn(async (_id: number) => {}),
    addReactions: jest.fn(async (_id: number, _reactions: Reaction[]) => {}),
  };
}

describe("runMode", () => {
  it("upsert updates when the tag is found", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    const res = await runMode(baseConfig(), api);
    expect(api.update).toHaveBeenCalled();
    expect(res?.id).toBe(9);
  });

  it("upsert creates when not found and create-if-not-exists is true", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig(), api);
    expect(api.create).toHaveBeenCalled();
  });

  it("upsert no-ops when not found and create-if-not-exists is false", async () => {
    const api = fakeApi([]);
    const res = await runMode(baseConfig({ createIfNotExists: false }), api);
    expect(api.create).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("recreate removes the old comment then creates", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    await runMode(baseConfig({ mode: "recreate" }), api);
    expect(api.remove).toHaveBeenCalledWith(9);
    expect(api.create).toHaveBeenCalled();
  });

  it("delete removes the found comment and returns null", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    const res = await runMode(baseConfig({ mode: "delete", body: "" }), api);
    expect(api.remove).toHaveBeenCalledWith(9);
    expect(res).toBeNull();
  });

  it("delete no-ops when nothing is found", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ mode: "delete", body: "" }), api);
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("applies reactions after create", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ reactions: ["+1"] }), api);
    expect(api.addReactions).toHaveBeenCalledWith(1, ["+1"]);
  });

  it("applies reactions after an upsert update", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    await runMode(baseConfig({ reactions: ["heart"] }), api);
    expect(api.addReactions).toHaveBeenCalledWith(9, ["heart"]);
  });

  it("upsert appends the hidden tag to the written body", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    const res = await runMode(baseConfig(), api);
    expect(api.findAll).toHaveBeenCalledWith("tag1");
    expect(api.update).toHaveBeenCalledWith(9, "hello\n\n<!-- actions-pr-comment:tag1 -->");
    expect(res).toEqual({ id: 9, body: "hello\n\n<!-- actions-pr-comment:tag1 -->", htmlUrl: "u" });
  });

  it("upsert without a comment-tag skips the lookup and always creates", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    await runMode(baseConfig({ commentTag: undefined }), api);
    expect(api.findAll).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.create).toHaveBeenCalledWith("hello");
  });

  it("recreate creates when nothing is found", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ mode: "recreate" }), api);
    expect(api.create).toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("recreate creates even when create-if-not-exists is false", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ mode: "recreate", createIfNotExists: false }), api);
    expect(api.create).toHaveBeenCalled();
  });

  it("delete-on-completion updates the found comment like upsert", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    const res = await runMode(baseConfig({ mode: "delete-on-completion" }), api);
    expect(api.update).toHaveBeenCalled();
    expect(res?.id).toBe(9);
  });

  it("delete-on-completion no-ops when not found and create-if-not-exists is false", async () => {
    const api = fakeApi([]);
    const res = await runMode(baseConfig({ mode: "delete-on-completion", createIfNotExists: false }), api);
    expect(api.create).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("does not add reactions when none are configured", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig(), api);
    expect(api.addReactions).not.toHaveBeenCalled();
  });

  it("warns and no-ops on delete without a comment-tag", async () => {
    const api = fakeApi([]);
    const res = await runMode(baseConfig({ mode: "delete", body: "", commentTag: undefined }), api);
    expect(api.remove).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalled();
    expect(res).toBeNull();
  });

  describe("with duplicates from parallel runs", () => {
    const three = (): CommentRef[] => [
      { id: 9, body: "a", htmlUrl: "u" },
      { id: 10, body: "b", htmlUrl: "u" },
      { id: 11, body: "c", htmlUrl: "u" },
    ];

    it.each(["upsert", "delete-on-completion"] as const)("%s updates the oldest and removes the rest", async (mode) => {
      const api = fakeApi(three());
      const res = await runMode(baseConfig({ mode }), api);
      expect(api.update).toHaveBeenCalledWith(9, expect.any(String));
      expect(api.remove.mock.calls).toEqual([[10], [11]]);
      expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.remove.mock.invocationCallOrder[0]);
      expect(core.info).toHaveBeenCalledWith('Removing 2 duplicate comment(s) tagged "tag1".');
      expect(res?.id).toBe(9);
    });

    it("a failed duplicate removal only warns, so outputs and post-step state are kept", async () => {
      const api = fakeApi(three());
      api.remove.mockRejectedValueOnce(new Error("Resource not accessible by integration"));
      const res = await runMode(baseConfig({ mode: "delete-on-completion" }), api);
      expect(res?.id).toBe(9);
      expect(core.warning).toHaveBeenCalledWith("Could not remove duplicate comments: Resource not accessible by integration");
    });

    it("stringifies a non-Error duplicate removal failure", async () => {
      const api = fakeApi(three());
      api.remove.mockRejectedValueOnce("rate limited");
      await runMode(baseConfig(), api);
      expect(core.warning).toHaveBeenCalledWith("Could not remove duplicate comments: rate limited");
    });

    it("upsert keeps the duplicates when the update fails", async () => {
      const api = fakeApi(three());
      api.update.mockRejectedValueOnce(new Error("boom"));
      await expect(runMode(baseConfig(), api)).rejects.toThrow("boom");
      expect(api.remove).not.toHaveBeenCalled();
    });

    it("delete removes every one", async () => {
      const api = fakeApi(three());
      await runMode(baseConfig({ mode: "delete", body: "" }), api);
      expect(api.remove.mock.calls).toEqual([[9], [10], [11]]);
    });

    it("recreate removes every one before creating", async () => {
      const api = fakeApi(three());
      await runMode(baseConfig({ mode: "recreate" }), api);
      expect(api.remove.mock.calls).toEqual([[9], [10], [11]]);
      expect(api.create.mock.invocationCallOrder[0]).toBeGreaterThan(api.remove.mock.invocationCallOrder[2]);
    });
  });

  it("upsert with a single match removes nothing", async () => {
    const api = fakeApi([{ id: 9, body: "old", htmlUrl: "u" }]);
    await runMode(baseConfig(), api);
    expect(api.remove).not.toHaveBeenCalled();
    expect(core.info).not.toHaveBeenCalled();
  });

  it("neutralizes another tag's marker inside the body", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ body: "x <!-- actions-pr-comment:other -->" }), api);
    const posted = api.create.mock.calls[0][0];
    expect(posted).not.toContain("<!-- actions-pr-comment:other -->");
    expect(posted.endsWith("<!-- actions-pr-comment:tag1 -->")).toBe(true);
  });

  it("truncates an oversized body and warns", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig({ body: "a".repeat(MAX_BODY_BYTES) }), api);
    const posted = api.create.mock.calls[0][0];
    expect(Buffer.byteLength(posted)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(posted.endsWith("<!-- actions-pr-comment:tag1 -->")).toBe(true);
    expect(core.warning).toHaveBeenCalledWith(expect.stringMatching(/truncated/));
  });

  it("does not warn for a body within the limit", async () => {
    const api = fakeApi([]);
    await runMode(baseConfig(), api);
    expect(core.warning).not.toHaveBeenCalled();
  });
});
