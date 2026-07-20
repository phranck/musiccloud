<?php

declare(strict_types=1);

require __DIR__ . '/MusiccloudErrors.php';

use Musiccloud\MusiccloudApiError;
use Musiccloud\MusiccloudErrorCode;
use Musiccloud\MusiccloudErrors;
use Musiccloud\MusiccloudException;
use Musiccloud\MusiccloudProtocolError;
use Musiccloud\MusiccloudTransportError;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$fixture = json_decode(
    file_get_contents(__DIR__ . '/../fixtures/http-errors.json'),
    true,
    flags: JSON_THROW_ON_ERROR,
);

foreach ($fixture['apiErrors'] as $item) {
    $error = MusiccloudErrors::parseHttpError(
        $item['status'],
        $item['headers'],
        json_encode($item['body'], JSON_THROW_ON_ERROR),
    );
    check($error instanceof MusiccloudApiError, $item['name']);
    check($error->errorCode === $item['body']['error'], $item['name'] . ': code');
    check($error->getMessage() === $item['body']['message'], $item['name'] . ': message');
    check($error->errorId === $item['body']['errorId'], $item['name'] . ': errorId');
    check($error->status === $item['status'], $item['name'] . ': status');
    check($error->context === ($item['body']['context'] ?? null), $item['name'] . ': context');
    check(str_contains($error->debugDescription(), $error->errorCode), $item['name'] . ': debug code');
    check(str_contains($error->debugDescription(), $error->errorId), $item['name'] . ': debug errorId');
}

$authItem = array_values(array_filter($fixture['apiErrors'], fn ($item) => $item['status'] === 401))[0];
$rateItem = array_values(array_filter($fixture['apiErrors'], fn ($item) => $item['status'] === 429))[0];
$rateBody = $rateItem['body'];
$rateBody['context']['privateKey'] = 'fixture-private-key';
$rateBody['context']['refreshToken'] = 'fixture-refresh-token';
$auth = MusiccloudErrors::parseHttpError(401, $authItem['headers'], json_encode($authItem['body'], JSON_THROW_ON_ERROR));
$rate = MusiccloudErrors::parseHttpError(429, $rateItem['headers'], json_encode($rateBody, JSON_THROW_ON_ERROR));
check($auth->isAuthenticationError(), 'auth helper');
check($auth->errorCode === MusiccloudErrorCode::AUTHENTICATION_REQUIRED, 'auth constant');
check($rate->isRateLimitError(), 'rate helper');
check($rate->isRetryable(), 'retry helper');
check($rate->retryAfterSeconds() === 42.0, 'retry delay');
check(!isset($rate->context['privateKey']), 'private key redaction');
check(!isset($rate->context['refreshToken']), 'refresh token redaction');
check($rate->retryHeaders === [
    'retry-after' => '42',
    'x-ratelimit-limit' => '10',
    'x-ratelimit-remaining' => '0',
], 'retry headers');
check(!preg_match('/fixture-secret|fixture-proof|fixture-key|fixture-private-key|fixture-refresh-token|authorization|dpop|api-key|private-key|token/i', $rate->debugDescription() . json_encode($rate->retryHeaders) . json_encode($rate->context)), 'redaction');

foreach ($fixture['protocolErrors'] as $item) {
    $error = MusiccloudErrors::parseHttpError($item['status'], $item['headers'], $item['body']);
    check($error instanceof MusiccloudProtocolError, $item['name']);
    check($error instanceof MusiccloudException, $item['name'] . ': hierarchy');
    check($error->reason === $item['reason'], $item['name'] . ': reason');
    check($error->bodyLength === strlen($item['body']), $item['name'] . ': body length');
    check($error->contentType === $item['headers']['content-type'], $item['name'] . ': content type');
    check(!property_exists($error, 'errorCode'), $item['name'] . ': no MC code');
    check(!preg_match('/fixture-secret|Authorization/', $error->getMessage()), $item['name'] . ': redaction');
}

foreach ([42 => 'cancelled', 28 => 'timeout', 6 => 'dns', 59 => 'tls', 60 => 'tls', 7 => 'network'] as $curlCode => $kind) {
    $error = MusiccloudErrors::classifyTransportError(new RuntimeException('fixture-secret', $curlCode));
    check($error instanceof MusiccloudTransportError, $kind);
    check($error->kind === $kind, $kind . ': classification');
    check(!str_contains($error->getMessage(), 'fixture-secret'), $kind . ': redaction');
}

echo "Musiccloud PHP error contract: OK\n";
