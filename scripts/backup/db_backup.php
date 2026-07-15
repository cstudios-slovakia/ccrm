<?php
/**
 * Daily database backup for CCRM.
 *
 * Run from the app docroot so config.php resolves (this is how cron invokes it):
 *   php scripts/backup/db_backup.php
 *
 * Writes ~/db_backups/ccrm_auto_<ts>.sql.gz and prunes auto backups older than
 * CCRM_BACKUP_KEEP_DAYS (default 14). It NEVER deletes manually-named
 * ccrm_full_* dumps (long-term restore points).
 *
 * Env overrides: CCRM_BACKUP_DIR, CCRM_BACKUP_KEEP_DAYS.
 *
 * Added after the 2026-07-06 data-loss incident: before this, no automated
 * backup existed and recovery relied on a one-off manual dump.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("CLI only\n");
}

$configPath = getcwd() . '/config.php';
if (!file_exists($configPath)) {
    $configPath = dirname(__DIR__, 2) . '/config.php';
}
if (!file_exists($configPath)) {
    fwrite(STDERR, "config.php not found - run from the app docroot\n");
    exit(1);
}
require $configPath;

foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $c) {
    if (!defined($c)) {
        fwrite(STDERR, "config.php missing {$c}\n");
        exit(1);
    }
}

$destDir  = getenv('CCRM_BACKUP_DIR') ?: ((getenv('HOME') ?: sys_get_temp_dir()) . '/db_backups');
$keepDays = (int) (getenv('CCRM_BACKUP_KEEP_DAYS') ?: 14);
if (!is_dir($destDir) && !mkdir($destDir, 0700, true) && !is_dir($destDir)) {
    fwrite(STDERR, "cannot create backup dir {$destDir}\n");
    exit(1);
}

$ts      = date('Ymd_His');
$outFile = "{$destDir}/ccrm_auto_{$ts}.sql.gz";

// Pass credentials via a 0600 defaults-file so the password never appears in
// the process list (ps) or shell history.
$cnf = tempnam(sys_get_temp_dir(), 'ccrmdump');
chmod($cnf, 0600);
file_put_contents(
    $cnf,
    "[mysqldump]\n"
    . "host=" . DB_HOST . "\n"
    . "port=" . DB_PORT . "\n"
    . "user=" . DB_USER . "\n"
    . "password=" . DB_PASS . "\n"
);
$errFile = $cnf . '.err';

$cmd = 'mysqldump --defaults-extra-file=' . escapeshellarg($cnf)
     . ' --single-transaction --routines --triggers --no-tablespaces '
     . escapeshellarg(DB_NAME)
     . ' 2>' . escapeshellarg($errFile)
     . ' | gzip > ' . escapeshellarg($outFile);
exec($cmd, $out, $rc);

$err = @file_get_contents($errFile);
@unlink($cnf);
@unlink($errFile);

clearstatcache();
$size = file_exists($outFile) ? filesize($outFile) : 0;
if ($rc !== 0 || $size < 1000) {
    fwrite(STDERR, date('c') . " BACKUP FAILED (rc={$rc}, size={$size}): " . trim((string) $err) . "\n");
    @unlink($outFile);
    exit(1);
}

// Prune old AUTO backups only; leave manual ccrm_full_* restore points alone.
$cutoff = time() - $keepDays * 86400;
$pruned = 0;
foreach (glob("{$destDir}/ccrm_auto_*.sql.gz") ?: [] as $f) {
    if (filemtime($f) < $cutoff) {
        @unlink($f);
        $pruned++;
    }
}

echo date('c') . " OK {$outFile} (" . round($size / 1024) . " KB), pruned {$pruned} old\n";
