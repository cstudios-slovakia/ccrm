import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

const SETTLE = { timeout: 20_000 };

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

interface MockTaskFileRecord {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
  isCodePreviewable: boolean;
  language: string;
  uploadedBy: string;
  createdAt: string;
  url: string;
  downloadUrl: string;
  content: Buffer;
}

function parseMultipartUpload(body: Buffer, contentType: string): { taskId: string; fileName: string; mimeType: string; content: Buffer } {
  const bMatch = contentType.match(/boundary=([^\s;]+)/i);
  const boundary = bMatch ? bMatch[1].replace(/^"|"$/g, '') : '';
  const raw = body.toString('latin1');
  const parts = boundary ? raw.split(`--${boundary}`) : [raw];
  let taskId = '';
  let fileName = 'upload.txt';
  let mimeType = 'application/octet-stream';
  let content = Buffer.alloc(0);

  for (const part of parts) {
    if (!part.includes('Content-Disposition:')) continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const payloadLatin1 = part.slice(headerEnd + 4).replace(/\r\n$/, '');
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fieldName = nameMatch?.[1] || '';
    if (fieldName === 'taskId') {
      taskId = payloadLatin1.trim();
    } else if (fieldName === 'file') {
      const fnMatch = headers.match(/filename="([^"]*)"/);
      if (fnMatch?.[1]) fileName = fnMatch[1];
      const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      if (ctMatch?.[1]) mimeType = ctMatch[1].trim();
      content = Buffer.from(payloadLatin1, 'latin1');
    }
  }
  return { taskId, fileName, mimeType, content };
}

