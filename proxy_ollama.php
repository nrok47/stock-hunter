<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(200); exit; }

$body    = file_get_contents("php://input");
$data    = json_decode($body, true);
$apiKey  = $data["apiKey"]  ?? "";
$baseUrl = $data["baseUrl"] ?? "https://api.ollama.com";
$payload = $data["payload"] ?? [];

$url = rtrim($baseUrl, "/") . "/v1/chat/completions";

$headers = ["Content-Type: application/json"];
if ($apiKey) {
    $headers[] = "Authorization: Bearer $apiKey";
    $headers[] = "x-api-key: $apiKey";
}

// Stream response back to browser
header("Content-Type: text/event-stream");
header("Cache-Control: no-cache");
header("X-Accel-Buffering: no");

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_WRITEFUNCTION  => function($ch, $chunk) {
        echo $chunk;
        if (ob_get_level()) ob_flush();
        flush();
        return strlen($chunk);
    },
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT        => 120,
]);

$responseBody = "";
curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) use (&$responseBody) {
    $responseBody .= $chunk;
    echo $chunk;
    if (ob_get_level()) ob_flush();
    flush();
    return strlen($chunk);
});

$ok = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);

if (!$ok || $httpCode >= 400) {
    $errDetail = $curlErr ?: "HTTP $httpCode — body: " . substr($responseBody, 0, 300);
    echo "data: " . json_encode(["error" => $errDetail]) . "\n\n";
}
curl_close($ch);
