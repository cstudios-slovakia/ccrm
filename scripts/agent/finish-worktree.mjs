#!/usr/bin/env node
// Merge an agent worktree back into the integration branch and remove it. Run from the MAIN checkout
// after ExitWorktree(keep).
//   node scripts/agent/finish-worktree.mjs <name|path> [--dry-run] [--no-merge [--discard]] [--external]
// Refuses worktrees outside .claude/worktrees/ (another session's, or hand-made) unless --external.
// Steps: validate clean -> rebase onto integration branch if needed -> ff-only merge -> unlink
// node_modules junction (never followed) -> git worktree remove -> git branch -d -> verify main node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { exists, git, isLink, isManaged, listWorktrees, norm, removeLinks, samePath, toplevel } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const dry = flag('--dry-run'), noMerge = flag('--no-merge'), discard = flag('--discard'), external = flag('--external');
const query = args.find((a) => !a.startsWith('--'));
const die = (m, code = 1) => { console.error(`\nABORT: ${m}`); process.exit(code); };
const log = (m) => console.log(`${dry ? '[dry-run] ' : ''}${m}`);

if (!query) die('usage: finish-worktree.mjs <name|path> [--dry-run] [--no-merge [--discard]]', 2);

const cwd = process.cwd();
const all = listWorktrees(cwd);
if (!all.length) die('not inside a git repository.');
const main = all[0];
const top = toplevel(cwd);
if (!top || !samePath(top, main.path)) die(`run this from the main checkout (${main.path}), not from ${top ?? cwd}.`);

const integ = git(main.path, ['branch', '--show-current']).out;
if (!integ) die('the main checkout is on a detached HEAD; check out the integration branch first.');

// Resolve the worktree: exact path, folder name, branch name, or worktree-<name>.
const q = norm(query);
const wt = all.slice(1).find((w) =>
  samePath(w.path, query) || path.basename(w.path).toLowerCase() === query.toLowerCase() ||
  w.branch === query || w.branch === `worktree-${query}` || norm(w.path) === q);
if (!wt) die(`no linked worktree matches "${query}". Known:\n${all.slice(1).map((w) => `  ${w.path} (${w.branch})`).join('\n') || '  (none)'}`);
if (!isManaged(main.path, wt.path) && !external) {
  die(`${wt.path} is outside .claude/worktrees/, so it is not an agent worktree: most likely another session's (e.g. a PR branch it is still working on) or one made by hand. Leave it alone. If you are sure it is yours, re-run with --external.`);
}
if (!wt.branch) die(`${wt.path} is on a detached HEAD; handle it by hand.`);
if (wt.branch === integ) die('that worktree is on the integration branch itself.');
if (!fs.existsSync(wt.path)) die(`${wt.path} is missing on disk; run "git worktree prune", then delete the branch ${wt.branch} by hand.`);

log(`main checkout: ${main.path} (integration branch: ${integ})`);
log(`worktree: ${wt.path} (branch: ${wt.branch})`);

// 1. Uncommitted changes?
const dirty = git(wt.path, ['status', '--porcelain']).out;
if (dirty) die(`worktree has uncommitted changes; commit or discard them first:\n${dirty.split(/\r?\n/).map((l) => `  ${l}`).join('\n')}`);

const count = (range) => Number(git(main.path, ['rev-list', '--count', range]).out) || 0;
const ahead = count(`${integ}..${wt.branch}`);
const behind = count(`${wt.branch}..${integ}`);
log(`branch is ${ahead} commit(s) ahead, ${behind} behind ${integ}.`);

