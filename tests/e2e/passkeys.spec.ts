import { expect, test, type Page } from '@playwright/test';
import { startSession, gotoView } from './helpers/appDriver';
import { holdToConfirm } from './helpers/hold';

/** The login button reads "fingerprint or face" where the device has a platform authenticator, "passkey" otherwise. */
const PASSKEY_BUTTON =
  /Sign in with a passkey|Prihlásiť sa prístupovým kľúčom|Bejelentkezés hozzáférési kulccsal|Sign in with fingerprint or face|Prihlásiť sa odtlačkom prsta alebo tvárou|Bejelentkezés ujjlenyomattal vagy arcfelismeréssel/;

/** The post-login "use your fingerprint or face next time?" card. */
const OFFER_REGION = /fingerprint or face|odtlačkom prsta alebo tvárou|ujjlenyomattal vagy arccal/;
const OFFER = /Sign in with your fingerprint or face next time\?|Prihlásiť sa nabudúce odtlačkom prsta alebo tvárou\?|Legközelebb ujjlenyomattal vagy arccal jelentkezik be\?/;
const OFFER_SET_UP = /^(Set up|Nastaviť|Beállítás)$/;
const OFFER_NEVER = /Don't ask again|Viac sa nepýtať|Ne kérdezze többet/;

const DEVICE_MARKER = 'ccrm.passkey.onThisDevice';
const DISMISSED_MARKER = 'ccrm.passkey.offerDismissed';

/** Fills the login form and submits it (the login.php mock accepts any credentials). */
async function signInWithPassword(page: Page) {
  await page.locator('input[type="email"]').first().fill('erik@crm.com');
  await page.locator('input[type="password"]').first().fill('password');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
}

/** Puts a resident key on the virtual authenticator so navigator.credentials.get finds one. */
async function createResidentKey(page: Page) {
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
}

const localFlag = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key);

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
      name: PASSKEY_BUTTON,
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
        name: PASSKEY_BUTTON,
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

  test('(d) password login on a capable device offers setup; Set up lists the passkey and the offer does not return', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);

    const offer = page.getByRole('region', { name: OFFER_REGION });
    await expect(offer).toBeVisible({ timeout: 10_000 });
    await expect(offer.getByText(OFFER)).toBeVisible();

    await offer.getByRole('button', { name: OFFER_SET_UP }).click();
    await expect(offer).toHaveCount(0, { timeout: 10_000 });
    expect(await localFlag(page, DEVICE_MARKER)).toBe('1');

    await page.evaluate(() => {
      window.location.hash = '#personal-settings';
    });
    await expect(
      page.getByText(/No passkeys yet|Zatiaľ žiadne prístupové kľúče|Még nincs hozzáférési kulcs/),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first()).toBeVisible();
    await expect(offer).toHaveCount(0);
  });

  test("(e) Don't ask again: the next password login shows no offer", async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);

    const offer = page.getByRole('region', { name: OFFER_REGION });
    await expect(offer).toBeVisible({ timeout: 10_000 });
    await offer.getByRole('button', { name: OFFER_NEVER }).click();
    await expect(offer).toHaveCount(0);
    expect(await localFlag(page, DISMISSED_MARKER)).toBe('1');

    // signedOut() strips the session on every load, so a reload is a fresh sign-in screen
    await page.reload({ waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);
    await page.waitForTimeout(800);
    await expect(offer).toHaveCount(0);
    await expect(page.getByText(OFFER)).toHaveCount(0);
  });

  test('(f) Not now hides the offer for the session but it returns on the next login', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);

    const offer = page.getByRole('region', { name: OFFER_REGION });
    await expect(offer).toBeVisible({ timeout: 10_000 });
    await offer.getByRole('button', { name: /Not now|Teraz nie|Most nem/ }).click();
    await expect(offer).toHaveCount(0);
    expect(await localFlag(page, DISMISSED_MARKER)).toBeNull();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);
    await expect(offer).toBeVisible({ timeout: 10_000 });
  });

  test('(g) passkey login does not trigger the offer', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await createResidentKey(page);

    await page.getByRole('button', { name: PASSKEY_BUTTON }).click();
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await expect(page.getByText(OFFER)).toHaveCount(0);
    // A platform passkey that just signed in is, by definition, on this device
    expect(await localFlag(page, DEVICE_MARKER)).toBe('1');
  });

  test('(h) after the 5-minute window the offer asks for the password, rejects a wrong one, then registers', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await startSession(page, { passkeyPwWindowMs: 0 });
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('crm_current_user_rbac');
        window.sessionStorage.removeItem('crm_session_token');
      } catch {
        /* nothing seeded */
      }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await signInWithPassword(page);

    const offer = page.getByRole('region', { name: OFFER_REGION });
    await expect(offer).toBeVisible({ timeout: 10_000 });
    await offer.getByRole('button', { name: OFFER_SET_UP }).click();

    const pwd = offer.getByLabel(/Confirm with your current password|Potvrďte súčasným heslom|Erősítse meg a jelenlegi jelszavával/);
    await expect(pwd).toBeVisible();

    await pwd.fill('wrong-password');
    await offer.getByRole('button', { name: OFFER_SET_UP }).click();
    await expect(offer.getByRole('alert')).toBeVisible();

    await pwd.fill('password');
    await offer.getByRole('button', { name: OFFER_SET_UP }).click();
    await expect(offer).toHaveCount(0, { timeout: 10_000 });
    expect(await localFlag(page, DEVICE_MARKER)).toBe('1');
  });

  test('(i) the passkey button works while an autofill (conditional) request is pending', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await signedOut(page);
    // Record every navigator.credentials.get so the test can see the pending
    // conditional request being retired before the modal one starts.
    await page.addInitScript(() => {
      const w = window as unknown as { __gets: Array<{ mediation: string | null; signal: AbortSignal | null }> };
      w.__gets = [];
      const original = navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = (opts?: CredentialRequestOptions) => {
        w.__gets.push({ mediation: opts?.mediation ?? null, signal: opts?.signal ?? null });
        return original(opts);
      };
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const conditionalSupported = await page.evaluate(
      async () => !!(await window.PublicKeyCredential?.isConditionalMediationAvailable?.()),
    );
    test.skip(!conditionalSupported, 'This Chromium does not offer conditional mediation');

    await createResidentKey(page);

    const gets = () =>
      page.evaluate(() => {
        const w = window as unknown as { __gets: Array<{ mediation: string | null; signal: AbortSignal | null }> };
        return w.__gets.map((g) => ({ mediation: g.mediation, aborted: !!g.signal?.aborted }));
      });

    // The screen has asked the browser to put passkeys in the email field's autofill
    await expect.poll(async () => (await gets()).some((g) => g.mediation === 'conditional')).toBe(true);

    await expect(page.locator('input[type="email"]').first()).toHaveAttribute('autocomplete', 'username webauthn');
    await expect(page.locator('input[type="password"]').first()).toHaveAttribute('autocomplete', 'current-password');

    await page.getByRole('button', { name: PASSKEY_BUTTON }).click();
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });

    const calls = await gets();
    expect(calls.find((g) => g.mediation === 'conditional')?.aborted).toBe(true);
    expect(calls.some((g) => g.mediation !== 'conditional')).toBe(true);
  });
});
