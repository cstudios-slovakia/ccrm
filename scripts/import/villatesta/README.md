# Villatesta importer

Moves the old Yii CRM (`vcrm_db`) into a CCRM instance. Plan, decisions and status:
`Claude outputs/villatesta-migration/PLAN.md` (sections B and C).

```
extract.php   old DB (read-only)  ->  out/*.json        runs where the old DB is
load.php      out/*.json          ->  CCRM database     runs where config.php is
reconcile.php old counts vs new counts, orphans, samples
seed_config.php  the instance configuration of PLAN section B (used by load.php)
```

`out/` holds customer data and is gitignored.

## Run it (dev container)

The scripts are not mounted into the `crm` container, so copy them in. Use a scratch
database for rehearsals, never the dev `ccrm` database:

```bash
export MSYS_NO_PATHCONV=1                       # Git Bash on Windows
docker exec ccrm-db-1 mysql -uroot -pccrm_root_password -e "CREATE DATABASE ccrm_vt_rehearsal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON ccrm_vt_rehearsal.* TO 'ccrm_user'@'%'"
docker exec crm sh -c "sed \"s/'DB_NAME', 'ccrm'/'DB_NAME', 'ccrm_vt_rehearsal'/\" /var/www/html/config.php > /tmp/config.rehearsal.php"
docker cp scripts/import/villatesta crm:/tmp/vt

docker exec crm php -d memory_limit=2G /tmp/vt/extract.php --host=host.docker.internal --out=/tmp/vt/out
docker exec crm php -d memory_limit=2G /tmp/vt/load.php --config=/tmp/config.rehearsal.php --api-dir=/var/www/html/api --data=/tmp/vt/out --reset
docker exec crm php -d memory_limit=2G /tmp/vt/reconcile.php --config=/tmp/config.rehearsal.php --api-dir=/var/www/html/api --data=/tmp/vt/out --host=host.docker.internal
docker cp crm:/tmp/vt/out/. scripts/import/villatesta/out/        # keep the output and the reports
```

About 25 s for extract, 20 s for load.

## On the hosting (D4)

Upload this folder and `out/`, then from the app root:

```bash
php scripts/import/villatesta/load.php --data=scripts/import/villatesta/out --dry-run     # prints what it would do
php scripts/import/villatesta/load.php --data=scripts/import/villatesta/out --uploads-src=/path/to/storage/uploads
php scripts/import/villatesta/reconcile.php --data=scripts/import/villatesta/out
```

`--dry-run` runs every step inside a rolled-back transaction and does not touch the schema (apply it
first with a normal run or `php ccrm update`). `--only=config,users,clients,leads,projects,mail,products,files,leftovers`
runs single steps, in that order. `--reset` removes what earlier runs created (ids `*-vt-*`): rehearsals only.

## Rules the importer follows

- Ids are deterministic (`client-vt-<org>`, `lead-vt-<prelead>`, `proj-vt-<zakazka>`, `te-vt-...`, `whi-vt-<MRP>`),
  so a second run updates instead of duplicating. Mail uses the app's own `email-...` ids (checked against
  `ccrm_mail_event_id()` on every run), so live IMAP reading and the background filing never file a message twice.
- Users keep their old bcrypt hashes; an existing user (same e-mail) keeps their password unless `--overwrite-passwords`.
- Owners and project managers are exact `users.name` values; the run aborts on a stranger.
- Settings are merged: a list gets the entries it lacks and keeps what an admin added. A list that still holds the
  installer's default seed is replaced.
- A customer record whose contact address belongs to a company domain gets no e-mail and none of the filed mail
  (the old CRM matched mail by address, so 3 such records held 91 % of all mail). Listed in `extract-report.md`.
- Nothing is skipped silently: every skipped row has a reason in the reports.
