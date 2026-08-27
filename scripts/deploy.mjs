#!/usr/bin/env node
/**
 * One-command local deploy helper.
 *
 * The production server has NO Node/Vite build step — `php ccrm update` only
 * *publishes* the already-built dist/ to the docroot. So the compiled frontend
 * bundle (dist/index.html + dist/assets/) must be built and committed HERE,
 * before the server pulls. This script chains those manual steps:
 *
 *   1. npm run test:unit + test:qa  gate: never ship a known-broken build
 *   2. npm run build            (tsc -b && vite build)  -> regenerates dist/
 *   3. git add -A + commit      (only if there is anything to commit)
 *   4. git push origin <branch> (your working branch, e.g. dev)
 *   5. git push origin HEAD:<target>  (default: main — what `ccrm update` pulls)
 *
 * Then, on the server:  php ccrm update
 *
 * Usage:
 *   npm run deploy                       # default commit message + push to main
 *   npm run deploy -- "fix: message"     # custom commit message
 *   DEPLOY_TARGET=main npm run deploy     # override the production branch
 *   DEPLOY_SKIP_MAIN=1 npm run deploy     # commit + push working branch only
 *   DEPLOY_SKIP_QA=1 npm run deploy       # skip the test gate (hotfix escape hatch)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TARGET = process.env.DEPLOY_TARGET || "main";
const SKIP_MAIN = process.env.DEPLOY_SKIP_MAIN === "1";
const SKIP_QA = process.env.DEPLOY_SKIP_QA === "1";

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}
function capture(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function readVersion() {
  try {
    const src = readFileSync(new URL("../src/utils/version.ts", import.meta.url), "utf8");
    return (src.match(/VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
  } catch {
    return "unknown";
  }
}

// --- 1. Test gate ----------------------------------------------------------
// The server has no test step and no rollback beyond `git revert`, so this is
// the last place a broken build can be stopped. The QA suite mocks the backend,
// so it needs nothing but Node and Chromium and touches no real data.
if (SKIP_QA) {
  console.log("\nDEPLOY_SKIP_QA=1 - skipping the test gate. You are shipping unverified.");
} else {
  console.log("\nRunning the test gate before shipping (DEPLOY_SKIP_QA=1 to skip).");
  try {
    run("npm run test:unit");
    run("npm run test:qa");
  } catch {
    console.error(
      "\nDeploy aborted: the tests failed. Nothing was built, committed or pushed.\n" +
        "\n  npm run test:qa:report      read the findings\n" +
        "  docs/TESTING.md            how to triage them\n" +
        "\nIf you must ship anyway: DEPLOY_SKIP_QA=1 npm run deploy\n",
    );
    process.exit(1);
  }
}

// --- 2. Build the frontend bundle -----------------------------------------
run("npm run build");

// --- 3. Commit (build output + any pending source changes) ----------------
run("git add -A");
const pending = capture("git status --porcelain");
if (pending) {
  const argMsg = process.argv.slice(2).join(" ").trim();
  const message = argMsg || `build: publish frontend bundle v${readVersion()}`;
  // Commit via stdin so messages with quotes/newlines are passed safely.
  execSync("git commit -F -", { input: message, stdio: ["pipe", "inherit", "inherit"] });
} else {
  console.log("\nNo changes to commit after build — deploying the current HEAD.");
}

// --- 4. Push the working branch -------------------------------------------
const branch = capture("git rev-parse --abbrev-ref HEAD");
run(`git push origin ${branch}`);

// --- 5. Advance the production branch (what `php ccrm update` pulls) -------
if (SKIP_MAIN || branch === TARGET) {
  if (branch === TARGET) {
    console.log(`\nAlready on '${TARGET}' — production branch is up to date.`);
  }
} else {
  // Non-force: this fails loudly if TARGET has commits not in HEAD, rather
  // than silently overwriting someone else's work.
  run(`git push origin HEAD:${TARGET}`);
}

console.log(
  `\nPushed. Now run on the server to publish:\n` +
  `    php ccrm update\n`
);
