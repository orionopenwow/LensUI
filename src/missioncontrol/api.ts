// Mission Control's one door to Rust (`mc_*` commands, src-tauri/src/mission/commands.rs).
// `?mcmock=1` serves the fixtures in mock.ts instead (parity scenes, screenshots, offline demos).
import { invoke } from "@tauri-apps/api/core";
import type { Plan, WriteAction } from "./model/types";

export const REPO = "orionopenwow/LensUI";
export const R = `/repos/${REPO}`;

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
export const MOCK = params.has("mcmock");

let mockImpl: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function mockCall(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  if (!mockImpl) mockImpl = (await import("./mock")).mockCall;
  return mockImpl(cmd, args);
}

export function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (MOCK ? mockCall(cmd, args) : invoke(cmd, args)) as Promise<T>;
}

export interface Answer<T = unknown> {
  status: number;
  data: T;
  fromCache: boolean;
  stale: boolean;
  offline: boolean;
  fetchedMs: number;
}

/** GET a path of this repo's REST API through the Rust cache. */
export function gh<T = unknown>(path: string, force = false): Promise<Answer<T>> {
  return call<Answer<T>>("mc_gh", { path, force });
}

export const plan = (action: WriteAction) => call<Plan>("mc_plan", { action });
export const apply = (id: string) => call<{ message: string; url?: string }>("mc_apply", { id });
export const cancel = (id: string) => call<void>("mc_cancel", { id });
export const stateGet = <T = Record<string, unknown>>(name: "prefs" | "decisions" | "checks" | "trend") => call<T>("mc_state_get", { name });
export const stateSet = (name: "prefs" | "decisions" | "checks" | "trend", value: unknown) => call<void>("mc_state_set", { name, value });
