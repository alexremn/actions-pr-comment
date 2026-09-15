import { jest } from "@jest/globals";
import * as core from "./fixtures/core.js";
import type { Config, Reaction } from "../src/config.js";
import type { CommentsApi, CommentRef } from "../src/comments.js";

jest.unstable_mockModule("@actions/core", () => core);

const { runMode } = await import("../src/modes.js");

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

function fakeApi(found: CommentRef | null): jest.Mocked<CommentsApi> {
  return {
    find: jest.fn(async (_tag: string) => found),
    create: jest.fn(async (body: string) => ({ id: 1, body, htmlUrl: "u" })),
    update: jest.fn(async (id: number, body: string) => ({ id, body, htmlUrl: "u" })),
    remove: jest.fn(async (_id: number) => {}),
    addReactions: jest.fn(async (_id: number, _reactions: Reaction[]) => {}),
  };
}

describe("runMode", () => {
  it("upsert updates when the tag is found", async () => {
    const api = fakeApi({ id: 9, body: "old", htmlUrl: "u" });
    const res = await runMode(baseConfig(), api);
    expect(api.update).toHaveBeenCalled();
    expect(res?.id).toBe(9);
  });

  it("upsert creates when not found and create-if-not-exists is true", async () => {
    const api = fakeApi(null);
    await runMode(baseConfig(), api);
    expect(api.create).toHaveBeenCalled();
  });

  it("upsert no-ops when not found and create-if-not-exists is false", async () => {
    const api = fakeApi(null);
    const res = await runMode(baseConfig({ createIfNotExists: false }), api);
    expect(api.create).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("recreate removes the old comment then creates", async () => {
    const api = fakeApi({ id: 9, body: "old", htmlUrl: "u" });
    await runMode(baseConfig({ mode: "recreate" }), api);
    expect(api.remove).toHaveBeenCalledWith(9);
    expect(api.create).toHaveBeenCalled();
  });

  it("delete removes the found comment and returns null", async () => {
    const api = fakeApi({ id: 9, body: "old", htmlUrl: "u" });
    const res = await runMode(baseConfig({ mode: "delete", body: "" }), api);
    expect(api.remove).toHaveBeenCalledWith(9);
    expect(res).toBeNull();
  });

  it("delete no-ops when nothing is found", async () => {
    const api = fakeApi(null);
    await runMode(baseConfig({ mode: "delete", body: "" }), api);
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("applies reactions after create", async () => {
    const api = fakeApi(null);
    await runMode(baseConfig({ reactions: ["+1"] }), api);
    expect(api.addReactions).toHaveBeenCalledWith(1, ["+1"]);
  });

  it("applies reactions after an upsert update", async () => {
    const api = fakeApi({ id: 9, body: "old", htmlUrl: "u" });
    await runMode(baseConfig({ reactions: ["heart"] }), api);
    expect(api.addReactions).toHaveBeenCalledWith(9, ["heart"]);
  });

  it("warns and no-ops on delete without a comment-tag", async () => {
    const api = fakeApi(null);
    const res = await runMode(baseConfig({ mode: "delete", body: "", commentTag: undefined }), api);
    expect(api.remove).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalled();
    expect(res).toBeNull();
  });
});
