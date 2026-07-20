# MusicCloud SDK error contract

The public HTTP envelope is converted into an idiomatic typed error in every supported SDK runtime. API errors preserve `code`, safe `message`, `errorId`, HTTP status, string/number context, and retry headers. Empty, malformed, or non-JSON responses are protocol failures without an invented `MC-*` code. Cancellation, timeout, DNS, TLS, and other network failures remain transport errors.

Known programmatic branches have language-native constants and helpers. Future well-formed codes such as `MC-API-3999` retain their exact value, so applications can log and forward them before upgrading the SDK.

## TypeScript

```ts
import { MusiccloudApiError, MusiccloudErrorCode } from "@musiccloud/api-client";

try {
  await api.resolve({ resolveRequest: request });
} catch (error) {
  if (error instanceof MusiccloudApiError) {
    if (error.code === MusiccloudErrorCode.rateLimited) {
      console.warn(error.retryAfterSeconds, error.errorId);
    } else {
      console.error(`Unhandled ${error.code}; report ${error.errorId}`);
    }
  }
}
```

## Python

```python
from musiccloud_api_client import MusiccloudApiError, MusiccloudErrorCode

try:
    api.resolve(resolve_request)
except MusiccloudApiError as error:
    if error.code == MusiccloudErrorCode.RATE_LIMITED:
        print(error.retry_after_seconds, error.error_id)
    else:
        print(f"Unhandled {error.code}; report {error.error_id}")
```

## Swift

```swift
import MusiccloudApiClient

do {
    _ = try await ResolveAPI.resolve(resolveRequest: request)
} catch MusiccloudError.api(let error) {
    if error.code == MusiccloudErrorCode.rateLimited {
        print(error.retryAfterSeconds as Any, error.errorId)
    } else {
        print("Unhandled \(error.code); report \(error.errorId)")
    }
}
```

## PHP

```php
try {
    $client->resolver()->resolve($request);
} catch (MusiccloudApiError $error) {
    if ($error->errorCode === MusiccloudErrorCode::RATE_LIMITED) {
        printf("retry=%s errorId=%s\n", $error->retryAfterSeconds(), $error->errorId);
    } else {
        printf("Unhandled %s; report %s\n", $error->errorCode, $error->errorId);
    }
}
```

## Go

```go
result, err := client.Resolver.Resolve(ctx, request)
var apiErr *musicclouderrors.APIError
if errors.As(err, &apiErr) {
    if errors.Is(err, &musicclouderrors.APIError{Code: musicclouderrors.ErrorCodeRateLimited}) {
        log.Printf("retry=%v errorId=%s", apiErr.RetryAfterSeconds(), apiErr.ErrorID)
    } else {
        log.Printf("Unhandled %s; report %s", apiErr.Code, apiErr.ErrorID)
    }
}
```

## Downstream ownership

- #89 packages the PHP and Go adapters when those generator targets are added.
- #96 reuses these examples in language manpages.
- #101 reuses the same examples and public OpenAPI catalog in the Developer Portal.

The language-neutral test fixture is `fixtures/http-errors.json`. Do not maintain a second envelope or error-code list in downstream documentation.
