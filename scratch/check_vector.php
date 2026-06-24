<?php
// Scratch script to query current system_settings and test connections to RAG / Vector DB
require_once __DIR__ . '/../public/config.php';

try {
    $pdo = get_db_connection();
    echo "Successfully connected to primary CRM database.\n";
    
    // Check Integrations settings
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
    $stmt->execute();
    $configJson = $stmt->fetchColumn();
    
    if (!$configJson) {
        echo "No INTEGRATIONS_CONFIG found in system_settings.\n";
        exit;
    }
    
    $config = json_decode($configJson, true);
    echo "INTEGRATIONS_CONFIG settings:\n";
    print_r($config);
    
    $vectorDb = $config['vectorDb'] ?? 'none';
    echo "Configured Vector Database backend: " . $vectorDb . "\n";
    
    if ($vectorDb === 'mariadb') {
        $host = $config['mariaDbHost'] ?? '';
        $port = $config['mariaDbPort'] ?? '3306';
        $user = $config['mariaDbUser'] ?? '';
        $pass = $config['mariaDbPassword'] ?? '';
        $name = $config['mariaDbName'] ?? '';
        
        echo "Connecting to MariaDB Vector DB on {$host}:{$port}...\n";
        $dsn = "mysql:host=" . $host . ";port=" . $port . ";dbname=" . $name . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT            => 5,
        ];
        
        $ragPdo = new PDO($dsn, $user, $pass, $options);
        echo "Successfully connected to MariaDB Vector Database!\n";
        
        // Let's check tables and schema
        $stmt = $ragPdo->query("SHOW TABLES");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo "Tables in vector_db:\n";
        print_r($tables);
        
        foreach ($tables as $table) {
            $stmt = $ragPdo->query("SELECT COUNT(*) FROM `{$table}`");
            $count = $stmt->fetchColumn();
            echo "  - Table `{$table}` has {$count} rows.\n";
        }
        
    } else {
        echo "Vector Database backend is set to: " . $vectorDb . "\n";
    }
    
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
