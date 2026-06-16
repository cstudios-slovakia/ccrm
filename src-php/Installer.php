<?php
namespace CCRM;

class Installer {
    /**
     * Recursively copy a directory.
     *
     * @param string   $src              source directory
     * @param string   $dst              destination directory
     * @param string[] $preserveExisting basenames that must NOT be overwritten
     *                                    when they already exist at $dst
     *                                    (e.g. an operator's real config.php).
     */
    public static function copyDir($src, $dst, array $preserveExisting = []) {
        if (!is_dir($src)) {
            return false;
        }
        if (!is_dir($dst)) {
            if (!mkdir($dst, 0755, true) && !is_dir($dst)) {
                return false;
            }
        }
        $dir = opendir($src);
        while (false !== ($file = readdir($dir))) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $srcPath = $src . '/' . $file;
            $dstPath = $dst . '/' . $file;
            if (is_dir($srcPath)) {
                self::copyDir($srcPath, $dstPath, $preserveExisting);
            } else {
                // Never clobber files the operator owns (credentials, secrets).
                if (in_array($file, $preserveExisting, true) && file_exists($dstPath)) {
                    continue;
                }
                copy($srcPath, $dstPath);
            }
        }
        closedir($dir);
        return true;
    }

    /** Absolute path to the installed package root (the folder that holds dist/). */
    private static function packageRoot() {
        // __DIR__ is <package>/src-php
        return dirname(__DIR__);
    }

    /** True when running from inside a consumer project's vendor/ directory. */
    private static function isVendorContext() {
        $here = str_replace('\\', '/', __DIR__);
        return strpos($here, 'vendor/cstudios-slovakia') !== false;
    }

    /** Consumer project root (the directory that contains vendor/), or null in local dev. */
    private static function projectRoot() {
        if (!self::isVendorContext()) {
            return null;
        }
        // vendor/cstudios-slovakia/ccrm/src-php -> up 4 levels = project root
        return dirname(__DIR__, 4);
    }

    /**
     * Resolve the public web document root to publish into.
     *
     * Resolution order:
     *   1. CCRM_INSTALL_DIR environment variable (absolute path).
     *   2. `extra.ccrm-install-dir` in the project's composer.json (relative to
     *      the project root; created if missing). Use this for non-standard
     *      layouts, e.g. publishing into a subfolder ("web/crm").
     *   3. Auto-detection of a conventional docroot folder under the project.
     *   4. The project root itself (last resort).
     */
    private static function webRoot($projectRoot) {
        $env = getenv('CCRM_INSTALL_DIR');
        if ($env && is_dir($env)) {
            return rtrim($env, '/\\');
        }

        $composerJson = $projectRoot . '/composer.json';
        if (is_file($composerJson)) {
            $cfg = json_decode((string)file_get_contents($composerJson), true);
            $rel = isset($cfg['extra']['ccrm-install-dir']) ? $cfg['extra']['ccrm-install-dir'] : null;
            if (is_string($rel) && $rel !== '') {
                $dir = $projectRoot . '/' . ltrim($rel, '/\\');
                if (!is_dir($dir)) {
                    @mkdir($dir, 0755, true);
                }
                if (is_dir($dir)) {
                    return $dir;
                }
            }
        }

        foreach (['web', 'public', 'public_html', 'httpdocs', 'htdocs', 'www'] as $candidate) {
            if (is_dir($projectRoot . '/' . $candidate)) {
                return $projectRoot . '/' . $candidate;
            }
        }

        return $projectRoot;
    }

    /**
     * Publish the compiled frontend + PHP API into the project's web document
     * root (NOT the project root). The operator's config.php is never
     * overwritten, so real database credentials survive `composer update`.
     */
    public static function publishAssets() {
        $projectRoot = self::projectRoot();
        if ($projectRoot === null) {
            // Local development: source and destination are the same tree.
            return true;
        }

        $packageDist = self::packageRoot() . '/dist';
        if (!is_dir($packageDist)) {
            return false;
        }

        $target = self::webRoot($projectRoot);
        return self::copyDir($packageDist, $target, ['config.php']);
    }

    /**
     * Connect using the published config.php and apply the shared schema.
     */
    public static function migrateDatabase() {
        $projectRoot = self::projectRoot();
        $webRoot = $projectRoot !== null
            ? self::webRoot($projectRoot)
            : self::packageRoot() . '/public';

        $configFile = $webRoot . '/config.php';
        if (!file_exists($configFile)) {
            // Not installed yet — the wizard writes config.php on first run.
            return false;
        }

        require_once $configFile;
        if (!function_exists('get_db_connection')) {
            return false;
        }

        // Single source of truth for DDL + migrations (shipped in dist/).
        $schemaFile = self::packageRoot() . '/dist/api/schema.php';
        if (!is_file($schemaFile)) {
            $schemaFile = self::packageRoot() . '/public/api/schema.php';
        }
        if (!is_file($schemaFile)) {
            return false;
        }
        require_once $schemaFile;

        try {
            $pdo = get_db_connection();
            ccrm_apply_schema($pdo);
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
}
