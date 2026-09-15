import { resolveTarget } from "../src/context.js";

const ctx = (issueNumber?: number) => ({
  repo: { owner: "o", repo: "r" },
  issue: { number: issueNumber as number },
  payload: {},
});

describe("resolveTarget", () => {
  it("prefers the explicit pr-number", () => {
    expect(resolveTarget(42, ctx(7) as any)).toEqual({ owner: "o", repo: "r", issueNumber: 42 });
  });

  it("falls back to the context issue number", () => {
    expect(resolveTarget(undefined, ctx(7) as any)).toEqual({ owner: "o", repo: "r", issueNumber: 7 });
  });

  it("throws when no number is available", () => {
    expect(() => resolveTarget(undefined, ctx(undefined) as any)).toThrow(/pull request number/i);
  });
});
