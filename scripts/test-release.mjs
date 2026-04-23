#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const commands = [
  {
    label: "pack-verify",
    args: ["./scripts/pack-verify.mjs", "--json"]
  },
  {
    label: "release-dry-run-fast",
    args: ["./scripts/release.mjs", "--dry-run", "--json"]
  },
  {
    label: "release-dry-run-strict",
    args: ["./scripts/release.mjs", "--dry-run", "--strict", "--json"]
  },
  {
    label: "public-assembly",
    args: ["--test", "tests/public/public-assembly.test.mjs"]
  },
  {
    label: "projection-release",
    args: ["--test", "--test-name-pattern=release", "tests/projection-skillpack-v3.test.mjs"]
  },
  {
    label: "verification-release",
    args: ["--test", "--test-name-pattern=release", "tests/verification-regression.test.mjs"]
  }
];

for (const task of commands) {
  const result = spawnSync(process.execPath, task.args, {
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
