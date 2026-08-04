<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

// Safe DSN loader
$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
}

// Helpers
if (!function_exists('ccrm_resolve_json_path')) {
    function ccrm_resolve_json_path($path, $data) {
        $path = trim($path);
        if ($path === '') return $data;
        $parts = explode('.', $path);
        if ($parts[0] === '$input' || $parts[0] === '$trigger') {
            array_shift($parts);
        }
        $curr = $data;
        foreach ($parts as $p) {
            if (is_array($curr) && isset($curr[$p])) {
                $curr = $curr[$p];
            } else if (is_object($curr) && isset($curr->$p)) {
                $curr = $curr->$p;
            } else {
                return null;
            }
        }
        return $curr;
    }
}

if (!function_exists('ccrm_interpolate_variables')) {
    function ccrm_interpolate_variables($text, $inputData) {
        if (!is_string($text)) return $text;
        return preg_replace_callback('/\{\{([a-zA-Z0-9_\.\$]+)\}\}/', function($matches) use ($inputData) {
            $path = $matches[1];
            $val = ccrm_resolve_json_path($path, $inputData);
            if ($val === null) return '';
            if (is_array($val) || is_object($val)) {
                return json_encode($val, JSON_UNESCAPED_UNICODE);
            }
            return (string)$val;
        }, $text);
    }
}

if (!function_exists('ccrm_evaluate_condition')) {
    function ccrm_evaluate_condition($conditionJs, $inputData) {
        $conditionJs = trim($conditionJs);
        if ($conditionJs === '') {
            return true;
        }
        if (stripos($conditionJs, 'return ') === 0) {
            $conditionJs = substr($conditionJs, 7);
        }
        $conditionJs = rtrim($conditionJs, ';');

        $tokens = preg_split('/(\|\||&&)/', $conditionJs, -1, PREG_SPLIT_DELIM_CAPTURE);
        $results = [];
        $operators = [];
        
        foreach ($tokens as $token) {
            $token = trim($token);
            if ($token === '||' || $token === '&&') {
                $operators[] = $token;
                continue;
            }
            
            // Compare left, operator, right
            if (preg_match('/^(\$[a-zA-Z0-9_\.]+)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/', $token, $matches)) {
                $leftPath = $matches[1];
                $op = $matches[2];
                $rightRaw = trim($matches[3]);
                
                $leftVal = ccrm_resolve_json_path($leftPath, $inputData);
                
                if ($rightRaw === 'true') {
                    $rightVal = true;
                } elseif ($rightRaw === 'false') {
                    $rightVal = false;
                } elseif ($rightRaw === 'null') {
                    $rightVal = null;
                } elseif (preg_match('/^[\'"](.*)[\'"]$/', $rightRaw, $strMatches)) {
                    $rightVal = $strMatches[1];
                } elseif (is_numeric($rightRaw)) {
                    $rightVal = (float)$rightRaw;
                } else {
                    if (strpos($rightRaw, '$') === 0) {
                        $rightVal = ccrm_resolve_json_path($rightRaw, $inputData);
                    } else {
                        $rightVal = $rightRaw;
                    }
                }
                
                switch ($op) {
                    case '===': $res = ($leftVal === $rightVal); break;
                    case '==':  $res = ($leftVal == $rightVal); break;
                    case '!==': $res = ($leftVal !== $rightVal); break;
                    case '!=':  $res = ($leftVal != $rightVal); break;
                    case '>':   $res = ($leftVal > $rightVal); break;
                    case '>=':  $res = ($leftVal >= $rightVal); break;
                    case '<':   $res = ($leftVal < $rightVal); break;
                    case '<=':  $res = ($leftVal <= $rightVal); break;
                    default:    $res = false;
                }
                $results[] = $res;
            } else {
                if (strpos($token, '$') === 0) {
                    $results[] = (bool)ccrm_resolve_json_path($token, $inputData);
                } else {
                    $results[] = false;
                }
            }
        }
        
        if (empty($results)) return false;
        
        $finalRes = $results[0];
        for ($i = 0; $i < count($operators); $i++) {
            $op = $operators[$i];
            $nextVal = $results[$i + 1] ?? false;
            if ($op === '&&') {
                $finalRes = $finalRes && $nextVal;
            } elseif ($op === '||') {
                $finalRes = $finalRes || $nextVal;
            }
        }
        return $finalRes;
    }
}

