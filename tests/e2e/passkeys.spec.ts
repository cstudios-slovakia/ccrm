import { expect, test, type Page } from '@playwright/test';
import { startSession, gotoView } from './helpers/appDriver';
import { holdToConfirm } from './helpers/hold';

/** Starts from the login screen: the mocks, minus the seeded admin session. */
async function signedOut(page: Page) {
  await startSession(page);
  // Registered after the fixture's seeding script, so it clears sessionStorage
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem('crm_current_user_rbac');
      window.sessionStorage.removeItem('crm_session_token');
    } catch {
      /* nothing seeded */
    }
  });
}

/** Configures Chromium CDP virtual authenticator */
async function setupVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

test.describe('Biometric login (passkeys)', () => {
  test('(a) login page shows the passkey button and divider and clicking it logs in to app shell', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Pre-create a resident key on the virtual authenticator so navigator.credentials.get finds it
    await page.evaluate(async () => {
      await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          rp: { name: 'CCRM', id: 'localhost' },
          user: { id: new Uint8Array([1, 2, 3]), name: 'erik@crm.com', displayName: 'Erik' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { residentKey: 'required', requireResidentKey: true },
        },
      });
    });

    const passkeyBtn = page.getByRole('button', {
      name: /Sign in with a passkey|Prihlásiť sa prístupovým kľúčom|Bejelentkezés hozzáférési kulccsal/,
    });
    const divider = page.getByText(/Or continue with email|Alebo pokračujte e-mailom|Vagy folytassa e-mailben/);

    await expect(passkeyBtn).toBeVisible({ timeout: 5000 });
    await expect(divider).toBeVisible({ timeout: 5000 });

    await passkeyBtn.click();

    // Verify user lands in the app shell
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
  });

  test('(b) with status.available: false the button and divider are absent', async ({ page }) => {
    await signedOut(page);
    await page.route('**/api/passkeys.php', (route) => {
      const postData = route.request().postData() || '';
      if (postData.includes('"status"')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, available: false }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('button', {
        name: /Sign in with a passkey|Prihlásiť sa prístupovým kľúčom|Bejelentkezés hozzáférési kulccsal/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Or continue with email|Alebo pokračujte e-mailom|Vagy folytassa e-mailben/),
    ).toHaveCount(0);
  });

  test('(c) personal settings: empty state shows, adding a passkey with password makes it appear, removing it brings empty state back', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await startSession(page);
    await gotoView(page, '#personal-settings');

    // 1. Empty state is visible
    const emptyTitle = page.getByText(/No passkeys yet|Zatiaľ žiadne prístupové kľúče|Még nincs hozzáférési kulcs/);
    await expect(emptyTitle).toBeVisible({ timeout: 10_000 });

    // 2. Open Add panel
    const addBtn = page.getByRole('button', {
      name: /Add passkey|Pridať prístupový kľúč|Hozzáférési kulcs hozzáadása/,
    }).first();
    await addBtn.click();

    // 3. Fill name and password
    const nameInput = page.getByLabel(/Passkey name|Názov prístupového kľúča|A hozzáférési kulcs neve/);
    await nameInput.fill('Test Authenticator');

    const pwdInput = page.getByLabel(/Confirm with your current password|Potvrďte súčasným heslom|Erősítse meg a jelenlegi jelszavával/);
    await pwdInput.fill('password');

    // 4. Click Register button
    const registerBtn = page.getByRole('button', {
      name: /Register passkey|Zaregistrovať prístupový kľúč|Hozzáférési kulcs regisztrálása/,
    });
    await registerBtn.click();

    // 5. Verify passkey is added and visible in list
    await expect(page.getByText('Test Authenticator')).toBeVisible({ timeout: 5000 });
    await expect(emptyTitle).toHaveCount(0);

    // 6. Delete the passkey using hold-to-confirm
    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first();
    await holdToConfirm(deleteBtn);

    // 7. Verify empty state returns
    await expect(emptyTitle).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Test Authenticator')).toHaveCount(0);
  });
});
