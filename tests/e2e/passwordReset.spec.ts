import { expect, test, type Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * The signed-out side of authentication: the "set a new password" screen a
 * reset e-mail links to, and what the login form says when attempts run out.
 * api/password_reset.php and api/login.php are mocked; their own behaviour
 * (token lifetime, forged Host header, session issue) is covered against the
 * real backend, not here.
 */

const TOKEN = 'a'.repeat(64);

/** Starts from the login screen: the mocks, minus the seeded admin session. */
async function signedOut(page: Page) {
  await startSession(page);
  // Registered after the fixture's seeding script, so it runs after it.
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem('crm_current_user_rbac');
      window.sessionStorage.removeItem('crm_session_token');
    } catch {
      /* nothing seeded */
    }
  });
}

/** Mocks api/password_reset.php; returns the bodies posted to it. */
async function mockPasswordReset(page: Page, opts: { tokenValid: boolean }) {
  const posted: Record<string, unknown>[] = [];
  await page.route('**/api/password_reset.php**', async (route) => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET' && action === 'status') return json({ success: true, available: true });
    if (request.method() === 'GET' && action === 'inspect') {
      return json(opts.tokenValid ? { success: true, valid: true, email: TEST_USER.email } : { success: true, valid: false });
    }
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    posted.push(body);
    if (body.action === 'reset') return json({ success: true, user: TEST_USER });
    return json({ success: true, available: true });
  });
  return posted;
}

const rule = (page: Page, name: RegExp) => page.getByRole('listitem').filter({ hasText: name });
const LENGTH_RULE = /12 (characters|znakov|karakter)/;
const MIX_RULE = /digit|číslica|számjegy/;

test.describe('Password reset and sign-in limits', () => {
  test('a reset link names the account, checks the rules live and signs in', async ({ page }) => {
    await signedOut(page);
    const posted = await mockPasswordReset(page, { tokenValid: true });
    await page.goto(`/?reset_token=${TOKEN}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(TEST_USER.email)).toBeVisible();
    await expect(rule(page, LENGTH_RULE)).toHaveAttribute('data-met', 'false');
    await expect(rule(page, MIX_RULE)).toHaveAttribute('data-met', 'false');

    const [newField, confirmField] = [page.getByPlaceholder(/New password|Nové heslo|Új jelszó/).first(), page.getByPlaceholder(/Confirm new password|Potvrďte nové heslo|Új jelszó megerősítése/)];
    await newField.fill('alllowercase123');
    await expect(rule(page, LENGTH_RULE)).toHaveAttribute('data-met', 'true');
    await expect(rule(page, MIX_RULE)).toHaveAttribute('data-met', 'false');

    // A password that breaks a rule never reaches the server.
    await confirmField.fill('alllowercase123');
    await page.getByRole('button', { name: /Update password|Zmeniť heslo|Jelszó frissítése/ }).click();
    await expect(page.getByText(/does not meet the rules|nespĺňa pravidlá|nem felel meg/)).toBeVisible();
    expect(posted.filter((b) => b.action === 'reset')).toHaveLength(0);

    await newField.fill('NewPassw0rdOK');
    await confirmField.fill('NewPassw0rdOK');
    await expect(rule(page, MIX_RULE)).toHaveAttribute('data-met', 'true');
    await page.getByRole('button', { name: /Update password|Zmeniť heslo|Jelszó frissítése/ }).click();

    await expect.poll(() => posted.find((b) => b.action === 'reset')).toMatchObject({ token: TOKEN, password: 'NewPassw0rdOK' });
    // The token leaves the address bar, so a refresh does not reopen the form.
    await expect.poll(() => new URL(page.url()).search).toBe('');

    await page.getByRole('button', { name: /Continue to CCRM|Pokračovať do CCRM|Tovább a CCRM-be/ }).click();
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
  });

  test('a dead link says so up front and offers a new one', async ({ page }) => {
    await signedOut(page);
    await mockPasswordReset(page, { tokenValid: false });
    await page.goto(`/?reset_token=${TOKEN}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/invalid or has expired|neplatný alebo vypršal|érvénytelen vagy lejárt/)).toBeVisible();
    await expect(page.getByPlaceholder(/Confirm new password|Potvrďte nové heslo|Új jelszó megerősítése/)).toHaveCount(0);

    await page.getByRole('button', { name: /Request a new link|Vyžiadať nový odkaz|Új link kérése/ }).click();
    await expect(page.getByPlaceholder(/Your email|Váš e-mail|Az Ön e-mail-címe/)).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
  });

  test('the login form warns when few attempts are left, then reports the lockout', async ({ page }) => {
    await signedOut(page);
    let answer: { status: number; body: unknown } = {
      status: 401,
      body: { success: false, message: 'Invalid email or password.', attempts_remaining: 3, lock_minutes: 15 },
    };
    await page.route('**/api/login.php', (route) =>
      route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const emailField = page.locator('input[type="email"]').first();
    await emailField.fill(TEST_USER.email);
    const passwordField = page.locator('input[type="password"]').first();
    await passwordField.fill('wrong');
    const submit = page.locator('form button[type="submit"]').first();
    await submit.click();
    await expect(page.getByText(/Attempts left: 3|Zostávajúce pokusy: 3|Hátralévő próbálkozások: 3/)).toBeVisible();

    answer = { status: 429, body: { success: false, locked: true, lock_minutes: 15, message: 'Too many login attempts.' } };
    await submit.click();
    await expect(page.getByText(/Too many failed attempts|Príliš veľa neúspešných pokusov|Túl sok sikertelen próbálkozás/)).toBeVisible();
    await expect(page.getByText(/Attempts left|Zostávajúce pokusy|Hátralévő próbálkozások/)).toHaveCount(0);
  });
});
