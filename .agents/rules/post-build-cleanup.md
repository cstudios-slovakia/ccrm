---
description: Ensure git working tree is cleaned up after verification builds
---

# Post-Build Worktree Cleanup Rule

- When validating TypeScript/React code correctness, prefer running `npx tsc --noEmit` rather than `npm run build` so `dist/` is not modified.
- If `npm run build` (or any command producing build artifacts in `dist/`) is executed, always restore and clean up the `dist/` directory immediately afterward (`git checkout -- dist/ && git clean -fd dist/`) unless explicitly committing a production distribution bundle.
