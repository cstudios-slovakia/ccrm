import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Transcribing a voice note recorded on a lead's timeline.
 *
 * Reported from a production install (v1.10.65): after recording a voice note on a
 * lead, "Prepísať" never produced a transcript. A timeline recording is stored under
 * a `note_event_*` id and, by design, has no `meeting_notes` row — but the transcribe
 * request only sent that id, so the server looked for a meeting that could not exist
 * and answered 404 "Meeting note not found" before Whisper was ever called.
 *
 * The request now also names the stored recording (`audioFile`). This test drives the
 * real flow with Chromium's fake microphone and checks that name travels with it.
 * Whisper itself is out of scope here — the endpoint is mocked.
 */

const LEAD_HASH = '#lead-lead-horvath';
const STORED_PATH = '/uploads/meeting_audio_note_event_1700000000000.webm';
const TRANSCRIPT = 'Dobrý deň, volal mi pán Machčiník. Chce cenovú ponuku na fasádu.';

/** One second of a quiet 440 Hz tone: the fake microphone only needs *some* audio. */
function writeFakeMicrophoneWav(): string {
  const rate = 16000;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ccrm-fake-mic-')), 'speech.wav');
  writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${writeFakeMicrophoneWav()}`,
    ],
  },
});

test.describe('Lead timeline — transcribing a voice note', () => {
  test('the transcribe request names the stored recording, and the transcript lands in the note', async ({ page }) => {
    await startSession(page);

    // The "Prepísať" button is only offered once an OpenAI key is configured.
    await page.route('**/sync.php**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const payload = buildSyncPayload();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          settings: {
            ...payload.settings,
            integrationsConfig: { ...payload.settings.integrationsConfig, openAiKey: 'sk-test-not-a-real-key' },
          },
        }),
      });
    });

    let uploadedId = '';
    await page.route('**/api/upload_audio.php', async (route) => {
      uploadedId = /name="meetingId"\r\n\r\n([^\r\n]+)/.exec(route.request().postData() ?? '')?.[1] ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, filePath: STORED_PATH }),
      });
    });

    const transcribeBodies: { meetingId?: string; audioFile?: string }[] = [];
    await page.route('**/api/transcribe_meeting.php', async (route) => {
      transcribeBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, transcription: TRANSCRIPT }),
      });
    });

    await gotoView(page, LEAD_HASH);
    await page.getByText('Výber typu udalosti').locator('xpath=..').getByRole('button', { name: 'Poznámka', exact: true }).click();

    await page.getByRole('button', { name: /Nahrať/ }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Zastaviť/ }).click();

    const transcribe = page.getByRole('button', { name: /Prepísať/ });
    await expect(transcribe).toBeEnabled();
    await transcribe.click();

    await expect.poll(() => transcribeBodies.length).toBe(1);
    expect(transcribeBodies[0].audioFile).toBe(STORED_PATH);
    expect(transcribeBodies[0].meetingId).toBe(uploadedId);
    await expect(page.getByText(TRANSCRIPT)).toBeVisible();
  });
});
