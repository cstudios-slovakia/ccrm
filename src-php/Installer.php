<?php
namespace CCRM;

class Installer {
    /**
     * Recursively copies a directory to another directory.
     */
    public static function copyDir($src, $dst) {
        if (!is_dir($src)) {
            return false;
        }
        if (!is_dir($dst)) {
            if (!mkdir($dst, 0755, true)) {
                return false;
            }
        }
        $dir = opendir($src);
        while (false !== ($file = readdir($dir))) {
            if (($file != '.') && ($file != '..')) {
                if (is_dir($src . '/' . $file)) {
                    self::copyDir($src . '/' . $file, $dst . '/' . $file);
                } else {
                    copy($src . '/' . $file, $dst . '/' . $file);
                }
            }
        }
        closedir($dir);
        return true;
    }

    /**
     * Copies compiled assets from vendor distribution folder to public parent directory.
     */
    public static function publishAssets() {
        $packageDist = dirname(__DIR__) . '/dist';
        
        // Detect if we are in composer vendor context
        if (strpos(__DIR__, 'vendor/cstudios-slovakia/ccrm') !== false || strpos(__DIR__, 'vendor' . DIRECTORY_SEPARATOR . 'cstudios-slovakia') !== false) {
            $projectRoot = dirname(dirname(dirname(dirname(__DIR__))));
        } else {
            // Local development mode: source and destination are the same, do nothing to prevent self-copy/infinite recursion
            return true;
        }
        
        if (is_dir($packageDist)) {
            self::copyDir($packageDist, $projectRoot);
            return true;
        }
        return false;
    }
}
