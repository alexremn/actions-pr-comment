import { parseConfig, VALID_REACTIONS } from "../src/config.js";

function withInputs(inputs: Record<string, string>, fn: () => void) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(inputs)) {
    process.env[`INPUT_${k.toUpperCase().replace(/ /g, "_")}`] = v;
  }
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

describe("parseConfig", () => {
  it("parses message + defaults", () => {
    withInputs({ message: "hi", "github-token": "t" }, () => {
      const c = parseConfig();
      expect(c.body).toBe("hi");
      expect(c.mode).toBe("upsert");
      expect(c.createIfNotExists).toBe(true);
      expect(c.token).toBe("t");
      expect(c.reactions).toEqual([]);
    });
  });

  it("rejects when both message and file-path are set", () => {
    withInputs({ message: "hi", "file-path": "x.md", "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/only one of/i);
    });
  });

  it("requires a body for upsert", () => {
    withInputs({ "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/message.*file-path/i);
    });
  });

  it("allows an empty body for delete", () => {
    withInputs({ mode: "delete", "comment-tag": "t1", "github-token": "t" }, () => {
      expect(parseConfig().body).toBe("");
    });
  });

  it("rejects an invalid mode", () => {
    withInputs({ message: "hi", mode: "bogus", "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/mode/i);
    });
  });

  it("parses and validates reactions", () => {
    withInputs({ message: "hi", reactions: "+1, rocket", "github-token": "t" }, () => {
      expect(parseConfig().reactions).toEqual(["+1", "rocket"]);
    });
  });

  it("rejects an unknown reaction", () => {
    withInputs({ message: "hi", reactions: "thumbsup", "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/reaction/i);
    });
  });
});
