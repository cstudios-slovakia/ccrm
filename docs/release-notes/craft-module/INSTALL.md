# Installing the `ccrm-news` module

Target: the Craft project `ccrm-license-server-and-update-notes`
(`ccrm.softwaresolutions.sk`), Craft 5, which already runs `ccrm-license`.

## 1. Copy the files

```
<craft project>/
  modules/
    ccrmlicense/          (already there)
    ccrmnews/             ← copy docs/release-notes/craft-module/ccrmnews/ here
      CcrmNews.php
      controllers/
        ApiController.php
```

The namespace is `modules\ccrmnews`. Your `composer.json` must autoload
`modules\` from `modules/` — it already does for `ccrmlicense`, so nothing to
change. (If you ever see "Class not found", run `composer dump-autoload`.)

## 2. Register it — `config/app.php`

```php
    'modules' => [
        'ccrm-license' => \modules\ccrmlicense\CcrmLicense::class,
        'ccrm-news'    => \modules\ccrmnews\CcrmNews::class,
    ],
    'bootstrap' => ['ccrm-license', 'ccrm-news'],
```

The id must be exactly `ccrm-news`: the routes are `ccrm-news/ping`,
`ccrm-news/asset`, `ccrm-news/publish` and `ccrm-news/state`.

## 3. Secrets — the server's `.env`

```
CCRM_NEWS_API_TOKEN="…"
CCRM_NEWS_VOLUME="images"
CCRM_NEWS_AUTHOR_ID="1"
```

- `CCRM_NEWS_API_TOKEN` — at least 32 characters, or the module refuses every
  call. Generate one in PowerShell:
  `-join ((1..48) | % { [char[]]'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' | Get-Random })`
  The same value goes into the cloud environment's API credential and, for
  manual runs, `.release-notes/.env` as `CRAFT_NEWS_TOKEN`.
- `CCRM_NEWS_VOLUME` — the asset volume handle; yours is `images`.
  Screenshots land in `images/release-notes/<version>/`.
- `CCRM_NEWS_AUTHOR_ID` — the Craft user the entries are authored by (Users →
  your account → the id in the URL). Without it: the first admin.

The module writes its run state to `storage/ccrm-news/state.json`. Make sure a
deploy never wipes `storage/` (Craft's own default).

## 4. Deploy

Upload `modules/ccrmnews/` and `config/app.php`, set the three `.env` values on
the server. No migration, no project-config change, no composer install.

## 5. Check it

From the CCRM repository, with `CRAFT_NEWS_TOKEN` in `.release-notes/.env`:

```bash
node scripts/release-notes/publish.mjs --check
```

A healthy answer lists `craftVersion`, `sites` (`default`, `en`, `hu`),
`volume: "images"`, which fields are per site, and `"missing": []`. Anything in
`missing` says exactly what is not there yet: `blockType:gallery` is a missing
matrix entry type, `field:changeList.listItems` a missing (or differently
handled) field in that entry type's layout.

Or in PowerShell without Node (`curl` there is `Invoke-WebRequest`):

```powershell
Invoke-RestMethod https://ccrm.softwaresolutions.sk/ccrm-news/ping -Headers @{ 'X-CCRM-News-Token' = '<token>' } -SkipHttpErrorCheck
```

| Answer | Meaning |
|---|---|
| JSON with `"success": true` | Installed and authorised |
| `{"success":false,"error":"unauthorized"}` | Token missing, shorter than 32, or different from the server's |
| HTML 404 page | Module not bootstrapped — check `config/app.php` and the module id |
| HTML 500 / "Class not found" | Files not in `modules/ccrmnews/`, or autoload — `composer dump-autoload` |

## 6. First publish

Keep `RELEASE_NOTES_PUBLISH=draft` for the first articles. The entry is saved
disabled: open it in the CP, check all three sites and the images, then enable
it. The module was written against the Craft 5 API but has not run on this
install before — if a save fails, the error comes back in the publish output
(`entry_not_saved` / `site_not_saved` with Craft's validation messages).
