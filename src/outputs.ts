import * as core from "@actions/core";
import { ModeResult } from "./modes";

export function setOutputs(result: ModeResult | null): void {
  if (!result) return;
  core.setOutput("id", result.id);
  core.setOutput("body", result.body);
  core.setOutput("html-url", result.htmlUrl);
}
