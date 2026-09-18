import path from 'node:path';
import { test } from '@playwright/test';
import { QAReport } from './helpers/reportCollector';
import { assertNoDefectsFound } from './helpers/gate';
import { startSession } from './helpers/appDriver';
import { listRecordings, loadRecording, replayRecording } from './helpers/chromeRecording';

/**
 * Replays every Chrome DevTools Recorder export in `tests/recordings/`.
 *
 * Running these as Playwright tests rather than a standalone script is what
 * gives them the dev server, the backend fixture, traces, videos, retries, a
 * real exit code and a shared report — the previous standalone runner had none
 * of those and always exited 0.
 *
 * Set `QA_RECORDING=path/to/file.json` to replay a single flow.
 */

const single = process.env.QA_RECORDING;
const files = single ? [path.resolve(single)] : listRecordings();

if (files.length === 0) {
  test.skip('no Chrome Recorder exports found in tests/recordings/', () => {});
}

for (const file of files) {
  const name = path.basename(file);

  test(`recorded flow: ${name}`, async ({ page }) => {
    QAReport.beginScope();
    await startSession(page);

    const recording = loadRecording(file);
    const moduleName = `Recorder: ${recording.title ?? name}`;

    test.info().annotations.push({
      type: 'recording',
      description: `${file} — ${recording.steps.length} steps`,
    });

    const result = await replayRecording(page, recording, moduleName);
    test.info().annotations.push({
      type: 'replay',
      description: `${result.completedSteps}/${result.totalSteps} steps completed`,
    });

    assertNoDefectsFound();
  });
}