test.describe('Tasks — Files, Inline Description Blocks, Fullscreen & Linkable Detail View', () => {
  test('supports uploading dev files & images, code preview, inline insert, fullscreen split modal, and #task-<id> detail view', async ({ page }) => {
    const store = new Map<string, MockTaskFileRecord[]>();
    let seq = 1;

    await startSession(page);

    await page.route('**/api/task_files.php**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const action = url.searchParams.get('action') || '';
      const method = req.method().toUpperCase();

      const findById = (id: string) => {
        for (const list of store.values()) {
          const hit = list.find((f) => f.id === id);
          if (hit) return hit;
        }
        return undefined;
      };

      const toPublic = ({ content: _c, ...rest }: MockTaskFileRecord) => rest;

      if (method === 'GET' && action === 'download') {
        const hit = findById(url.searchParams.get('id') || '');
        if (!hit) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Not found' }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: hit.mimeType, body: hit.content });
        return;
      }

      if (method === 'GET' && action === 'preview_text') {
        const hit = findById(url.searchParams.get('id') || '');
        if (!hit) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Not found' }) });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            id: hit.id,
            fileName: hit.fileName,
            mimeType: hit.mimeType,
            sizeBytes: hit.sizeBytes,
            language: hit.language,
            text: hit.content.toString('utf8'),
            truncated: false,
          }),
        });
        return;
      }

      if (method === 'GET') {
        const taskId = url.searchParams.get('taskId') || '';
        const files = (store.get(taskId) || []).map(toPublic);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, files, fileCount: files.length }),
        });
        return;
      }

      if (method === 'POST') {
        const ct = req.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const payload = req.postDataJSON() as { action?: string; taskId?: string; id?: string };
          if (payload.action === 'delete' && payload.taskId && payload.id) {
            const next = (store.get(payload.taskId) || []).filter((f) => f.id !== payload.id);
            store.set(payload.taskId, next);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, fileCount: next.length }),
            });
            return;
          }
        }

        const parsed = parseMultipartUpload(req.postDataBuffer() || Buffer.alloc(0), ct);
        const id = `tf-mock-${seq++}`;
        const lower = parsed.fileName.toLowerCase();
        const isImage = /\.(png|jpe?g|webp|gif)$/i.test(lower);
        const isCode = /\.(ts|tsx|js|php|sql|json|md|txt)$/i.test(lower) || lower === 'dockerfile';
        const baseUrl = `api/task_files.php?action=download&id=${encodeURIComponent(id)}`;
        const record: MockTaskFileRecord = {
          id,
          taskId: parsed.taskId,
          fileName: parsed.fileName,
          mimeType: parsed.mimeType || (isImage ? 'image/png' : 'text/plain'),
          sizeBytes: parsed.content.length || 12,
          isImage,
          imageWidth: isImage ? 1 : null,
          imageHeight: isImage ? 1 : null,
          isCodePreviewable: isCode,
          language: lower.endsWith('.ts') ? 'typescript' : 'text',
          uploadedBy: 'Erik',
          createdAt: new Date().toISOString(),
          url: baseUrl,
          downloadUrl: `${baseUrl}&download=1`,
          content: parsed.content,
        };
        const existing = store.get(parsed.taskId) || [];
        const updated = [record, ...existing];
        store.set(parsed.taskId, updated);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, file: toPublic(record), fileCount: updated.length }),
        });
        return;
      }

      await route.fallback();
    });

    await gotoView(page, '#tasks');

    const taskTitle = 'Zavolať klientke Silvii';
    const tomorrowBtn = page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first();
    if (await tomorrowBtn.isVisible().catch(() => false)) {
      await tomorrowBtn.click();
    }

    const taskCard = page.locator('[data-task-card]').filter({ hasText: taskTitle }).first();
    await expect(taskCard).toBeVisible(SETTLE);
    await taskCard.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).locator('visible=true').first().click();

    // Open Files tab inside right-hand panel
    await page.getByTestId('task-activity-filter-files').click();
    await expect(page.getByTestId('task-files-panel')).toBeVisible(SETTLE);

    // Upload TypeScript code file and PNG image
    await page.getByTestId('task-files-file-input').setInputFiles([
      {
        name: 'helper.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from('export const hello = "ccrm";\n', 'utf8'),
      },
      {
        name: 'mockup.png',
        mimeType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
    ]);

    const fileRows = page.getByTestId('task-file-item');
    await expect(fileRows).toHaveCount(2, SETTLE);
    await expect(page.getByTestId('task-activity-filter-files')).toContainText('(2)', SETTLE);

    // Preview TypeScript code file in safe modal & close with Escape
    const tsRow = fileRows.filter({ hasText: 'helper.ts' });
    await tsRow.getByTestId('task-file-preview-btn').click();
    await expect(page.getByTestId('task-file-preview-modal')).toBeVisible(SETTLE);
    await expect(page.getByTestId('task-file-code-viewer')).toContainText('export const hello = "ccrm";', SETTLE);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-file-preview-modal')).toBeHidden(SETTLE);

    // Insert helper.ts inline into description
    await tsRow.getByTestId('task-file-insert-btn').click();
    const drawerDialog = page.getByRole('dialog');
    await expect(drawerDialog.getByTestId('block-editor-file-block').filter({ hasText: 'helper.ts' })).toBeVisible(SETTLE);

    // Open Fullscreen Split View -> insert mockup.png from right panel -> Escape back to drawer
    await drawerDialog.getByTestId('block-editor-fullscreen-btn').click();
    const fsModal = page.getByTestId('task-description-fullscreen-modal');
    await expect(fsModal).toBeVisible(SETTLE);
    await expect(fsModal.getByTestId('task-files-panel')).toBeVisible(SETTLE);
    await fsModal.getByTestId('task-file-item').filter({ hasText: 'mockup.png' }).getByTestId('task-file-insert-btn').click();
    await expect(fsModal.getByTestId('block-editor-file-block').filter({ hasText: 'mockup.png' })).toBeVisible(SETTLE);
    await page.keyboard.press('Escape');
    await expect(fsModal).toBeHidden(SETTLE);

    // Drawer editor synced both inline file blocks; Save changes before navigating
    await expect(drawerDialog.getByTestId('block-editor-file-block')).toHaveCount(2, SETTLE);

    // Open full-page Task Detail View (#task-<id>)
    await page.getByTestId('task-drawer-open-page-btn').click();
    await expect(page.getByTestId('task-detail-view')).toBeVisible(SETTLE);
    const currentHash = await page.evaluate(() => window.location.hash);
    expect(currentHash).toMatch(/^#task-/);

    // Verify description blocks and right-hand Files tab work on full-page view
    await expect(page.getByTestId('task-detail-view').getByTestId('block-editor-file-block')).toHaveCount(2, SETTLE);
    await page.getByTestId('task-detail-view').getByTestId('task-activity-filter-files').click();
    await expect(page.getByTestId('task-detail-view').getByTestId('task-file-item')).toHaveCount(2, SETTLE);

    // Direct navigation to #task-<id> loads the detail page cleanly
    await gotoView(page, currentHash);
    await expect(page.getByTestId('task-detail-view')).toBeVisible(SETTLE);
  });
});
