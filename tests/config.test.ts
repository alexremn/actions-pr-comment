import { jest } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseConfig, parsePrNumber, VALID_REACTIONS } from "../src/config.js";

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

  it("ignores empty reaction entries", () => {
    withInputs({ message: "hi", reactions: " , ,eyes,", "github-token": "t" }, () => {
      expect(parseConfig().reactions).toEqual(["eyes"]);
    });
  });

  it("reads the body from file-path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prc-config-"));
    const file = path.join(dir, "body.md");
    fs.writeFileSync(file, "# Report\n\nall green\n");
    try {
      withInputs({ "file-path": file, "github-token": "t" }, () => {
        expect(parseConfig().body).toBe("# Report\n\nall green\n");
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports an unreadable file-path", () => {
    withInputs({ "file-path": "/nonexistent/body.md", "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/cannot read file-path "\/nonexistent\/body\.md"/i);
    });
  });

  it("parses pr-number", () => {
    withInputs({ message: "hi", "pr-number": "42", "github-token": "t" }, () => {
      expect(parseConfig().prNumber).toBe(42);
    });
  });

  it.each(["abc", "0", "-1", "1.5", "Infinity", "9007199254740993"])("rejects pr-number %p", (raw) => {
    withInputs({ message: "hi", "pr-number": raw, "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/invalid pr-number.*positive integer/i);
    });
  });

  it.each([
    ["true", true],
    ["True", true],
    ["TRUE", true],
    ["false", false],
    ["False", false],
    ["FALSE", false],
  ])("parses create-if-not-exists %p", (raw, expected) => {
    withInputs({ message: "hi", "create-if-not-exists": raw, "github-token": "t" }, () => {
      expect(parseConfig().createIfNotExists).toBe(expected);
    });
  });

  it("treats an unknown create-if-not-exists as false and warns", () => {
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      withInputs({ message: "hi", "create-if-not-exists": "yes", "github-token": "t" }, () => {
        expect(parseConfig().createIfNotExists).toBe(false);
      });
      expect(write).toHaveBeenCalledWith(expect.stringMatching(/^::warning::Invalid create-if-not-exists "yes"/));
    } finally {
      write.mockRestore();
    }
  });

  it("refuses a symlinked file-path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prc-config-"));
    const target = path.join(dir, "secret");
    const link = path.join(dir, "body.md");
    fs.writeFileSync(target, "TOKEN=abc");
    fs.symlinkSync(target, link);
    try {
      withInputs({ "file-path": link, "github-token": "t" }, () => {
        expect(() => parseConfig()).toThrow(/cannot read file-path.*symbolic links are not allowed/i);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a valid comment-tag", () => {
    withInputs({ message: "hi", "comment-tag": "build--linux->arm", "github-token": "t" }, () => {
      expect(parseConfig().commentTag).toBe("build--linux->arm");
    });
  });

  it.each(["a-->b", "a--!>b"])("rejects comment-tag %p that would close the marker", (tag) => {
    withInputs({ message: "hi", "comment-tag": tag, "github-token": "t" }, () => {
      expect(() => parseConfig()).toThrow(/invalid comment-tag/i);
    });
  });
});

describe("parsePrNumber", () => {
  it("returns undefined for an empty input", () => {
    expect(parsePrNumber("")).toBeUndefined();
  });

  it("returns the number for a positive integer", () => {
    expect(parsePrNumber("7")).toBe(7);
  });
});
