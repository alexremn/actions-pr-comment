import type * as core from "@actions/core";
import { jest } from "@jest/globals";

export const getInput = jest.fn<typeof core.getInput>();
export const getState = jest.fn<typeof core.getState>();
export const saveState = jest.fn<typeof core.saveState>();
export const setFailed = jest.fn<typeof core.setFailed>();
export const setOutput = jest.fn<typeof core.setOutput>();
export const warning = jest.fn<typeof core.warning>();
