<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
header("Content-Type: application/json; charset=UTF-8");

$url = "https://www.hoonstation.com/top_hagreen";

// Define a realistic User-Agent to avoid scraping blocks
$options = [
    "http" => [
        "method" => "GET",
        "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n"
    ]
];
$context = stream_context_create($options);

try {
    // Disable error reporting for this block to catch warnings gracefully
    $content = @file_get_contents($url, false, $context);
    
    if ($content === false) {
        // Fallback using curl if file_get_contents is disabled or failed
        if (function_exists('curl_init')) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $content = curl_exec($ch);
            curl_close($ch);
        }
    }

    if ($content === false || empty($content)) {
        http_response_code(502);
        echo json_encode(["error" => "Failed to connect to Hoonstation. Please check internet connection."]);
        exit;
    }

    echo json_encode(["contents" => $content]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
?>
