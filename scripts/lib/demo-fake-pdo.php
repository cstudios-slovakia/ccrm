<?php
/**
 * A recording fake PDO for the demo-seed dry run. Plain `php`: no database, no PDO
 * driver, no Docker.
 *
 * DemoFakePdo extends PDO WITHOUT calling its constructor and overrides everything the
 * seed code uses, so `function (PDO $pdo)` signatures accept it. It keeps every row in
 * memory per table and interprets the SQL subset the demo modules need:
 *
 *   INSERT [IGNORE] / REPLACE INTO t [(cols)] VALUES (...)[, (...)] [ON DUPLICATE KEY UPDATE a = VALUES(a), b = ?]
 *   UPDATE t SET a = ?, b = NULL WHERE ...        DELETE FROM t [WHERE ...]
 *   SELECT cols|*|COUNT(*)|COUNT(c)|MAX(c)|MIN(c)|SUM(c)|DATABASE() FROM t [WHERE ...] [ORDER BY c [DESC]] [LIMIT n]
 *   SELECT ... FROM information_schema.TABLES / COLUMNS      SHOW TABLES LIKE 'x'      SHOW COLUMNS FROM t LIKE 'c'
 *   CREATE TABLE / ALTER TABLE ... ADD COLUMN / DROP TABLE / TRUNCATE   (DDL commits an open transaction, like MySQL)
 *   SET ..., START TRANSACTION, anything else harmless is accepted and ignored
 *   WHERE: = != <> < > <= >= LIKE IN (...) IS [NOT] NULL, AND / OR / parentheses; values: ? :name 'str' 123 NULL NOW() DATABASE()
 *
 * The catalogue is read from the REAL schema: ccrm_schema_statements() in api/schema.php
 * plus every `ADD COLUMN` found in api/*.php. So a write is checked the way strict MySQL
 * checks it: unknown table (42S02), unknown column (42S22 - the production 500 of the
 * 4-place rule), NOT NULL without a value (1364), explicit NULL in a NOT NULL column
 * (1048), a string longer than VARCHAR(n) (22001), a value outside an ENUM, a duplicate
 * PRIMARY KEY / UNIQUE value (23000). Foreign keys are not enforced; the harness checks
 * links separately.
 *
 * An UPDATE/DELETE/INSERT it cannot interpret THROWS (a silent no-op would hide a bug).
 * A SELECT it cannot interpret returns no rows and is listed in ->warnings(), as C9 says.
 * Set DEMO_FAKE_LENIENT=1 to turn unknown-column errors into warnings while you trace
 * a schema gap (never commit with it).
 */