let mergedCommits = '';
if (noMerge) {
  if (ahead > 0 && !discard) {
    die(`${wt.branch} has ${ahead} commit(s) not in ${integ}. Merge them (drop --no-merge) or pass --discard to throw them away:\n${git(main.path, ['log', '--oneline', `${integ}..${wt.branch}`]).out}`);
  }
  if (ahead > 0) log(`--discard: dropping ${ahead} unmerged commit(s).`);
} else {
  if (ahead === 0) log('nothing to merge.');
  // 2. Rebase inside the worktree when the branch is not on top of the integration branch.
  if (behind > 0 && ahead > 0) {
    if (dry) log(`would rebase ${wt.branch} onto ${integ}.`);
    else {
      log(`rebasing ${wt.branch} onto ${integ} ...`);
      const rb = git(wt.path, ['rebase', integ]);
      if (!rb.ok) {
        git(wt.path, ['rebase', '--abort']);
        const files = git(wt.path, ['diff', '--name-only', '--diff-filter=U']).out;
        die(`rebase hit conflicts and was aborted; the worktree is unchanged. Rebase by hand in ${wt.path} (git rebase ${integ}), then re-run.\n${rb.err || rb.out}${files ? `\nConflicting files:\n${files}` : ''}`);
      }
    }
  }
  // 3. Fast-forward merge in the main checkout.
  if (ahead > 0) {
    mergedCommits = dry ? git(main.path, ['log', '--oneline', `${integ}..${wt.branch}`]).out : '';
    if (dry) log(`would run: git merge --ff-only ${wt.branch}\n${mergedCommits}`);
    else {
      const before = git(main.path, ['rev-parse', 'HEAD']).out;
      const mg = git(main.path, ['merge', '--ff-only', wt.branch]);
      if (!mg.ok) die(`ff-only merge failed; nothing was changed. Typical cause: uncommitted files in the main checkout that the merge would overwrite.\n${mg.err || mg.out}\nMain checkout status:\n${git(main.path, ['status', '--short']).out || '  (clean)'}`);
      mergedCommits = git(main.path, ['log', '--oneline', `${before}..HEAD`]).out;
      log(`merged into ${integ}:\n${mergedCommits}`);
    }
  }
}

// 4. Remember the main node_modules state, then remove links (never followed) and the worktree.
const mainNm = path.join(main.path, 'node_modules');
const tsc = path.join(mainNm, 'typescript', 'bin', 'tsc');
const entries = () => (fs.existsSync(mainNm) ? fs.readdirSync(mainNm).length : 0);
const hadTsc = fs.existsSync(tsc), nEntries = entries();

const links = fs.readdirSync(wt.path).filter((n) => isLink(path.join(wt.path, n)));
if (dry) {
  log(`would remove link(s) [${links.join(', ') || 'none'}] without following, then git worktree remove, then git branch ${discard ? '-D' : '-d'} ${wt.branch}.`);
  process.exit(0);
}
const removed = removeLinks(wt.path);
if (removed.length) log(`removed link(s): ${removed.join(', ')}`);
if (entries() !== nEntries || (hadTsc && !fs.existsSync(tsc))) die(`main node_modules changed while unlinking (${nEntries} -> ${entries()} entries). Investigate before anything else.`, 3);

let rm = git(main.path, ['worktree', 'remove', wt.path]);
if (!rm.ok) {
  const ignored = git(wt.path, ['status', '--ignored', '--porcelain']).out.split(/\r?\n/).filter((l) => l.startsWith('!!'));
  const other = git(wt.path, ['status', '--porcelain']).out;
  if (other || !ignored.length) die(`git worktree remove failed:\n${rm.err || rm.out}`);
  log(`only ignored leftovers block removal (links are already gone):\n${ignored.map((l) => `  ${l.slice(3)}`).join('\n')}`);
  rm = git(main.path, ['worktree', 'remove', '--force', wt.path]);
  if (!rm.ok) die(`git worktree remove --force failed:\n${rm.err || rm.out}`);
}
log('worktree removed.');
git(main.path, ['worktree', 'prune']);

// 5. Branch.
const br = git(main.path, ['branch', discard ? '-D' : '-d', wt.branch]);
if (!br.ok) console.error(`WARNING: could not delete branch ${wt.branch}: ${br.err || br.out}`);
else log(`branch ${wt.branch} deleted.`);

// 6. Verify main node_modules.
if (entries() !== nEntries || (hadTsc && !fs.existsSync(tsc))) die(`main node_modules is DAMAGED (${nEntries} -> ${entries()} entries; tsc present: ${fs.existsSync(tsc)}). Run npm install in the main checkout.`, 3);
log(`main node_modules intact (${entries()} entries${hadTsc ? ', typescript/bin/tsc present' : ''}).`);
console.log(`\nDONE: ${noMerge ? 'cleaned up' : 'merged and cleaned up'} ${wt.branch}.`);
