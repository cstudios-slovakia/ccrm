<?php
/**
 * Shared Task Files Library (metadata, private storage, and dev-safe validation).
 *
 * Files uploaded to tasks live inside a private `.htaccess`-denied folder
 * (`uploads/_task_files/`) under opaque randomized `.bin` filenames and stream only
 * through authenticated `api/task_files.php?action=download&id=...` with task-scope
 * checks and `X-Content-Type-Options: nosniff` + `CSP: sandbox`.
 *
 * All functions use `function_exists()` guards so `schema.php` fingerprint checks
 * and dual-path includes (`public/api/` vs `api/`) never fail.
 */

if (!function_exists('ccrm_migrate_task_files')) {
    function ccrm_migrate_task_files(PDO $pdo): void {
        try {
            if (!ccrm_table_exists($pdo, 'task_files')) {
                $pdo->exec(
                    "CREATE TABLE IF NOT EXISTS `task_files` (
                      `id` VARCHAR(64) NOT NULL PRIMARY KEY,
                      `task_id` VARCHAR(50) NOT NULL,
                      `file_name` VARCHAR(255) NOT NULL,
                      `mime_type` VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
                      `size_bytes` INT UNSIGNED NOT NULL DEFAULT 0,
                      `storage_name` VARCHAR(160) NOT NULL,
                      `is_image` TINYINT(1) NOT NULL DEFAULT 0,
                      `image_width` INT UNSIGNED NULL,
                      `image_height` INT UNSIGNED NULL,
                      `uploaded_by` VARCHAR(100) NOT NULL DEFAULT '',
                      `deleted_at` DATETIME NULL,
                      `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                      INDEX `idx_tf_task_active` (`task_id`, `deleted_at`, `created_at`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
            }
            if (ccrm_table_exists($pdo, 'tasks') && !ccrm_column_exists($pdo, 'tasks', 'file_count')) {
                $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `file_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `comment_count`");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] task_files migration skipped: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_task_files_private_dir')) {
    function ccrm_task_files_private_dir(): string {
        $base = function_exists('ccrm_uploads_dir')
            ? ccrm_uploads_dir()
            : dirname(__DIR__, 2) . '/uploads/';
        $dir = rtrim($base, "/\\") . '/_task_files/';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $htaccess = $dir . '.htaccess';
        if (!is_file($htaccess)) {
            @file_put_contents(
                $htaccess,
                "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
            );
        }
        return $dir;
    }
}

if (!function_exists('ccrm_task_files_private_path')) {
    function ccrm_task_files_private_path(string $storageName): ?string {
        $name = basename(trim($storageName));
        if (!preg_match('/^tf_[a-f0-9]{24}\.bin$/', $name)) {
            return null;
        }
        $path = ccrm_task_files_private_dir() . $name;
        return is_file($path) ? $path : null;
    }
}

if (!function_exists('ccrm_task_file_validate_name')) {
    /**
     * Validate & sanitize a task upload filename.
     * Supports documents, images, media, archives, and all development/source-code files
     * (including extensionless files like `Dockerfile`, `Makefile`, `.env.example`), while
     * blocking OS binary executables.
     */
    function ccrm_task_file_validate_name(string $rawName): ?string {
        $clean = str_replace(["\0", "\r", "\n"], '', trim($rawName));
        $clean = basename(str_replace('\\', '/', $clean));
        $clean = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', $clean));
        if ($clean === '' || $clean === '.' || $clean === '..' || strpos($clean, '..') !== false) {
            return null;
        }
        $clean = mb_substr($clean, 0, 200);

        $blockedExts = [
            'exe', 'msi', 'dll', 'sys', 'drv', 'cpl', 'ocx', 'scr', 'pif',
            'com', 'bat', 'cmd', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'jar',
            'apk', 'ipa', 'dmg', 'pkg', 'appimage', 'deb', 'rpm',
        ];
        $parts = explode('.', strtolower($clean));
        // Inspect non-leading segments so dotfiles like `.env.example` or `.gitignore` work,
        // while `payload.exe.txt` or `setup.exe` is rejected.
        $checkParts = $clean[0] === '.' ? array_slice($parts, 2) : (count($parts) > 1 ? array_slice($parts, 1) : []);
        foreach ($checkParts as $seg) {
            if (in_array($seg, $blockedExts, true)) {
                return null;
            }
        }
        return $clean;
    }
}

if (!function_exists('ccrm_task_file_guess_language')) {
    function ccrm_task_file_guess_language(string $fileName): string {
        $lower = strtolower($fileName);
        if ($lower === 'dockerfile' || str_starts_with($lower, 'dockerfile.')) return 'dockerfile';
        if ($lower === 'makefile') return 'makefile';
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $map = [
            'ts' => 'typescript', 'tsx' => 'tsx', 'js' => 'javascript', 'jsx' => 'jsx',
            'mjs' => 'javascript', 'cjs' => 'javascript', 'php' => 'php', 'py' => 'python',
            'sql' => 'sql', 'json' => 'json', 'yaml' => 'yaml', 'yml' => 'yaml',
            'md' => 'markdown', 'markdown' => 'markdown', 'sh' => 'bash', 'bash' => 'bash',
            'zsh' => 'bash', 'css' => 'css', 'scss' => 'scss', 'less' => 'less',
            'html' => 'html', 'htm' => 'html', 'xml' => 'xml', 'svg' => 'svg',
            'go' => 'go', 'rs' => 'rust', 'java' => 'java', 'kt' => 'kotlin',
            'swift' => 'swift', 'c' => 'c', 'h' => 'c', 'cpp' => 'cpp', 'hpp' => 'cpp',
            'cs' => 'csharp', 'rb' => 'ruby', 'vue' => 'vue', 'svelte' => 'svelte',
            'toml' => 'toml', 'ini' => 'ini', 'conf' => 'conf', 'env' => 'dotenv',
            'diff' => 'diff', 'patch' => 'diff', 'log' => 'log', 'csv' => 'csv',
            'txt' => 'text', 'graphql' => 'graphql', 'gql' => 'graphql', 'prisma' => 'prisma',
            'tf' => 'hcl', 'gitignore' => 'text', 'htaccess' => 'apacheconf',
        ];
        return $map[$ext] ?? 'text';
    }
}

if (!function_exists('ccrm_task_file_is_code_or_text')) {
    function ccrm_task_file_is_code_or_text(string $fileName, string $mime = ''): bool {
        $lower = strtolower($fileName);
        if (in_array($lower, ['dockerfile', 'makefile', 'readme', 'license', '.gitignore', '.gitattributes', '.htaccess', '.env', '.editorconfig', '.npmrc'], true)
            || str_starts_with($lower, '.env.')
            || str_starts_with($lower, 'dockerfile.')) {
            return true;
        }
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $codeExts = [
            'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'php', 'phtml', 'py', 'rb', 'go', 'rs',
            'java', 'kt', 'kts', 'swift', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'vue', 'svelte',
            'astro', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'sql', 'json', 'jsonc',
            'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'xml', 'svg', 'md', 'markdown',
            'txt', 'log', 'csv', 'tsv', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'diff', 'patch',
            'graphql', 'gql', 'prisma', 'tf', 'tfvars', 'lock', 'properties', 'gradle',
        ];
        if (in_array($ext, $codeExts, true)) {
            return true;
        }
        return str_starts_with(strtolower($mime), 'text/')
            || in_array(strtolower($mime), ['application/json', 'application/xml', 'application/javascript'], true);
    }
}

if (!function_exists('ccrm_task_file_to_json')) {
    function ccrm_task_file_to_json(array $row): array {
        $id = (string)$row['id'];
        $fileName = (string)$row['file_name'];
        $mime = (string)($row['mime_type'] ?? 'application/octet-stream');
        $url = 'api/task_files.php?action=download&id=' . rawurlencode($id);
        return [
            'id' => $id,
            'taskId' => (string)$row['task_id'],
            'fileName' => $fileName,
            'mimeType' => $mime,
            'sizeBytes' => (int)($row['size_bytes'] ?? 0),
            'isImage' => !empty($row['is_image']),
            'imageWidth' => isset($row['image_width']) && $row['image_width'] !== null ? (int)$row['image_width'] : null,
            'imageHeight' => isset($row['image_height']) && $row['image_height'] !== null ? (int)$row['image_height'] : null,
            'isCodePreviewable' => ccrm_task_file_is_code_or_text($fileName, $mime),
            'language' => ccrm_task_file_guess_language($fileName),
            'uploadedBy' => (string)($row['uploaded_by'] ?? ''),
            'createdAt' => (string)($row['created_at'] ?? ''),
            'url' => $url,
            'downloadUrl' => $url . '&download=1',
        ];
    }
}

if (!function_exists('ccrm_delete_task_files')) {
    function ccrm_delete_task_files(PDO $pdo, string $taskId): void {
        try {
            if (!ccrm_table_exists($pdo, 'task_files')) return;
            $sel = $pdo->prepare("SELECT `storage_name` FROM `task_files` WHERE `task_id` = ?");
            $sel->execute([$taskId]);
            foreach ($sel->fetchAll(PDO::FETCH_COLUMN) ?: [] as $storageName) {
                $path = ccrm_task_files_private_path((string)$storageName);
                if ($path !== null) {
                    @unlink($path);
                }
            }
            $pdo->prepare("DELETE FROM `task_files` WHERE `task_id` = ?")->execute([$taskId]);
        } catch (\Throwable $e) {
            error_log('[ccrm task_files] cleanup skipped: ' . $e->getMessage());
        }
    }
}