if (!class_exists('DemoFakeException')) {

    /** A PDOException with an SQLSTATE and a driver code, like pdo_mysql throws. */
    class DemoFakeException extends PDOException {
        public function __construct(string $message, string $sqlState = 'HY000', int $driverCode = 0) {
            parent::__construct($message);
            $this->code = $sqlState;
            $this->errorInfo = [$sqlState, $driverCode, $message];
        }
    }

    /** The fake cannot interpret this statement. */
    class DemoFakeUnsupported extends DemoFakeException {
        public function __construct(string $message) {
            parent::__construct('demo-fake-pdo: ' . $message, 'HY000', 0);
        }
    }

    class DemoFakeStmt extends PDOStatement {
        /** @var DemoFakePdo */
        private $pdo;
        private string $sql;
        /** @var array<int,array<string,mixed>> */
        private array $result = [];
        private int $cursor = 0;
        private int $affected = 0;
        private array $bound = [];
        private int $fetchMode = PDO::FETCH_ASSOC;

        public function __construct(DemoFakePdo $pdo, string $sql) {
            $this->pdo = $pdo;
            $this->sql = $sql;
        }

        public function execute(?array $params = null): bool {
            $params = $params ?? $this->bound;
            [$this->result, $this->affected] = $this->pdo->fakeRun($this->sql, $params);
            $this->cursor = 0;
            return true;
        }

        public function bindValue(string|int $param, mixed $value, int $type = PDO::PARAM_STR): bool {
            // bindValue() positions are 1-based, execute([...]) lists are 0-based.
            $this->bound[is_int($param) ? $param - 1 : $param] = $value;
            return true;
        }

        public function bindParam(string|int $param, mixed &$var, int $type = PDO::PARAM_STR, int $maxLength = 0, mixed $driverOptions = null): bool {
            $this->bound[is_int($param) ? $param - 1 : $param] = $var;
            return true;
        }

        public function setFetchMode(int $mode, mixed ...$args): bool {
            $this->fetchMode = $mode;
            return true;
        }

        private function shape(array $row, int $mode) {
            switch ($mode) {
                case PDO::FETCH_NUM:
                    return array_values($row);
                case PDO::FETCH_BOTH:
                    return $row + array_values($row);
                case PDO::FETCH_OBJ:
                    return (object)$row;
                default:
                    return $row;
            }
        }

        public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed {
            if ($this->cursor >= count($this->result)) {
                return false;
            }
            $mode = $mode === PDO::FETCH_DEFAULT ? $this->fetchMode : $mode;
            return $this->shape($this->result[$this->cursor++], $mode);
        }

        public function fetchColumn(int $column = 0): mixed {
            if ($this->cursor >= count($this->result)) {
                return false;
            }
            $values = array_values($this->result[$this->cursor++]);
            return array_key_exists($column, $values) ? $values[$column] : false;
        }

        public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
            $mode = $mode === PDO::FETCH_DEFAULT ? $this->fetchMode : $mode;
            $rows = array_slice($this->result, $this->cursor);
            $this->cursor = count($this->result);
            if ($mode === PDO::FETCH_COLUMN) {
                $col = (int)($args[0] ?? 0);
                return array_map(static function (array $r) use ($col) {
                    $v = array_values($r);
                    return $v[$col] ?? null;
                }, $rows);
            }
            if ($mode === PDO::FETCH_KEY_PAIR) {
                $out = [];
                foreach ($rows as $r) {
                    $v = array_values($r);
                    $out[$v[0]] = $v[1] ?? null;
                }
                return $out;
            }
            return array_map(fn(array $r) => $this->shape($r, $mode), $rows);
        }

        public function rowCount(): int {
            return $this->affected;
        }

        public function columnCount(): int {
            return $this->result ? count($this->result[0]) : 0;
        }

        public function closeCursor(): bool {
            $this->cursor = count($this->result);
            return true;
        }

        public function getIterator(): Iterator {
            return new ArrayIterator(array_map(fn(array $r) => $this->shape($r, $this->fetchMode), $this->result));
        }
    }

    class DemoFakePdo extends PDO {
        public const DB = 'ccrm_fake';

        /** @var array<string,array> table => catalogue entry */
        private array $catalogue = [];
        /** @var array<string,array<int,array<string,mixed>>> */
        private array $rows = [];
        /** @var array<string,int> inserts executed per table (updates and deletes do not change it) */
        private array $inserts = [];
        private array $autoInc = [];
        private int $lastId = 0;
        private bool $tx = false;
        private ?array $snapshot = null;
        private array $warnings = [];
        private array $log = [];
        private array $allowColumns = [];
        private bool $lenient;

        /** The real schema is loaded once per process; each fake clones it. */
        private static ?array $schemaCache = null;

        public function __construct() {
            // Deliberately NOT calling parent::__construct(): there is no driver and no DSN.
            $this->lenient = getenv('DEMO_FAKE_LENIENT') === '1';
            $this->catalogue = self::loadSchema();
            $this->insertRowRaw('system_settings', ['key' => 'DEMO_MODE', 'value' => 'true']);
        }

        /* ------------------------------------------------------------------ */
        /* Public inspection API (for tests)                                   */
        /* ------------------------------------------------------------------ */

        /** Current rows of a table (after every insert/update/delete of the run). */
        public function rows(string $table): array {
            return $this->rows[$table] ?? [];
        }

        /** Tables that currently hold at least one row. */
        public function tablesWithRows(): array {
            return array_keys(array_filter($this->rows, static fn(array $r): bool => count($r) > 0));
        }

        /** How many INSERTs (rows) were executed on a table - not reduced by later deletes. */
        public function insertCount(string $table): int {
            return $this->inserts[$table] ?? 0;
        }

        public function insertCounts(): array {
            return $this->inserts;
        }

        public function warnings(): array {
            return array_values(array_unique($this->warnings));
        }

        /** Every statement executed, in order. */
        public function log(): array {
            return $this->log;
        }

        public function hasTable(string $table): bool {
            return isset($this->catalogue[$table]);
        }

        public function columns(string $table): array {
            return array_keys($this->catalogue[$table]['cols'] ?? []);
        }

        /** system_settings as key => value. */
        public function settings(): array {
            $out = [];
            foreach ($this->rows('system_settings') as $r) {
                $out[(string)$r['key']] = (string)$r['value'];
            }
            return $out;
        }

        public function setSetting(string $key, string $value): void {
            foreach ($this->rows['system_settings'] as &$r) {
                if ($r['key'] === $key) {
                    $r['value'] = $value;
                    return;
                }
            }
            unset($r);
            $this->insertRowRaw('system_settings', ['key' => $key, 'value' => $value]);
        }

        /** Tolerate a column the schema scan cannot see (e.g. one added by dynamic SQL). */
        public function allowColumn(string $table, string $column): void {
            $this->allowColumns[$table][$column] = true;
        }

        /** Insert without any SQL (test fixtures: a non-demo row that must survive). */
        public function seedRow(string $table, array $row): void {
            $this->insertRowRaw($table, $row);
        }

        /* ------------------------------------------------------------------ */
        /* PDO surface                                                         */
        /* ------------------------------------------------------------------ */

        public function prepare(string $query, array $options = []): PDOStatement|false {
            return new DemoFakeStmt($this, $query);
        }

        public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
            $stmt = new DemoFakeStmt($this, $query);
            $stmt->execute([]);
            return $stmt;
        }

        public function exec(string $statement): int|false {
            [, $affected] = $this->fakeRun($statement, []);
            return $affected;
        }

        public function quote(string $string, int $type = PDO::PARAM_STR): string|false {
            return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $string) . "'";
        }

        public function beginTransaction(): bool {
            if ($this->tx) {
                throw new DemoFakeException('There is already an active transaction', 'HY000', 0);
            }
            $this->tx = true;
            $this->snapshot = ['rows' => $this->rows, 'inserts' => $this->inserts, 'auto' => $this->autoInc];
            return true;
        }

        public function inTransaction(): bool {
            return $this->tx;
        }

        public function commit(): bool {
            if (!$this->tx) {
                throw new DemoFakeException('There is no active transaction', 'HY000', 0);
            }
            $this->tx = false;
            $this->snapshot = null;
            return true;
        }

        public function rollBack(): bool {
            if (!$this->tx) {
                throw new DemoFakeException('There is no active transaction', 'HY000', 0);
            }
            $this->rows = $this->snapshot['rows'];
            $this->inserts = $this->snapshot['inserts'];
            $this->autoInc = $this->snapshot['auto'];
            $this->tx = false;
            $this->snapshot = null;
            return true;
        }

        public function lastInsertId(?string $name = null): string|false {
            return (string)$this->lastId;
        }

        public function setAttribute(int $attribute, mixed $value): bool {
            return true;
        }

        public function getAttribute(int $attribute): mixed {
            if ($attribute === PDO::ATTR_DRIVER_NAME) {
                return 'mysql';
            }
            if ($attribute === PDO::ATTR_SERVER_VERSION) {
                return '8.0.0-fake';
            }
            return null;
        }

        public function errorCode(): ?string {
            return '00000';
        }

        public function errorInfo(): array {
            return ['00000', null, null];
        }

        /* ------------------------------------------------------------------ */
        /* Schema catalogue                                                    */
        /* ------------------------------------------------------------------ */

        private static function loadSchema(): array {
            if (self::$schemaCache !== null) {
                return self::$schemaCache;
            }
            $apiDir = dirname(__DIR__, 2) . '/public/api';
            require_once $apiDir . '/schema.php';
            $catalogue = [];
            foreach (ccrm_schema_statements() as $sql) {
                if (preg_match('/^\s*CREATE\s+TABLE/i', $sql)) {
                    self::parseCreateTable($catalogue, $sql);
                }
            }
            // Columns added by migrations: every `ALTER TABLE `t` ADD COLUMN `c` ...` in api/*.php.
            foreach (glob($apiDir . '/*.php') ?: [] as $file) {
                $src = (string)file_get_contents($file);
                if (stripos($src, 'ADD COLUMN') === false) {
                    continue;
                }
                if (preg_match_all('/ALTER\s+TABLE\s+`(\w+)`\s+((?:ADD|MODIFY|CHANGE)[^"\n;]*)/i', $src, $m, PREG_SET_ORDER)) {
                    foreach ($m as $alter) {
                        self::applyAddColumns($catalogue, $alter[1], $alter[2]);
                    }
                }
            }
            return self::$schemaCache = $catalogue;
        }

        /** Split a string on commas that are not inside parentheses or quotes. */
        private static function splitTopLevel(string $s): array {
            $parts = [];
            $depth = 0;
            $quote = null;
            $buf = '';
            $n = strlen($s);
            for ($i = 0; $i < $n; $i++) {
                $c = $s[$i];
                if ($quote !== null) {
                    $buf .= $c;
                    if ($c === '\\' && $i + 1 < $n) {
                        $buf .= $s[++$i];
                    } elseif ($c === $quote) {
                        $quote = null;
                    }
                    continue;
                }
                if ($c === "'" || $c === '"' || $c === '`') {
                    $quote = $c;
                    $buf .= $c;
                } elseif ($c === '(') {
                    $depth++;
                    $buf .= $c;
                } elseif ($c === ')') {
                    $depth--;
                    $buf .= $c;
                } elseif ($c === ',' && $depth === 0) {
                    $parts[] = trim($buf);
                    $buf = '';
                } else {
                    $buf .= $c;
                }
            }
            if (trim($buf) !== '') {
                $parts[] = trim($buf);
            }
            return $parts;
        }

        /** One column definition ("`name` VARCHAR(50) NOT NULL DEFAULT 'x' ...") -> [name, spec] or null. */
        private static function parseColumnDef(string $def): ?array {
            if (!preg_match('/^`(\w+)`\s+(.*)$/s', trim($def), $m)) {
                return null;
            }
            $name = $m[1];
            $rest = $m[2];
            if (!preg_match('/^([a-z]+)\s*(?:\(([^)]*)\))?/i', $rest, $t)) {
                return null;
            }
            $type = strtolower($t[1]);
            $arg = $t[2] ?? null;
            $flags = preg_replace("/COMMENT\s+'(?:[^'\\\\]|\\\\.|'')*'/i", '', substr($rest, strlen($t[0])));
            $spec = [
                'type' => $type,
                'len' => in_array($type, ['varchar', 'char'], true) && $arg !== null ? (int)$arg : null,
                'enum' => null,
                'notnull' => stripos($flags, 'NOT NULL') !== false,
                'auto' => stripos($flags, 'AUTO_INCREMENT') !== false,
                'hasDefault' => false,
                'default' => null,
                'pk' => stripos($flags, 'PRIMARY KEY') !== false,
                'unique' => (bool)preg_match('/\bUNIQUE\b/i', $flags),
            ];
            if ($type === 'enum' && $arg !== null) {
                preg_match_all("/'((?:[^'\\\\]|\\\\.|'')*)'/", $arg, $e);
                $spec['enum'] = array_map(static fn($v) => str_replace("''", "'", $v), $e[1]);
            }
            if (preg_match("/\bDEFAULT\s+('(?:[^'\\\\]|\\\\.|'')*'|[^\s,]+(?:\(\))?)/i", $flags, $d)) {
                $spec['hasDefault'] = true;
                $v = $d[1];
                if ($v[0] === "'") {
                    $v = str_replace("''", "'", substr($v, 1, -1));
                } elseif (strcasecmp($v, 'NULL') === 0) {
                    $v = null;
                } elseif (is_numeric($v)) {
                    $v = $v + 0;
                }
                $spec['default'] = $v;
            }
            return [$name, $spec];
        }

        private static function parseCreateTable(array &$catalogue, string $sql): void {
            if (!preg_match('/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\((.*)\)\s*(?:ENGINE|DEFAULT|COMMENT|CHARSET|COLLATE|AUTO_INCREMENT|ROW_FORMAT|;|$)/is', $sql, $m)) {
                return;
            }
            $table = $m[1];
            $entry = ['cols' => [], 'pk' => [], 'unique' => []];
            foreach (self::splitTopLevel($m[2]) as $part) {
                if (preg_match('/^(?:CONSTRAINT\s+`?\w+`?\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i', $part, $k)) {
                    $entry['pk'] = array_map(static fn($c) => trim($c, " `"), explode(',', $k[1]));
                    continue;
                }
                if (preg_match('/^(?:CONSTRAINT\s+`?\w+`?\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?(?:\s+`?\w+`?)?\s*\(([^)]*)\)/i', $part, $k)) {
                    $entry['unique'][] = array_map(static fn($c) => trim(preg_replace('/\(\d+\)/', '', $c), " `"), explode(',', $k[1]));
                    continue;
                }
                if (preg_match('/^(KEY|INDEX|FULLTEXT|SPATIAL|FOREIGN|CONSTRAINT|CHECK)\b/i', $part)) {
                    continue;
                }
                $col = self::parseColumnDef($part);
                if ($col) {
                    [$name, $spec] = $col;
                    $entry['cols'][$name] = $spec;
                    if ($spec['pk']) {
                        $entry['pk'] = [$name];
                    }
                    if ($spec['unique']) {
                        $entry['unique'][] = [$name];
                    }
                }
            }
            $catalogue[$table] = $entry;
        }

        /** Apply the `ADD COLUMN` pieces of an ALTER TABLE tail to the catalogue. */
        private static function applyAddColumns(array &$catalogue, string $table, string $tail): void {
            if (!isset($catalogue[$table])) {
                return;
            }
            foreach (self::splitTopLevel($tail) as $piece) {
                if (preg_match('/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(`\w+`.*)$/is', $piece, $m)
                    || preg_match('/^ADD\s+(?:IF\s+NOT\s+EXISTS\s+)?(`\w+`\s+(?:varchar|char|int|bigint|tinyint|smallint|decimal|text|longtext|mediumtext|datetime|date|timestamp|json|enum|double|float|time|blob|longblob)\b.*)$/is', $piece, $m)) {
                    $def = preg_replace('/\s+(AFTER|FIRST)\s+.*$/is', '', $m[1]);
                    $col = self::parseColumnDef($def);
                    if ($col && !isset($catalogue[$table]['cols'][$col[0]])) {
                        $catalogue[$table]['cols'][$col[0]] = $col[1];
                    }
                }
            }
        }

        /* ------------------------------------------------------------------ */
        /* Statement execution                                                 */
        /* ------------------------------------------------------------------ */

        /** @return array{0: array<int,array<string,mixed>>, 1: int} [result rows, affected] */
        public function fakeRun(string $sql, array $params): array {
            $noComments = preg_replace(['!/\*.*?\*/!s', '/^\s*--.*$/m'], ' ', $sql);
            // Collapse whitespace outside quotes only: a literal keeps its newlines and spaces.
            $clean = trim(preg_replace_callback(
                '/\'(?:[^\'\\\\]|\\\\.|\'\')*\'|"(?:[^"\\\\]|\\\\.|"")*"|`[^`]*`|\s+/',
                static fn(array $m): string => preg_match('/^\s+$/', $m[0]) ? ' ' : $m[0],
                $noComments
            ));
            $clean = rtrim($clean, "; \t");
            $this->log[] = $clean;
            if ($clean === '') {
                return [[], 0];
            }
            $verb = strtoupper(strtok($clean, ' '));
            switch ($verb) {
                case 'INSERT':
                case 'REPLACE':
                    return [[], $this->runInsert($clean, $params)];
                case 'UPDATE':
                    return [[], $this->runUpdate($clean, $params)];
                case 'DELETE':
                    return [[], $this->runDelete($clean, $params)];
                case 'SELECT':
                    return [$this->runSelect($clean, $params), 0];
                case 'SHOW':
                    return [$this->runShow($clean), 0];
                case 'CREATE':
                case 'ALTER':
                case 'DROP':
                case 'TRUNCATE':
                case 'RENAME':
                    $this->implicitCommit();
                    $this->runDdl($verb, $clean);
                    return [[], 0];
                case 'START':
                case 'BEGIN':
                case 'SET':
                case 'LOCK':
                case 'UNLOCK':
                case 'COMMIT':
                case 'USE':
                case 'ANALYZE':
                case 'OPTIMIZE':
                    return [[], 0];
                default:
                    $this->warnings[] = 'unhandled statement: ' . substr($clean, 0, 120);
                    return [[], 0];
            }
        }

        /** DDL commits an open transaction in MySQL; the runner's "DDL breaks atomicity" path depends on it. */
        private function implicitCommit(): void {
            if ($this->tx) {
                $this->tx = false;
                $this->snapshot = null;
            }
        }

        private function runDdl(string $verb, string $sql): void {
            if ($verb === 'CREATE') {
                if (preg_match('/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i', $sql, $m)) {
                    if (isset($this->catalogue[$m[1]])) {
                        if (stripos($sql, 'IF NOT EXISTS') === false) {
                            throw new DemoFakeException("Table '{$m[1]}' already exists", '42S01', 1050);
                        }
                        return;
                    }
                    self::parseCreateTable($this->catalogue, $sql);
                    $this->rows[$m[1]] = $this->rows[$m[1]] ?? [];
                }
                return;
            }
            if ($verb === 'DROP') {
                if (preg_match('/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(.+)$/i', $sql, $m)) {
                    foreach (explode(',', $m[1]) as $t) {
                        $t = trim($t, " `");
                        unset($this->catalogue[$t], $this->rows[$t], $this->autoInc[$t]);
                    }
                }
                return;
            }
            if ($verb === 'TRUNCATE') {
                if (preg_match('/^TRUNCATE\s+(?:TABLE\s+)?`?(\w+)`?/i', $sql, $m)) {
                    $this->rows[$m[1]] = [];
                    $this->autoInc[$m[1]] = 0;
                }
                return;
            }
            if ($verb === 'ALTER' && preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+(.*)$/i', $sql, $m)) {
                self::applyAddColumns($this->catalogue, $m[1], $m[2]);
            }
        }

        /* ---- tokenizer ---------------------------------------------------- */

        /** @return array<int,array{0:string,1:string}> [type, text]; types: id str num param op p w */
        private function tokenize(string $sql): array {
            $tokens = [];
            $re = '/\G\s*(?:(`[^`]*`)|(\'(?:[^\'\\\\]|\\\\.|\'\')*\')|("(?:[^"\\\\]|\\\\.|"")*")|(\?)|(:[A-Za-z_]\w*)|(<=>|<=|>=|<>|!=)|([=<>(),*;+\-\/.])|(\d+(?:\.\d+)?)|([A-Za-z_@][\w$]*))/A';
            $pos = 0;
            $len = strlen($sql);
            while ($pos < $len) {
                if (!preg_match($re, $sql, $m, 0, $pos)) {
                    if (trim(substr($sql, $pos)) === '') {
                        break;
                    }
                    throw new DemoFakeUnsupported('cannot tokenize near: ' . substr($sql, $pos, 40));
                }
                $pos += strlen($m[0]);
                if (($m[1] ?? '') !== '') {
                    $tokens[] = ['id', substr($m[1], 1, -1)];
                } elseif (($m[2] ?? '') !== '') {
                    $tokens[] = ['str', $this->unquote(substr($m[2], 1, -1))];
                } elseif (($m[3] ?? '') !== '') {
                    $tokens[] = ['str', $this->unquote(substr($m[3], 1, -1))];
                } elseif (($m[4] ?? '') !== '') {
                    $tokens[] = ['param', '?'];
                } elseif (($m[5] ?? '') !== '') {
                    $tokens[] = ['param', $m[5]];
                } elseif (($m[6] ?? '') !== '') {
                    $tokens[] = ['op', $m[6]];
                } elseif (($m[7] ?? '') !== '') {
                    $tokens[] = ['p', $m[7]];
                } elseif (($m[8] ?? '') !== '') {
                    $tokens[] = ['num', $m[8]];
                } else {
                    $tokens[] = ['w', $m[9]];
                }
            }
            return $tokens;
        }

        private function unquote(string $s): string {
            return preg_replace_callback('/\\\\(.)|\'\'|""/s', static function (array $m): string {
                if ($m[0] === "''") return "'";
                if ($m[0] === '""') return '"';
                $map = ['n' => "\n", 'r' => "\r", 't' => "\t", '0' => "\0", 'Z' => "\x1a"];
                return $map[$m[1]] ?? $m[1];
            }, $s);
        }

        /* ---- parser state helpers ----------------------------------------- */

        private function isWord(array $t, string $word): bool {
            return $t[0] === 'w' && strcasecmp($t[1], $word) === 0;
        }

        private function fail(string $what, string $sql): void {
            throw new DemoFakeUnsupported($what . ' - in: ' . substr($sql, 0, 160));
        }

        /** Next param value (positional `?` in order, or named `:x`). */
        private function takeParam(array $tok, array $params, int &$pIdx) {
            if ($tok[1] === '?') {
                if (!array_key_exists($pIdx, $params)) {
                    throw new DemoFakeException('Invalid parameter number: parameter was not defined', 'HY093', 0);
                }
                return $params[$pIdx++];
            }
            $name = $tok[1];
            if (array_key_exists($name, $params)) return $params[$name];
            if (array_key_exists(ltrim($name, ':'), $params)) return $params[ltrim($name, ':')];
            throw new DemoFakeException("Invalid parameter number: parameter {$name} was not defined", 'HY093', 0);
        }

        /**
         * Parse one scalar value at $i: ? :name 'str' 123 -123 NULL TRUE FALSE NOW() CURRENT_TIMESTAMP CURDATE() DATABASE() VALUES(col).
         * $valuesRow is the row being inserted, for VALUES(col) in ON DUPLICATE KEY UPDATE; $ctxRow is
         * the existing row, for COALESCE(?, `col`) style references in UPDATE / ON DUPLICATE KEY UPDATE.
         */
        private function parseValue(array $tokens, int &$i, array $params, int &$pIdx, string $sql, ?array $valuesRow = null, ?array $ctxRow = null) {
            $t = $tokens[$i] ?? null;
            if ($t === null) $this->fail('expected a value', $sql);
            if ($t[0] === 'param') { $i++; return $this->takeParam($t, $params, $pIdx); }
            if ($t[0] === 'str') { $i++; return $t[1]; }
            if ($t[0] === 'num') { $i++; return $t[1] + 0; }
            if ($t[0] === 'p' && $t[1] === '-' && ($tokens[$i + 1][0] ?? '') === 'num') { $i += 2; return -($tokens[$i - 1][1] + 0); }
            if ($t[0] === 'w') {
                $w = strtoupper($t[1]);
                if ($w === 'NULL') { $i++; return null; }
                if ($w === 'TRUE') { $i++; return 1; }
                if ($w === 'FALSE') { $i++; return 0; }
                if (in_array($w, ['NOW', 'CURRENT_TIMESTAMP', 'CURDATE', 'CURRENT_DATE', 'DATABASE', 'UTC_TIMESTAMP', 'CURTIME'], true)) {
                    $i++;
                    if (($tokens[$i][1] ?? '') === '(' && ($tokens[$i + 1][1] ?? '') === ')') $i += 2;
                    if ($w === 'DATABASE') return self::DB;
                    if ($w === 'CURDATE' || $w === 'CURRENT_DATE') return date('Y-m-d');
                    return date('Y-m-d H:i:s');
                }
                if ($w === 'COALESCE' && ($tokens[$i + 1][1] ?? '') === '(') {
                    $i += 2;
                    $found = null;
                    while (isset($tokens[$i]) && $tokens[$i][1] !== ')') {
                        $v = $this->parseValue($tokens, $i, $params, $pIdx, $sql, $valuesRow, $ctxRow);
                        if ($found === null) $found = $v;
                        if (($tokens[$i][1] ?? '') === ',') $i++;
                    }
                    $i++;
                    return $found;
                }
                if ($w === 'VALUES' && ($tokens[$i + 1][1] ?? '') === '(') {
                    $col = $tokens[$i + 2][1] ?? '';
                    $i += 4;
                    if ($valuesRow === null) $this->fail('VALUES() outside ON DUPLICATE KEY UPDATE', $sql);
                    return $valuesRow[$col] ?? null;
                }
            }
            if ($ctxRow !== null && in_array($t[0], ['id', 'w'], true)) {
                $col = $this->parseColumn($tokens, $i, $sql);
                return $ctxRow[$col] ?? null;
            }
            $this->fail('unsupported value expression near "' . ($t[1] ?? '?') . '"', $sql);
        }

        /** Column name at $i, skipping a `table.` prefix. */
        private function parseColumn(array $tokens, int &$i, string $sql): string {
            $t = $tokens[$i] ?? null;
            if ($t === null || !in_array($t[0], ['id', 'w'], true)) $this->fail('expected a column name', $sql);
            $name = $t[1];
            $i++;
            while (($tokens[$i][1] ?? '') === '.' && isset($tokens[$i + 1])) {
                $name = $tokens[$i + 1][1];
                $i += 2;
            }
            return $name;
        }

        /* ---- WHERE -------------------------------------------------------- */

        private function parseWhere(array $tokens, int &$i, array $params, int &$pIdx, string $sql): array {
            return $this->parseOr($tokens, $i, $params, $pIdx, $sql);
        }

        private function parseOr(array $tokens, int &$i, array $params, int &$pIdx, string $sql): array {
            $nodes = [$this->parseAnd($tokens, $i, $params, $pIdx, $sql)];
            while (isset($tokens[$i]) && $this->isWord($tokens[$i], 'OR')) {
                $i++;
                $nodes[] = $this->parseAnd($tokens, $i, $params, $pIdx, $sql);
            }
            return count($nodes) === 1 ? $nodes[0] : ['or', $nodes];
        }

        private function parseAnd(array $tokens, int &$i, array $params, int &$pIdx, string $sql): array {
            $nodes = [$this->parseTerm($tokens, $i, $params, $pIdx, $sql)];
            while (isset($tokens[$i]) && $this->isWord($tokens[$i], 'AND')) {
                $i++;
                $nodes[] = $this->parseTerm($tokens, $i, $params, $pIdx, $sql);
            }
            return count($nodes) === 1 ? $nodes[0] : ['and', $nodes];
        }

        private function parseTerm(array $tokens, int &$i, array $params, int &$pIdx, string $sql): array {
            $t = $tokens[$i] ?? null;
            if ($t === null) $this->fail('incomplete WHERE', $sql);
            if ($t[0] === 'p' && $t[1] === '(') {
                $i++;
                $node = $this->parseOr($tokens, $i, $params, $pIdx, $sql);
                if (($tokens[$i][1] ?? '') !== ')') $this->fail('missing )', $sql);
                $i++;
                return $node;
            }
            if ($this->isWord($t, 'NOT')) {
                $i++;
                return ['not', $this->parseTerm($tokens, $i, $params, $pIdx, $sql)];
            }
            $col = $this->parseColumn($tokens, $i, $sql);
            $next = $tokens[$i] ?? null;
            if ($next === null) $this->fail('incomplete condition', $sql);
            $negate = false;
            if ($this->isWord($next, 'NOT')) { $negate = true; $i++; $next = $tokens[$i] ?? null; }
            if ($next !== null && $this->isWord($next, 'IS')) {
                $i++;
                $isNot = isset($tokens[$i]) && $this->isWord($tokens[$i], 'NOT');
                if ($isNot) $i++;
                if (!isset($tokens[$i]) || !$this->isWord($tokens[$i], 'NULL')) $this->fail('IS must be followed by NULL', $sql);
                $i++;
                return ['null', $col, $isNot];
            }
            if ($next !== null && $this->isWord($next, 'IN')) {
                $i++;
                if (($tokens[$i][1] ?? '') !== '(') $this->fail('IN needs a list', $sql);
                $i++;
                $vals = [];
                while (isset($tokens[$i]) && $tokens[$i][1] !== ')') {
                    $vals[] = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                    if (($tokens[$i][1] ?? '') === ',') $i++;
                }
                $i++;
                return ['in', $col, $vals, $negate];
            }
            if ($next !== null && $this->isWord($next, 'LIKE')) {
                $i++;
                $pattern = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'ESCAPE')) $this->fail('LIKE ... ESCAPE', $sql);
                return ['like', $col, (string)$pattern, $negate];
            }
            if ($next !== null && $this->isWord($next, 'BETWEEN')) {
                $i++;
                $lo = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                if (!isset($tokens[$i]) || !$this->isWord($tokens[$i], 'AND')) $this->fail('BETWEEN needs AND', $sql);
                $i++;
                $hi = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                return ['and', [['cmp', $col, '>=', $lo], ['cmp', $col, '<=', $hi]]];
            }
            if ($next !== null && in_array($next[1], ['=', '<', '>', '<=', '>=', '<>', '!=', '<=>'], true) && in_array($next[0], ['op', 'p'], true)) {
                $i++;
                $rhs = $tokens[$i] ?? null;
                // column = other column is not interpretable
                if ($rhs !== null && in_array($rhs[0], ['id'], true)) $this->fail('column-to-column comparison', $sql);
                $val = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                return ['cmp', $col, $next[1], $val];
            }
            $this->fail('unsupported condition on column ' . $col, $sql);
        }

        private function looseEquals($a, $b): bool {
            if ($a === null || $b === null) return false;
            if (is_numeric($a) && is_numeric($b)) return (float)$a === (float)$b;
            return mb_strtolower((string)$a) === mb_strtolower((string)$b);
        }

        private function compare($a, $b): int {
            if (is_numeric($a) && is_numeric($b)) return (float)$a <=> (float)$b;
            return strcmp(mb_strtolower((string)$a), mb_strtolower((string)$b));
        }

        private function likeToRegex(string $pattern): string {
            $re = '';
            $n = strlen($pattern);
            for ($k = 0; $k < $n; $k++) {
                $c = $pattern[$k];
                if ($c === '\\' && $k + 1 < $n) { $re .= preg_quote($pattern[++$k], '/'); }
                elseif ($c === '%') $re .= '.*';
                elseif ($c === '_') $re .= '.';
                else $re .= preg_quote($c, '/');
            }
            return '/^' . $re . '$/isu';
        }

        private function matches(array $node, array $row): bool {
            switch ($node[0]) {
                case 'and':
                    foreach ($node[1] as $n) if (!$this->matches($n, $row)) return false;
                    return true;
                case 'or':
                    foreach ($node[1] as $n) if ($this->matches($n, $row)) return true;
                    return false;
                case 'not':
                    return !$this->matches($node[1], $row);
                case 'null':
                    $isNull = !array_key_exists($node[1], $row) || $row[$node[1]] === null;
                    return $node[2] ? !$isNull : $isNull;
                case 'in':
                    $v = $row[$node[1]] ?? null;
                    $found = false;
                    foreach ($node[2] as $c) if ($this->looseEquals($v, $c)) { $found = true; break; }
                    return $node[3] ? ($v !== null && !$found) : $found;
                case 'like':
                    $v = $row[$node[1]] ?? null;
                    if ($v === null) return false;
                    $hit = (bool)preg_match($this->likeToRegex($node[2]), (string)$v);
                    return $node[3] ? !$hit : $hit;
                case 'cmp':
                    [, $col, $op, $val] = $node;
                    $v = $row[$col] ?? null;
                    if ($op === '<=>') return $v === null ? $val === null : $this->looseEquals($v, $val);
                    if ($v === null || $val === null) return false;
                    switch ($op) {
                        case '=': return $this->looseEquals($v, $val);
                        case '!=':
                        case '<>': return !$this->looseEquals($v, $val);
                        case '<': return $this->compare($v, $val) < 0;
                        case '>': return $this->compare($v, $val) > 0;
                        case '<=': return $this->compare($v, $val) <= 0;
                        case '>=': return $this->compare($v, $val) >= 0;
                    }
            }
            return false;
        }

        /* ---- table helpers ------------------------------------------------ */

        private function tableName(array $tokens, int &$i, string $sql): string {
            $t = $tokens[$i] ?? null;
            if ($t === null || !in_array($t[0], ['id', 'w'], true)) $this->fail('expected a table name', $sql);
            $name = $t[1];
            $i++;
            if (($tokens[$i][1] ?? '') === '.' && isset($tokens[$i + 1])) {
                $name = $name . '.' . $tokens[$i + 1][1];
                $i += 2;
            }
            return $name;
        }

        private function requireTable(string $table): array {
            if (!isset($this->catalogue[$table])) {
                throw new DemoFakeException("Table '" . self::DB . ".{$table}' doesn't exist", '42S02', 1146);
            }
            return $this->catalogue[$table];
        }

        private function checkColumn(string $table, string $col, string $sql): bool {
            if (isset($this->catalogue[$table]['cols'][$col]) || isset($this->allowColumns[$table][$col])) {
                return true;
            }
            $msg = "Unknown column '{$col}' in '{$table}' (not in api/schema.php CREATE TABLE nor any ADD COLUMN)";
            if ($this->lenient) {
                $this->warnings[] = $msg;
                return false;
            }
            throw new DemoFakeException($msg, '42S22', 1054);
        }

        /* ---- INSERT / REPLACE -------------------------------------------- */

        private function runInsert(string $sql, array $params): int {
            $tokens = $this->tokenize($sql);
            $i = 0;
            $replace = $this->isWord($tokens[0], 'REPLACE');
            $i++;
            $ignore = false;
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'IGNORE')) { $ignore = true; $i++; }
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'INTO')) $i++;
            $table = $this->tableName($tokens, $i, $sql);
            $cat = $this->requireTable($table);
            $cols = [];
            if (($tokens[$i][1] ?? '') === '(') {
                $i++;
                while (isset($tokens[$i]) && $tokens[$i][1] !== ')') {
                    $cols[] = $this->parseColumn($tokens, $i, $sql);
                    if (($tokens[$i][1] ?? '') === ',') $i++;
                }
                $i++;
            } else {
                $cols = array_keys($cat['cols']);
            }
            if (!isset($tokens[$i])) $this->fail('INSERT without VALUES', $sql);
            if ($this->isWord($tokens[$i], 'SELECT')) $this->fail('INSERT ... SELECT', $sql);
            if ($this->isWord($tokens[$i], 'SET')) $this->fail('INSERT ... SET', $sql);
            if (!$this->isWord($tokens[$i], 'VALUES') && !$this->isWord($tokens[$i], 'VALUE')) $this->fail('expected VALUES', $sql);
            $i++;
            $pIdx = 0;
            $valueRows = [];
            while (isset($tokens[$i]) && $tokens[$i][1] === '(') {
                $i++;
                $vals = [];
                while (isset($tokens[$i]) && $tokens[$i][1] !== ')') {
                    $vals[] = $this->parseValue($tokens, $i, $params, $pIdx, $sql);
                    if (($tokens[$i][1] ?? '') === ',') $i++;
                }
                $i++;
                if (count($vals) !== count($cols)) {
                    throw new DemoFakeException('Column count doesn\'t match value count at row ' . (count($valueRows) + 1) . ' (' . count($cols) . ' columns, ' . count($vals) . ' values)', '21S01', 1136);
                }
                $valueRows[] = array_combine($cols, $vals);
                if (($tokens[$i][1] ?? '') === ',') $i++;
            }
            $dupAssign = null;
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'ON')) {
                // ON DUPLICATE KEY UPDATE a = <value>, b = VALUES(b)
                $i += 4;
                $dupAssign = [];
                while (isset($tokens[$i])) {
                    $col = $this->parseColumn($tokens, $i, $sql);
                    if (($tokens[$i][1] ?? '') !== '=') $this->fail('expected = in ON DUPLICATE KEY UPDATE', $sql);
                    $i++;
                    $dupAssign[] = [$col, $i, $pIdx];
                    // Values are parsed per row below (VALUES(col) depends on the row); skip tokens now.
                    $this->parseValue($tokens, $i, $params, $pIdx, $sql, array_fill_keys($cols, null), array_fill_keys(array_keys($cat['cols']), null));
                    if (($tokens[$i][1] ?? '') === ',') $i++;
                }
            }
            $affected = 0;
            foreach ($valueRows as $given) {
                foreach (array_keys($given) as $c) {
                    if (!$this->checkColumn($table, $c, $sql)) unset($given[$c]);
                }
                $row = $this->completeRow($table, $given, $sql);
                $dup = $this->findDuplicate($table, $row);
                if ($dup !== null) {
                    if ($replace) {
                        unset($this->rows[$table][$dup]);
                        $this->rows[$table] = array_values($this->rows[$table]);
                    } elseif ($dupAssign !== null) {
                        foreach ($dupAssign as [$col, $tokIdx, $paramIdx]) {
                            $j = $tokIdx;
                            $p = $paramIdx;
                            $this->checkColumn($table, $col, $sql);
                            $this->rows[$table][$dup][$col] = $this->parseValue($tokens, $j, $params, $p, $sql, $row, $this->rows[$table][$dup]);
                        }
                        $affected += 2;
                        continue;
                    } elseif ($ignore) {
                        continue;
                    } else {
                        throw new DemoFakeException("Duplicate entry for key on table '{$table}': " . json_encode($this->keyOf($table, $row, $dup)), '23000', 1062);
                    }
                }
                $this->rows[$table][] = $row;
                $this->inserts[$table] = ($this->inserts[$table] ?? 0) + 1;
                $affected++;
            }
            return $affected;
        }

        private function keyOf(string $table, array $row, int $existing): array {
            return ['existing' => $existing, 'pk' => array_intersect_key($row, array_flip($this->catalogue[$table]['pk'] ?: []))];
        }

        /** Fill defaults, auto-increment, and validate NOT NULL / length / ENUM like strict MySQL. */
        private function completeRow(string $table, array $given, string $sql): array {
            $cat = $this->catalogue[$table];
            $row = [];
            foreach ($cat['cols'] as $name => $spec) {
                if (array_key_exists($name, $given)) {
                    $v = $given[$name];
                    if ($v === null && $spec['auto']) {
                        $v = $this->nextAuto($table);
                    } elseif ($v === null && $spec['notnull']) {
                        throw new DemoFakeException("Column '{$name}' cannot be null (table '{$table}')", '23000', 1048);
                    }
                    if ($spec['auto'] && is_numeric($v)) {
                        $this->autoInc[$table] = max($this->autoInc[$table] ?? 0, (int)$v);
                    }
                    $row[$name] = $this->validateValue($table, $name, $spec, $v);
                    continue;
                }
                if ($spec['auto']) {
                    $row[$name] = $this->nextAuto($table);
                } elseif ($spec['hasDefault']) {
                    $d = $spec['default'];
                    $row[$name] = is_string($d) && preg_match('/^(CURRENT_TIMESTAMP|NOW\(\))/i', $d) ? date('Y-m-d H:i:s') : $d;
                } elseif (!$spec['notnull'] || in_array($spec['type'], ['timestamp'], true)) {
                    $row[$name] = null;
                } else {
                    throw new DemoFakeException("Field '{$name}' doesn't have a default value (table '{$table}')", 'HY000', 1364);
                }
            }
            foreach (array_keys($this->allowColumns[$table] ?? []) as $extra) {
                if (array_key_exists($extra, $given)) $row[$extra] = $given[$extra];
            }
            return $row;
        }

        private function nextAuto(string $table): int {
            $this->autoInc[$table] = ($this->autoInc[$table] ?? 0) + 1;
            $this->lastId = $this->autoInc[$table];
            return $this->autoInc[$table];
        }

        private function validateValue(string $table, string $name, array $spec, $v) {
            if ($v === null) return null;
            if ($spec['len'] !== null && is_string($v) && mb_strlen($v) > $spec['len']) {
                throw new DemoFakeException("Data too long for column '{$name}' at row 1 (table '{$table}': " . mb_strlen($v) . " > {$spec['len']})", '22001', 1406);
            }
            if ($spec['enum'] !== null && !in_array((string)$v, $spec['enum'], true) && $v !== '') {
                throw new DemoFakeException("Data truncated for column '{$name}' at row 1 (table '{$table}': '{$v}' is not one of " . implode('|', $spec['enum']) . ")", '01000', 1265);
            }
            if (is_bool($v)) return $v ? 1 : 0;
            return $v;
        }

        /** Index of an existing row with the same PRIMARY KEY / UNIQUE value, or null. */
        private function findDuplicate(string $table, array $row): ?int {
            $cat = $this->catalogue[$table];
            $keys = [];
            if ($cat['pk']) $keys[] = $cat['pk'];
            foreach ($cat['unique'] as $u) $keys[] = $u;
            foreach ($keys as $cols) {
                foreach ($this->rows[$table] ?? [] as $idx => $existing) {
                    $same = true;
                    foreach ($cols as $c) {
                        $a = $existing[$c] ?? null;
                        $b = $row[$c] ?? null;
                        if ($a === null || $b === null || !$this->looseEquals($a, $b)) { $same = false; break; }
                    }
                    if ($same) return $idx;
                }
            }
            return null;
        }

        /** Insert a row with no SQL and no logging (fixtures; the system_settings seed). */
        private function insertRowRaw(string $table, array $row): void {
            $this->requireTable($table);
            $this->rows[$table][] = $this->completeRow($table, $row, '');
        }

        /* ---- UPDATE / DELETE --------------------------------------------- */

        private function runUpdate(string $sql, array $params): int {
            $tokens = $this->tokenize($sql);
            $i = 1;
            $table = $this->tableName($tokens, $i, $sql);
            $cat = $this->requireTable($table);
            if (!isset($tokens[$i]) || !$this->isWord($tokens[$i], 'SET')) $this->fail('UPDATE without SET', $sql);
            $i++;
            $pIdx = 0;
            $assign = [];
            $blank = array_fill_keys(array_keys($cat['cols']), null);
            while (isset($tokens[$i]) && !$this->isWord($tokens[$i], 'WHERE')) {
                $col = $this->parseColumn($tokens, $i, $sql);
                if (($tokens[$i][1] ?? '') !== '=') $this->fail('expected = in SET', $sql);
                $i++;
                $assign[] = [$col, $i, $pIdx];
                // Parsed once to skip the tokens and consume the params; evaluated again per row below.
                $this->parseValue($tokens, $i, $params, $pIdx, $sql, null, $blank);
                if (isset($tokens[$i]) && in_array($tokens[$i][1], ['+', '-', '*', '/'], true)) $this->fail('SET with arithmetic', $sql);
                if (($tokens[$i][1] ?? '') === ',') $i++;
            }
            $where = ['true'];
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'WHERE')) {
                $i++;
                $where = $this->parseWhere($tokens, $i, $params, $pIdx, $sql);
            }
            if (isset($tokens[$i])) $this->fail('trailing clause after WHERE (ORDER BY/LIMIT)', $sql);
            $assign = array_values(array_filter($assign, fn(array $a): bool => $this->checkColumn($table, $a[0], $sql)));
            $n = 0;
            foreach ($this->rows[$table] ?? [] as $idx => $row) {
                if ($where[0] === 'true' || $this->matches($where, $row)) {
                    $new = $row;
                    foreach ($assign as [$c, $tokIdx, $paramIdx]) {
                        $j = $tokIdx;
                        $p = $paramIdx;
                        $v = $this->parseValue($tokens, $j, $params, $p, $sql, null, $row);
                        $spec = $cat['cols'][$c] ?? null;
                        if ($spec !== null) {
                            if ($v === null && $spec['notnull'] && !$spec['auto']) {
                                throw new DemoFakeException("Column '{$c}' cannot be null (table '{$table}')", '23000', 1048);
                            }
                            $v = $this->validateValue($table, $c, $spec, $v);
                        }
                        $new[$c] = $v;
                    }
                    if ($new !== $row) $n++;
                    $this->rows[$table][$idx] = $new;
                }
            }
            return $n;
        }

        private function runDelete(string $sql, array $params): int {
            $tokens = $this->tokenize($sql);
            $i = 1;
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'FROM')) $i++;
            $table = $this->tableName($tokens, $i, $sql);
            $this->requireTable($table);
            $pIdx = 0;
            $where = ['true'];
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'WHERE')) {
                $i++;
                $where = $this->parseWhere($tokens, $i, $params, $pIdx, $sql);
            }
            if (isset($tokens[$i])) $this->fail('trailing clause after WHERE (ORDER BY/LIMIT/JOIN)', $sql);
            $keep = [];
            $n = 0;
            foreach ($this->rows[$table] ?? [] as $row) {
                if ($where[0] === 'true' || $this->matches($where, $row)) $n++;
                else $keep[] = $row;
            }
            $this->rows[$table] = $keep;
            return $n;
        }

        /* ---- SELECT / SHOW ----------------------------------------------- */

        /** Virtual rows for information_schema.TABLES / COLUMNS. */
        private function infoSchema(string $which): ?array {
            $out = [];
            if ($which === 'TABLES') {
                foreach (array_keys($this->catalogue) as $t) {
                    $out[] = ['TABLE_SCHEMA' => self::DB, 'TABLE_NAME' => $t, 'TABLE_TYPE' => 'BASE TABLE'];
                }
                return $out;
            }
            if ($which === 'COLUMNS') {
                foreach ($this->catalogue as $t => $cat) {
                    foreach ($cat['cols'] as $c => $spec) {
                        $out[] = [
                            'TABLE_SCHEMA' => self::DB, 'TABLE_NAME' => $t, 'COLUMN_NAME' => $c,
                            'DATA_TYPE' => $spec['type'], 'IS_NULLABLE' => $spec['notnull'] ? 'NO' : 'YES',
                            'COLUMN_TYPE' => $spec['type'] . ($spec['len'] !== null ? '(' . $spec['len'] . ')' : ''),
                            'CHARACTER_MAXIMUM_LENGTH' => $spec['len'],
                        ];
                    }
                }
                return $out;
            }
            return null;
        }

        private function runSelect(string $sql, array $params): array {
            try {
                return $this->selectRows($sql, $params);
            } catch (DemoFakeUnsupported $e) {
                $this->warnings[] = 'SELECT not interpreted (returned no rows): ' . substr($sql, 0, 140);
                return [];
            }
        }

        private function selectRows(string $sql, array $params): array {
            $tokens = $this->tokenize($sql);
            $i = 1;
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'DISTINCT')) $this->fail('DISTINCT', $sql);
            // select list
            $items = [];
            $pIdx = 0;
            while (isset($tokens[$i]) && !$this->isWord($tokens[$i], 'FROM')) {
                $t = $tokens[$i];
                if ($t[1] === '*' && $t[0] === 'p') {
                    $items[] = ['star'];
                    $i++;
                } elseif ($t[0] === 'w' && in_array(strtoupper($t[1]), ['COUNT', 'MAX', 'MIN', 'SUM', 'DATABASE'], true) && ($tokens[$i + 1][1] ?? '') === '(') {
                    $fn = strtoupper($t[1]);
                    $i += 2;
                    if ($fn === 'DATABASE') {
                        $i++; // )
                        $arg = null;
                    } elseif (($tokens[$i][1] ?? '') === '*') {
                        $arg = '*';
                        $i += 2;
                    } else {
                        if ($this->isWord($tokens[$i], 'DISTINCT')) $this->fail('COUNT(DISTINCT)', $sql);
                        $arg = $this->parseColumn($tokens, $i, $sql);
                        $i++; // )
                    }
                    $items[] = ['fn', $fn, $arg, $fn . '(' . ($arg ?? '') . ')'];
                } else {
                    $col = $this->parseColumn($tokens, $i, $sql);
                    $items[] = ['col', $col, $col];
                }
                if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'AS')) {
                    $alias = $tokens[$i + 1][1] ?? '';
                    $i += 2;
                    $last = count($items) - 1;
                    $items[$last][count($items[$last]) - 1] = $alias;
                }
                if (($tokens[$i][1] ?? '') === ',') $i++;
            }
            if (!isset($tokens[$i])) {
                // SELECT DATABASE() / SELECT 1 with no FROM
                $row = [];
                foreach ($items as $it) if ($it[0] === 'fn' && $it[1] === 'DATABASE') $row[$it[3]] = self::DB;
                if (!$row) $this->fail('SELECT without FROM', $sql);
                return [$row];
            }
            $i++; // FROM
            $table = $this->tableName($tokens, $i, $sql);
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'AS')) $i++;
            if (isset($tokens[$i]) && in_array($tokens[$i][0], ['w', 'id'], true)
                && !in_array(strtoupper($tokens[$i][1]), ['WHERE', 'ORDER', 'LIMIT', 'GROUP', 'JOIN', 'LEFT', 'INNER', 'HAVING', 'FOR'], true)) {
                $i++; // alias
            }
            if (isset($tokens[$i]) && in_array(strtoupper($tokens[$i][1]), ['JOIN', 'LEFT', 'INNER', 'RIGHT'], true)) $this->fail('JOIN', $sql);

            if (stripos($table, 'information_schema.') === 0) {
                $source = $this->infoSchema(strtoupper(substr($table, 19)));
                if ($source === null) $this->fail('information_schema table ' . $table, $sql);
            } else {
                $this->requireTable($table);
                $source = $this->rows[$table] ?? [];
            }

            $where = ['true'];
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'WHERE')) {
                $i++;
                $where = $this->parseWhere($tokens, $i, $params, $pIdx, $sql);
            }
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'GROUP')) $this->fail('GROUP BY', $sql);
            $orders = [];
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'ORDER')) {
                $i += 2;
                while (isset($tokens[$i]) && !$this->isWord($tokens[$i], 'LIMIT')) {
                    $c = $this->parseColumn($tokens, $i, $sql);
                    $desc = false;
                    if (isset($tokens[$i]) && ($this->isWord($tokens[$i], 'DESC') || $this->isWord($tokens[$i], 'ASC'))) {
                        $desc = $this->isWord($tokens[$i], 'DESC');
                        $i++;
                    }
                    $orders[] = [$c, $desc];
                    if (($tokens[$i][1] ?? '') === ',') $i++;
                }
            }
            $limit = null;
            $offset = 0;
            if (isset($tokens[$i]) && $this->isWord($tokens[$i], 'LIMIT')) {
                $i++;
                $limit = (int)$this->parseValue($tokens, $i, $params, $pIdx, $sql);
                if (($tokens[$i][1] ?? '') === ',') {
                    $offset = $limit;
                    $i++;
                    $limit = (int)$this->parseValue($tokens, $i, $params, $pIdx, $sql);
                } elseif (isset($tokens[$i]) && $this->isWord($tokens[$i], 'OFFSET')) {
                    $i++;
                    $offset = (int)$this->parseValue($tokens, $i, $params, $pIdx, $sql);
                }
            }
            if (isset($tokens[$i])) $this->fail('unsupported trailing clause "' . $tokens[$i][1] . '"', $sql);

            $filtered = [];
            foreach ($source as $row) {
                if ($where[0] === 'true' || $this->matches($where, $row)) $filtered[] = $row;
            }
            foreach (array_reverse($orders) as [$c, $desc]) {
                usort($filtered, fn($a, $b) => ($desc ? -1 : 1) * $this->compare($a[$c] ?? '', $b[$c] ?? ''));
            }
            if ($limit !== null) $filtered = array_slice($filtered, $offset, $limit);

            $hasAgg = (bool)array_filter($items, static fn($it) => $it[0] === 'fn' && $it[1] !== 'DATABASE');
            if ($hasAgg) {
                $out = [];
                foreach ($items as $it) {
                    if ($it[0] !== 'fn') $this->fail('mixing aggregate and plain columns', $sql);
                    [, $fn, $arg, $alias] = $it;
                    $vals = $arg === '*' ? $filtered : array_values(array_filter(array_column($filtered, $arg), static fn($v) => $v !== null));
                    if ($fn === 'COUNT') $out[$alias] = count($vals);
                    elseif ($fn === 'SUM') $out[$alias] = $vals ? array_sum($vals) : null;
                    elseif ($fn === 'MAX') $out[$alias] = $vals ? max($vals) : null;
                    elseif ($fn === 'MIN') $out[$alias] = $vals ? min($vals) : null;
                    else $out[$alias] = self::DB;
                }
                return [$out];
            }
            $result = [];
            foreach ($filtered as $row) {
                $shaped = [];
                foreach ($items as $it) {
                    if ($it[0] === 'star') {
                        $shaped += $row;
                    } elseif ($it[0] === 'col') {
                        $shaped[$it[2]] = $row[$it[1]] ?? null;
                    } else {
                        $shaped[$it[3]] = self::DB;
                    }
                }
                $result[] = $shaped;
            }
            return $result;
        }

        private function runShow(string $sql): array {
            if (preg_match("/^SHOW\s+TABLES\s+LIKE\s+'([^']*)'/i", $sql, $m)) {
                $re = $this->likeToRegex($m[1]);
                $out = [];
                foreach (array_keys($this->catalogue) as $t) {
                    if (preg_match($re, $t)) $out[] = ['Tables_in_' . self::DB . " ({$m[1]})" => $t];
                }
                return $out;
            }
            if (preg_match("/^SHOW\s+(?:FULL\s+)?COLUMNS\s+FROM\s+`?(\w+)`?(?:\s+LIKE\s+'([^']*)')?/i", $sql, $m)) {
                $this->requireTable($m[1]);
                $re = isset($m[2]) ? $this->likeToRegex($m[2]) : null;
                $out = [];
                foreach ($this->catalogue[$m[1]]['cols'] as $c => $spec) {
                    if ($re === null || preg_match($re, $c)) $out[] = ['Field' => $c, 'Type' => $spec['type'], 'Null' => $spec['notnull'] ? 'NO' : 'YES'];
                }
                return $out;
            }
            $this->warnings[] = 'SHOW not interpreted: ' . substr($sql, 0, 100);
            return [];
        }
    }
}
