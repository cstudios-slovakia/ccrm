# Microsoft 365 (Exchange Online) mailboxes

Microsoft switched off password (basic auth) logins for IMAP, POP and SMTP in Exchange Online.
PHP's `imap_open()` cannot sign in with OAuth, so an Exchange Online mailbox cannot be connected
with a host and a password at all. Such a mailbox is connected with **Sign in with Microsoft** and
read and sent from through **Microsoft Graph**, a second mail backend beside the IMAP one.

IMAP / SMTP mailboxes (and a self-hosted Exchange server that still accepts a password) work
exactly as before.

## What it does

| | IMAP mailbox | Microsoft 365 mailbox |
|---|---|---|
| Connect | host, port, login, password | Sign in with Microsoft, no password |
| Inbox, message, attachments, read flag, delete | `imap_*` | Graph `/messages` |
| Send | SMTP, copy appended to Sent | Graph draft + send; Exchange files the sent copy |
| Filing to timelines (cron) | UID high-water mark + backlog | delta query + backlog |
| Stored secret | password, encrypted | refresh token, encrypted |

The matcher, the timeline ids' role, the Message-ID dedupe, the hidden tombstones and the stored
bodies are shared (`api/mail_filing.php`); only the reading differs (`api/graph_filing.php`).

## Setting it up (once per installation, by an admin)

1. **Register an application** in Microsoft Entra admin center → *App registrations* → *New registration*.
   - Supported account types: *Accounts in any organizational directory* (multi-tenant) if the same
     registration serves several customers; *single tenant* if it belongs to one customer.
   - Redirect URI: platform **Web**, the address shown in the product under
     **Settings → E-mail → Company mailboxes → Microsoft 365 sign-in**
     (`https://<your address>/api/graph_oauth.php`). It has to match character for character, and it
     is built from `CCRM_APP_URL` in `config.php` when that is set, otherwise from the address the
     first admin signed in through.
2. **API permissions** → Microsoft Graph → *Delegated*: `Mail.ReadWrite`, `Mail.Send`,
   `offline_access`, `User.Read`. For shared company mailboxes also `Mail.ReadWrite.Shared` and
   `Mail.Send.Shared`.
3. **Certificates & secrets** → *New client secret*. Copy its **value** (not its ID). Note the expiry
   date: when it passes, every renewal fails with "its client secret may have expired" until a new
   secret is entered. Existing sign-ins are kept.
4. In the product, **Settings → E-mail → Company mailboxes → Microsoft 365 sign-in**: enter the
   *Application (client) ID*, the secret and, for a single-tenant app, the *Directory (tenant) ID*
   (empty means any organisation).

An installation that already has the OAuth fields of the Exchange outbound profile filled in
(Settings → Integrations) uses those until its own registration is saved.

### Consent

The first time a user signs in, Microsoft asks them to allow access to their mail. A tenant that
does not let users approve applications shows "Need admin approval" instead: its Microsoft 365
administrator approves the application once (Entra admin center → *Enterprise applications* → the
app → *Permissions* → *Grant admin consent*), after which users sign in without the prompt.

## Connecting mailboxes

- **A user's own mailbox**: Personal settings → E-mail → *Microsoft 365 / Exchange Online* →
  **Sign in with Microsoft**.
- **A company mailbox** (admin): Settings → E-mail → Company mailboxes → *Add mailbox*, type
  *Microsoft 365*, name and address only, **Save**, then **Sign in with Microsoft** on its row. Sign
  in as the mailbox itself, or, for a shared mailbox, as a person with full access to it. An
  account that cannot open the mailbox is refused at once, with the reason.

## The background job needs cron

Mail reaches timelines through the cron job (Automation → Settings shows the command). Without it
only the lazy path runs: a message is filed when its mailbox's owner opens the mail screen or the
customer. A server that runs no cron for the product files nothing in the background, for IMAP
and Microsoft 365 alike.

## When a sign-in stops working

A refresh token dies when the user's password changes, an admin revokes the consent, or it is not
used for 90 days. The server then clears the stored token and reports **sign in again**:

- the mail screen shows a notice instead of a mail-server error,
- Personal settings → E-mail shows the notice with the button,
- an admin sees it on the company mailbox's row, and for personal mailboxes under
  "Personal mailboxes that could not be read",
- every other mailbox keeps being read.

Signing in again reconnects it; nothing already filed is lost or filed twice.

## Where things are stored

- App registration: `system_settings` key `MS_GRAPH_APP` (`clientSecret` encrypted). It is never
  part of the sync payload.
- A mailbox profile: `users.metadata_json.emailSettings` or `company_mailboxes.settings_json` with
  `provider: "microsoft365"`, `graphAccount`, and the encrypted `graphRefreshToken` /
  `graphAccessToken`. The browser only ever sees a mask.
- Filing state: `mail_sync_state` (`uid_validity` = -1 marks Graph state, `delta_link` holds the
  delta link). See `entities_overview.md`.

## Not covered

- **Application permissions (client credentials)** with an Exchange application access policy. A
  company mailbox is connected by a delegated sign-in instead, which needs no tenant-wide grant.
- **Inline images** (`cid:`) in a message body are not shown, as with IMAP.
- **The system outbound profile** (password reset, notifications, workflows) still sends over SMTP.
- A mailbox's aliases are not known: mail sent from an alias address is recognised as outgoing by
  its folder (Sent Items), not by its sender.

## Tests

`npm run test:graph-mail`, `npm run test:graph-oauth`, `tests/e2e/microsoftMail.spec.ts`; see
[`TESTING.md`](TESTING.md) §5f-3. None of them contacts Microsoft, so the first connection of a
real tenant is a manual check: sign in, open the inbox, send a message, and run the cron once.
