<?php

declare(strict_types=1);

namespace Musiccloud;

use JsonException;
use RuntimeException;
use Throwable;

final class MusiccloudErrorCode
{
    public const AUTHENTICATION_REQUIRED = 'MC-AUTH-0001';
    public const PERMISSION_DENIED = 'MC-AUTH-0002';
    public const RATE_LIMITED = 'MC-API-0003';
    public const REQUEST_TIMEOUT = 'MC-API-0005';
    public const INVALID_REQUEST = 'MC-REQ-0001';
    public const REQUEST_CONFLICT = 'MC-REQ-0002';
    public const RESOURCE_NOT_FOUND = 'MC-RES-0003';
    public const UNEXPECTED_SERVER_ERROR = 'MC-SYS-0001';
    public const BACKEND_UNAVAILABLE = 'MC-SYS-0002';
}

abstract class MusiccloudException extends RuntimeException
{
}

final class MusiccloudApiError extends MusiccloudException
{
    /** @param array<string, string|int|float>|null $context */
    /** @param array<string, string> $retryHeaders */
    public function __construct(
        public readonly string $errorCode,
        string $safeMessage,
        public readonly string $errorId,
        public readonly int $status,
        public readonly ?array $context = null,
        public readonly array $retryHeaders = [],
    ) {
        parent::__construct($safeMessage);
    }

    public function isAuthenticationError(): bool
    {
        return $this->status === 401
            || $this->status === 403
            || str_starts_with($this->errorCode, 'MC-AUTH-');
    }

    public function isRateLimitError(): bool
    {
        return $this->status === 429 || $this->errorCode === MusiccloudErrorCode::RATE_LIMITED;
    }

    public function isRetryable(): bool
    {
        return $this->status === 408 || $this->status === 429 || $this->status >= 500;
    }

    public function retryAfterSeconds(): ?float
    {
        $value = $this->retryHeaders['retry-after']
            ?? $this->context['retryAfterSeconds']
            ?? null;
        if (!is_numeric($value)) {
            return null;
        }
        $parsed = (float) $value;
        return $parsed >= 0 ? $parsed : null;
    }

    public function debugDescription(): string
    {
        return sprintf(
            '%s [%s; errorId=%s; status=%d]',
            $this->getMessage(),
            $this->errorCode,
            $this->errorId,
            $this->status,
        );
    }
}

final class MusiccloudProtocolError extends MusiccloudException
{
    public function __construct(
        public readonly int $status,
        public readonly string $reason,
        public readonly int $bodyLength,
        public readonly ?string $contentType,
    ) {
        parent::__construct(sprintf(
            'MusicCloud returned an invalid error response (%s; status=%d).',
            $reason,
            $status,
        ));
    }
}

final class MusiccloudTransportError extends MusiccloudException
{
    public function __construct(public readonly string $kind)
    {
        parent::__construct(sprintf(
            'The MusicCloud request failed before an HTTP error response was received (%s).',
            $kind,
        ));
    }
}

final class MusiccloudErrors
{
    private const MC_ERROR_CODE_PATTERN = '/^MC-(URL|API|AUTH|RES|DB|CFG|MAP|REQ|SYS)-\d{3,4}$/';
    private const ERROR_ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i';
    private const SENSITIVE_CONTEXT_KEY = '/authorization|dpop|api[-_]?key|private[-_]?key|password|secret|token/i';
    private const RETRY_HEADER_NAMES = [
        'retry-after' => true,
        'ratelimit-limit' => true,
        'ratelimit-remaining' => true,
        'ratelimit-reset' => true,
        'x-ratelimit-limit' => true,
        'x-ratelimit-remaining' => true,
        'x-ratelimit-reset' => true,
    ];

    /** @param array<string, string> $headers */
    public static function parseHttpError(int $status, array $headers, string $body): MusiccloudApiError|MusiccloudProtocolError
    {
        $normalizedHeaders = [];
        foreach ($headers as $name => $value) {
            $normalizedHeaders[strtolower($name)] = (string) $value;
        }
        $contentType = $normalizedHeaders['content-type'] ?? null;
        $bodyLength = strlen($body);
        if (trim($body) === '') {
            return new MusiccloudProtocolError($status, 'empty-body', $bodyLength, $contentType);
        }
        if ($contentType !== null && !str_contains(strtolower($contentType), 'json')) {
            return new MusiccloudProtocolError($status, 'unexpected-content-type', $bodyLength, $contentType);
        }

        try {
            $payload = json_decode($body, false, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return new MusiccloudProtocolError($status, 'invalid-json', $bodyLength, $contentType);
        }
        if (!self::isErrorEnvelope($payload)) {
            return new MusiccloudProtocolError($status, 'invalid-envelope', $bodyLength, $contentType);
        }

        $payloadValues = get_object_vars($payload);
        $context = array_filter(
            isset($payloadValues['context']) ? get_object_vars($payloadValues['context']) : [],
            fn (mixed $_value, string $key): bool => !preg_match(self::SENSITIVE_CONTEXT_KEY, $key),
            ARRAY_FILTER_USE_BOTH,
        );
        $retryHeaders = array_intersect_key($normalizedHeaders, self::RETRY_HEADER_NAMES);

        return new MusiccloudApiError(
            $payloadValues['error'],
            $payloadValues['message'],
            $payloadValues['errorId'],
            $status,
            $context !== [] ? $context : null,
            $retryHeaders,
        );
    }

    public static function classifyTransportError(Throwable $cause): MusiccloudTransportError
    {
        return new MusiccloudTransportError(match ($cause->getCode()) {
            42 => 'cancelled',
            28 => 'timeout',
            6 => 'dns',
            35, 51, 58, 59, 60, 64, 66, 77, 80, 83, 90, 91, 98 => 'tls',
            default => 'network',
        });
    }

    private static function isErrorEnvelope(mixed $payload): bool
    {
        if (!is_object($payload)) {
            return false;
        }
        $payloadValues = get_object_vars($payload);
        if (!isset($payloadValues['error'], $payloadValues['message'], $payloadValues['errorId'])) {
            return false;
        }
        if (!is_string($payloadValues['error']) || !preg_match(self::MC_ERROR_CODE_PATTERN, $payloadValues['error'])) {
            return false;
        }
        if (!is_string($payloadValues['message']) || $payloadValues['message'] === '') {
            return false;
        }
        if (!is_string($payloadValues['errorId']) || !preg_match(self::ERROR_ID_PATTERN, $payloadValues['errorId'])) {
            return false;
        }
        if (!property_exists($payload, 'context')) {
            return true;
        }
        if (!is_object($payloadValues['context'])) {
            return false;
        }
        foreach (get_object_vars($payloadValues['context']) as $key => $value) {
            if (!is_string($key) || (!is_string($value) && !is_int($value) && !is_float($value))) {
                return false;
            }
        }
        return true;
    }
}
