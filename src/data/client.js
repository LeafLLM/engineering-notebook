import { createClient } from "@supabase/supabase-js";
import { createDemoClient } from "./demo-client";

export const isDemo = new URLSearchParams(location.search).get("demo") === "1";
export function demoUrl(enabled) {
  const url = new URL(location.href);
  if (enabled) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  url.hash = "overview";
  return url.href;
}

// The test server overrides these public settings without touching real accounts.
const settings = window.__NOTEBOOK_CONFIG__ || {};
// Public widget identifier. The secret key stays in Supabase's Auth settings.
export const captchaSiteKey =
  settings.captchaSiteKey ?? "1984b002-1e3c-4a28-8e4a-42524a328fcc";
export const notebookDb = isDemo
  ? createDemoClient()
  : createClient(
      settings.url || "https://wdlncujtesrctnztrpxi.supabase.co",
      settings.key || "sb_publishable_HyZn8cBnp3TnCxMobCqUpw_aiX1PxoP",
    );
