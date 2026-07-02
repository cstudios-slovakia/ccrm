<?php
require_once __DIR__ . '/api/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    // SECURITY: only authenticated users may upload files.
    ccrm_require_auth();

    if (!isset($_FILES['file']) || !isset($_POST['eventId'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing file or eventId.']);
        exit;
    }

    $file = $_FILES['file'];

    // Surface a clear message when the upload was rejected for exceeding PHP size limits
    // instead of the generic "failed to save" that follows.
    if (isset($file['error']) && $file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        $msg = ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE)
            ? 'File is too large for the server upload limit.'
            : 'File upload error (code ' . $file['error'] . ').';
        echo json_encode(['success' => false, 'error' => $msg]);
        exit;
    }

    // Keep hyphens so the stored name matches client-generated event ids (which contain "-").
    $eventId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_POST['eventId']);
    $fileName = basename($file['name']);

    // Reject executable / script extensions that could be run by the web server.
    $blocked = ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'pht', 'phar', 'cgi', 'pl', 'asp', 'aspx', 'jsp', 'sh', 'htaccess'];
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if (in_array($ext, $blocked, true)) {
        http_response_code(415);
        echo json_encode(['success' => false, 'error' => 'File type not allowed.']);
        exit;
    }

    // Ensure uploads directory exists
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0775, true);
    }

    // Prefix file name with eventId to keep it unique
    $targetPath = $uploadDir . $eventId . '_' . $fileName;

    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        $extractedText = ccrm_extract_text_from_file($targetPath, $fileName);
        
        // Limit length to avoid DB overflow in TEXT column (max 64KB)
        if (mb_strlen($extractedText) > 60000) {
            $extractedText = mb_substr($extractedText, 0, 60000) . '... [TRUNCATED]';
        }

        echo json_encode([
            'success' => true,
            'fileName' => $fileName,
            // Return the actual stored path so the client stores it and never has to
            // reconstruct the URL from an event id (which may be mutated after upload).
            'filePath' => '/uploads/' . $eventId . '_' . $fileName,
            'extractedText' => $extractedText
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file.']);
    }
}

/**
 * Extracts plain text from the uploaded file based on its extension.
 */
function ccrm_extract_text_from_file($filePath, $fileName) {
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    
    if ($ext === 'txt') {
        return @file_get_contents($filePath) ?: '';
    }
    
    if ($ext === 'pdf') {
        return ccrm_extract_pdf_text($filePath);
    }
    
    if ($ext === 'docx') {
        return ccrm_extract_docx_text($filePath);
    }
    
    if ($ext === 'pptx') {
        return ccrm_extract_pptx_text($filePath);
    }
    
    if (in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
        // OCR fallback: try running tesseract if available
        $tesseract = @shell_exec('which tesseract');
        if (!empty($tesseract)) {
            $outputFile = tempnam(sys_get_temp_dir(), 'ocr_');
            @shell_exec('tesseract ' . escapeshellarg($filePath) . ' ' . escapeshellarg($outputFile) . ' --dpi 150 > /dev/null 2>&1');
            $txtPath = $outputFile . '.txt';
            if (file_exists($txtPath)) {
                $text = @file_get_contents($txtPath) ?: '';
                @unlink($outputFile);
                @unlink($txtPath);
                return $text;
            }
            @unlink($outputFile);
        }
    }
    
    return '';
}

/**
 * Native Word Document (.docx) text extractor via unzipping word/document.xml.
 */
function ccrm_extract_docx_text($filePath) {
    if (!class_exists('ZipArchive')) {
        return '';
    }
    $zip = new ZipArchive();
    if ($zip->open($filePath) === true) {
        $xmlContent = $zip->getFromName('word/document.xml');
        $zip->close();
        if ($xmlContent) {
            $text = strip_tags($xmlContent);
            return html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    return '';
}

/**
 * Native PowerPoint Document (.pptx) text extractor via unzipping slide contents.
 */
function ccrm_extract_pptx_text($filePath) {
    if (!class_exists('ZipArchive')) {
        return '';
    }
    $zip = new ZipArchive();
    if ($zip->open($filePath) === true) {
        $text = '';
        // Loop through slides slide1.xml, slide2.xml, etc. (up to a reasonable limit, e.g. 50 slides)
        for ($i = 1; $i <= 50; $i++) {
            $slideXml = $zip->getFromName("ppt/slides/slide{$i}.xml");
            if (!$slideXml) break;
            $text .= strip_tags($slideXml) . " ";
        }
        $zip->close();
        return html_entity_decode(trim($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
    return '';
}

/**
 * Pure PHP text stream extractor for PDF files.
 */
function ccrm_extract_pdf_text($filePath) {
    $content = @file_get_contents($filePath);
    if (empty($content)) {
        return '';
    }

    $texts = [];
    $objs = explode('endobj', $content);
    foreach ($objs as $obj) {
        // Locate stream blocks
        if (preg_match('/stream[\r\n]+(.*?)[\r\n]+endstream/is', $obj, $streamMatch)) {
            $stream = $streamMatch[1];
            // Decode FlateDecode streams
            if (strpos($obj, '/FlateDecode') !== false) {
                $data = @gzuncompress($stream);
                if ($data === false) {
                    $data = @gzuncompress(substr($stream, 1));
                }
                if ($data === false) {
                    $data = @gzuncompress(substr($stream, 2));
                }
                if ($data !== false) {
                    $stream = $data;
                }
            }
            
            // Extract parenthesized strings inside Tj / TJ operators
            preg_match_all('/(?<=\()([^\)]*)(?=\))/s', $stream, $textMatches);
            if (!empty($textMatches[0])) {
                foreach ($textMatches[0] as $txt) {
                    // Skip short markers, PDF codes, or fonts
                    $txt = trim($txt);
                    if ($txt === '' || strpos($txt, '/') === 0 || strpos($txt, 'Identity-H') !== false) {
                        continue;
                    }
                    // Clean up octal sequences & escapes
                    $txt = preg_replace_callback('/\\\\([0-7]{3})/', function($m) {
                        return chr(octdec($m[1]));
                    }, $txt);
                    $txt = str_replace(['\\(', '\\)', '\\\\'], ['(', ')', '\\'], $txt);
                    $texts[] = $txt;
                }
            }
        }
    }
    
    return implode(' ', $texts);
}