if (!function_exists('ccrm_load_automation_config')) {
    function ccrm_load_automation_config($pdo) {
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'AUTOMATION_CONFIG'")->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        if (!$raw) {
            $cronToken = bin2hex(random_bytes(16));
            $defaultConfig = [
                'openAiKey' => '',
                'anthropicKey' => '',
                'geminiKey' => '',
                'cronToken' => $cronToken
            ];
            try {
                $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('AUTOMATION_CONFIG', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
                $stmt->execute([json_encode($defaultConfig)]);
            } catch (\Throwable $e) {}
            return $defaultConfig;
        }
        $cfg = json_decode($raw, true) ?: [];
        if (function_exists('ccrm_decrypt_config_secrets')) {
            $cfg = ccrm_decrypt_config_secrets($cfg, ['openAiKey', 'anthropicKey', 'geminiKey']);
        }
        if (empty($cfg['cronToken'])) {
            $cfg['cronToken'] = bin2hex(random_bytes(16));
        }
        return $cfg;
    }
}

if (!function_exists('ccrm_call_llm')) {
    function ccrm_call_llm($provider, $key, $prompt, $options = []) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        if ($provider === 'gemini') {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . $key;
            $payload = [
                'contents' => [
                    ['parts' => [['text' => $prompt]]]
                ]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } elseif ($provider === 'openai') {
            $url = 'https://api.openai.com/v1/chat/completions';
            $model = $options['model'] ?? 'gpt-4o-mini';
            $payload = [
                'model' => $model,
                'messages' => [['role' => 'user', 'content' => $prompt]]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $key
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } elseif ($provider === 'anthropic') {
            $url = 'https://api.anthropic.com/v1/messages';
            $model = $options['model'] ?? 'claude-3-5-sonnet-20241022';
            $payload = [
                'model' => $model,
                'max_tokens' => 1024,
                'messages' => [['role' => 'user', 'content' => $prompt]]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'x-api-key: ' . $key,
                'anthropic-version: 2023-06-01'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } else {
            throw new Exception("Unknown AI provider: $provider");
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new Exception("LLM call failed with HTTP code $httpCode: " . $response);
        }
        
        $data = json_decode($response, true);
        if ($provider === 'gemini') {
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        } elseif ($provider === 'openai') {
            return $data['choices'][0]['message']['content'] ?? '';
        } elseif ($provider === 'anthropic') {
            return $data['content'][0]['text'] ?? '';
        }
        return '';
    }
}

if (!function_exists('ccrm_trigger_workflow')) {
    function ccrm_trigger_workflow($eventType, $payload, $pdo) {
        try {
            // Find all active workflows with this trigger_type
            $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `trigger_type` = ? AND `is_active` = 1");
            $stmt->execute([$eventType]);
            $workflows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($workflows as $wf) {
                $config = json_decode($wf['trigger_config_json'] ?? '{}', true) ?: [];
                $matches = true;
                
                // Match filters based on trigger type
                if ($eventType === 'lead_created') {
                    if (!empty($config['leadSource']) && isset($payload['source'])) {
                        $sources = (array)$config['leadSource'];
                        if (!in_array($payload['source'], $sources, true)) {
                            $matches = false;
                        }
                    }
                } elseif ($eventType === 'lead_status_changed') {
                    if (isset($payload['oldStatus']) && isset($payload['newStatus'])) {
                        if (!empty($config['fromStatus']) && $config['fromStatus'] !== 'any') {
                            if ($payload['oldStatus'] !== $config['fromStatus']) $matches = false;
                        }
                        if (!empty($config['toStatus']) && $config['toStatus'] !== 'any') {
                            if ($payload['newStatus'] !== $config['toStatus']) $matches = false;
                        }
                    }
                } elseif ($eventType === 'client_created') {
                    if (!empty($config['clientType']) && isset($payload['client_type'])) {
                        if ($payload['client_type'] !== $config['clientType']) $matches = false;
                    }
                } elseif ($eventType === 'task_created') {
                    if (!empty($config['owner']) && isset($payload['owner'])) {
                        if ($payload['owner'] !== $config['owner']) $matches = false;
                    }
                } elseif ($eventType === 'task_status_changed') {
                    if (isset($payload['oldStatus']) && isset($payload['newStatus'])) {
                        if (!empty($config['fromStatus']) && $config['fromStatus'] !== 'any') {
                            if ($payload['oldStatus'] !== $config['fromStatus']) $matches = false;
                        }
                        if (!empty($config['toStatus']) && $config['toStatus'] !== 'any') {
                            if ($payload['newStatus'] !== $config['toStatus']) $matches = false;
                        }
                    }
                }
                
                if ($matches) {
                    $ins = $pdo->prepare("
                        INSERT INTO `workflow_queue` (`workflow_id`, `trigger_event_type`, `payload_json`, `status`)
                        VALUES (?, ?, ?, 'pending')
                    ");
                    $ins->execute([$wf['id'], $eventType, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
                    $hasEnqueued = true;
                }
            }

            if (!empty($hasEnqueued) && !$pdo->inTransaction()) {
                ccrm_process_workflow_queue($pdo);
            }
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        }
    }
}

if (!function_exists('ccrm_execute_workflow')) {
    function ccrm_execute_workflow($wf, $triggerPayload, $pdo, $queueId = null) {
        $startTime = microtime(true);
        $nodes = json_decode($wf['nodes_json'] ?? '[]', true) ?: [];
        $edges = json_decode($wf['edges_json'] ?? '[]', true) ?: [];
        
        $nodesMap = [];
        foreach ($nodes as $node) {
            $nodesMap[$node['id']] = $node;
        }
        
        // Find trigger node
        $triggerNode = null;
        foreach ($nodes as $node) {
            if ($node['type'] === 'trigger') {
                $triggerNode = $node;
                break;
            }
        }
        
        if (!$triggerNode) {
            throw new Exception("Workflow trigger node is missing.");
        }
        
        $executionLog = [];
        $nodeOutputs = [
            $triggerNode['id'] => $triggerPayload,
            'trigger' => $triggerPayload
        ];
        
        // Queue for node execution: array of [nodeId, incomingPayload, visitedPath]
        $execQueue = [[$triggerNode['id'], $triggerPayload, []]];
        
        $status = 'success';
        
        while (!empty($execQueue)) {
            list($currNodeId, $incomingPayload, $path) = array_shift($execQueue);
            if (in_array($currNodeId, $path)) {
                // Detect cycle, skip to prevent infinite loop
                continue;
            }
            $newPath = array_merge($path, [$currNodeId]);
            
            $node = $nodesMap[$currNodeId] ?? null;
            if (!$node) continue;
            
            $nodeType = $node['type'];
            $nodeData = $node['data'] ?? [];
            
            $outputPayload = $incomingPayload;
            $nodeSuccess = true;
            $errorMsg = null;
            
            try {
                if ($nodeType === 'trigger') {
                    $outputPayload = $incomingPayload;
                } elseif ($nodeType === 'condition') {
                    $jsCode = $nodeData['js_code'] ?? '';
                    $conditionResult = ccrm_evaluate_condition($jsCode, $incomingPayload);
                    $outputPayload = ['result' => $conditionResult];
                } elseif ($nodeType === 'splitter') {
                    // Splits events: expects array payload
                    $arrayPath = $nodeData['array_path'] ?? '';
                    $arrayData = ccrm_resolve_json_path($arrayPath, $incomingPayload);
                    if (is_array($arrayData)) {
                        // For splitter, we branch out for each element
                        foreach ($arrayData as $item) {
                            // Find child nodes and queue them with individual item payload
                            $childEdges = array_filter($edges, function($e) use ($currNodeId) {
                                return $e['source'] === $currNodeId;
                            });
                            foreach ($childEdges as $edge) {
                                $execQueue[] = [$edge['target'], $item, $newPath];
                            }
                        }
                        // Stop standard child execution because we just manual-queued it
                        continue;
                    }
                } elseif ($nodeType === 'ai_agent') {
                    $autoConfig = ccrm_load_automation_config($pdo);
                    $provider = $nodeData['provider'] ?? 'gemini';
                    $key = '';
                    if ($provider === 'openai') $key = $autoConfig['openAiKey'];
                    elseif ($provider === 'anthropic') $key = $autoConfig['anthropicKey'];
                    elseif ($provider === 'gemini') $key = $autoConfig['geminiKey'];
                    
                    if (empty($key)) {
                        throw new Exception("AI Provider API key is not configured for $provider.");
                    }
                    
                    $promptTemplate = $nodeData['prompt'] ?? '';
                    $prompt = ccrm_interpolate_variables($promptTemplate, $incomingPayload);
                    
                    $response = ccrm_call_llm($provider, $key, $prompt);
                    
                    // Attempt to decode as JSON if next node expects object, or just keep as text
                    $jsonDecoded = json_decode($response, true);
                    $outputPayload = [
                        'text' => $response,
                        'json' => is_array($jsonDecoded) ? $jsonDecoded : null
                    ];
                } elseif ($nodeType === 'action') {
                    $actionType = $nodeData['type'] ?? '';
                    if ($actionType === 'create_lead' || $actionType === 'create_client') {
                        $name = ccrm_interpolate_variables($nodeData['name'] ?? '', $incomingPayload);
                        $city = ccrm_interpolate_variables($nodeData['city'] ?? '', $incomingPayload);
                        $phone = ccrm_interpolate_variables($nodeData['phone'] ?? '', $incomingPayload);
                        $email = ccrm_interpolate_variables($nodeData['email'] ?? '', $incomingPayload);
                        $status = ccrm_interpolate_variables($nodeData['status'] ?? ($actionType === 'create_client' ? 'client' : 'new'), $incomingPayload);
                        $value = (float)ccrm_interpolate_variables($nodeData['value'] ?? '0', $incomingPayload);
                        $owner = ccrm_interpolate_variables($nodeData['owner'] ?? 'Alex', $incomingPayload);
                        $clientType = ($actionType === 'create_client') ? ($nodeData['client_type'] ?? 'person') : 'person';

                        $street = ccrm_interpolate_variables($nodeData['street'] ?? '', $incomingPayload);
                        $postalCode = ccrm_interpolate_variables($nodeData['postal_code'] ?? '', $incomingPayload);
                        $country = ccrm_interpolate_variables($nodeData['country'] ?? 'Slovensko', $incomingPayload);
                        $companyId = ccrm_interpolate_variables($nodeData['company_id'] ?? ($nodeData['ico'] ?? ''), $incomingPayload);
                        $taxId = ccrm_interpolate_variables($nodeData['tax_id'] ?? ($nodeData['dic'] ?? ''), $incomingPayload);
                        $vatId = ccrm_interpolate_variables($nodeData['vat_id'] ?? ($nodeData['ic_dph'] ?? ''), $incomingPayload);
                        $contactPerson = ccrm_interpolate_variables($nodeData['contact_person'] ?? '', $incomingPayload);
                        $website = ccrm_interpolate_variables($nodeData['website'] ?? '', $incomingPayload);
                        
                        $leadId = ($actionType === 'create_client' ? 'client-' : 'lead-') . sprintf('%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                        $stmt = $pdo->prepare("
                            INSERT INTO `leads` (
                              `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `phone`, `email`,
                              `street`, `postal_code`, `country`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`,
                              `created_at`
                            )
                            VALUES (?, ?, ?, ?, ?, 'automation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE())
                        ");
                        $stmt->execute([
                          $leadId, $name, $city, $clientType, $status, $owner, $value, $phone, $email,
                          $street, $postalCode, $country, $companyId, $taxId, $vatId, $contactPerson, $website
                        ]);
                        $outputPayload = [
                          'id' => $leadId, 
                          'name' => $name, 
                          'status' => $status,
                          'client_type' => $clientType,
                          'email' => $email,
                          'phone' => $phone,
                          'city' => $city,
                          'company_id' => $companyId
                        ];
                    } elseif ($actionType === 'create_task') {
                        $title = ccrm_interpolate_variables($nodeData['title'] ?? '', $incomingPayload);
                        $desc = ccrm_interpolate_variables($nodeData['description'] ?? '', $incomingPayload);
                        $owner = ccrm_interpolate_variables($nodeData['owner'] ?? '', $incomingPayload);
                        $priority = $nodeData['priority'] ?? 'medium';
                        $deadlineDays = (int)($nodeData['deadline_days'] ?? 1);
                        
                        $taskId = 'task-' . sprintf('%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                        $deadline = date('Y-m-d', strtotime("+$deadlineDays days"));
                        $relatedLeadId = (isset($incomingPayload['id']) && is_string($incomingPayload['id']) && strpos($incomingPayload['id'], 'lead-') === 0) ? $incomingPayload['id'] : null;
                        
                        $stmt = $pdo->prepare("
                            INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `status`, `owner`, `created_by`, `related_lead_id`, `created_at`)
                            VALUES (?, ?, ?, ?, ?, 'todo', ?, 'Automation', ?, CURRENT_TIMESTAMP())
                        ");
                        $stmt->execute([$taskId, $title, $desc, $priority, $deadline, $owner, $relatedLeadId]);

                        if (!empty($owner)) {
                            $insAss = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
                            $insAss->execute([$taskId, $owner]);
                        }

                        $outputPayload = ['id' => $taskId, 'title' => $title, 'description' => $desc, 'owner' => $owner];
                    } elseif ($actionType === 'send_email') {
                        // Outbound SMTP setup
                        require_once __DIR__ . '/mail_broker.php';
                        $mailSettings = ccrm_load_integrations_config($pdo);
                        
                        $to = ccrm_interpolate_variables($nodeData['to'] ?? '', $incomingPayload);
                        $subject = ccrm_interpolate_variables($nodeData['subject'] ?? '', $incomingPayload);
                        $body = ccrm_interpolate_variables($nodeData['body'] ?? '', $incomingPayload);
                        
                        if (function_exists('send_smtp_email') && !empty($mailSettings['smtpHost'])) {
                            send_smtp_email($mailSettings, $to, $subject, $body);
                            $outputPayload = ['success' => true, 'to' => $to];
                        } else {
                            // Fallback to php mail()
                            $headers = "MIME-Version: 1.0" . "\r\n";
                            $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
                            mail($to, $subject, $body, $headers);
                            $outputPayload = ['success' => true, 'to' => $to, 'mode' => 'fallback'];
                        }
                    } else {
                        // Other actions (Reply to email, SMS, Create document) are stubbed out or simulated for testing
                        $outputPayload = ['action' => $actionType, 'simulated' => true, 'time' => date('Y-m-d H:i:s')];
                    }
                }
            } catch (\Throwable $e) {
                $nodeSuccess = false;
                $status = 'failed';
                $errorMsg = $e->getMessage();
                $outputPayload = ['error' => $errorMsg];
            }
            
            $nodeOutputs[$currNodeId] = $outputPayload;
            
            $executionLog[] = [
                'node_id' => $currNodeId,
                'node_name' => $node['name'] ?? $nodeType,
                'type' => $nodeType,
                'success' => $nodeSuccess,
                'error' => $errorMsg,
                'input' => $incomingPayload,
                'output' => $outputPayload
            ];
            
            if (!$nodeSuccess) {
                break; // Stop execution on error
            }
            
            // Find children / downstream nodes
            $childEdges = array_filter($edges, function($e) use ($currNodeId) {
                return $e['source'] === $currNodeId;
            });
            
            foreach ($childEdges as $edge) {
                // If current node was a condition node, only travel down matching edges
                if ($nodeType === 'condition') {
                    $handle = $edge['sourceHandle'] ?? 'true';
                    $evalResult = (bool)($outputPayload['result'] ?? false);
                    $pathMatches = ($handle === 'true' && $evalResult) || ($handle === 'false' && !$evalResult);
                    if (!$pathMatches) continue;
                }
                $execQueue[] = [$edge['target'], $outputPayload, $newPath];
            }
        }
        
        $durationMs = (int)((microtime(true) - $startTime) * 1000);
        
        // Log the execution
        $logId = 'log-' . sprintf('%04x%04x-%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
        $logStmt = $pdo->prepare("
            INSERT INTO `workflow_logs` (`id`, `workflow_id`, `queue_id`, `status`, `execution_time_ms`, `trigger_event`, `execution_log_json`)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $logStmt->execute([
            $logId,
            $wf['id'],
            $queueId,
            $status,
            $durationMs,
            $wf['trigger_type'],
            json_encode($executionLog, JSON_UNESCAPED_UNICODE)
        ]);
        
        return [
            'status' => $status,
            'duration_ms' => $durationMs,
            'logs' => $executionLog
        ];
    }
}

if (!function_exists('ccrm_process_workflow_queue')) {
    function ccrm_process_workflow_queue($pdo) {
        // Fetch up to 10 pending queue items
        $stmt = $pdo->query("SELECT * FROM `workflow_queue` WHERE `status` = 'pending' ORDER BY `created_at` ASC LIMIT 10");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($items as $item) {
            // Update status to processing
            $update = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'processing' WHERE `id` = ?");
            $update->execute([$item['id']]);
            
            try {
                // Fetch workflow
                $wfStmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `id` = ? AND `is_active` = 1 LIMIT 1");
                $wfStmt->execute([$item['workflow_id']]);
                $wf = $wfStmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$wf) {
                    throw new Exception("Workflow not found or inactive.");
                }
                
                $payload = json_decode($item['payload_json'] ?? '{}', true) ?: [];
                $result = ccrm_execute_workflow($wf, $payload, $pdo, $item['id']);
                
                // Complete queue item
                $complete = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'completed', `processed_at` = CURRENT_TIMESTAMP() WHERE `id` = ?");
                $complete->execute([$item['id']]);
            } catch (\Throwable $e) {
                // Fail queue item
                $fail = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'failed', `error_message` = ?, `processed_at` = CURRENT_TIMESTAMP() WHERE `id` = ?");
                $fail->execute([$e->getMessage(), $item['id']]);
            }
        }
    }
}
