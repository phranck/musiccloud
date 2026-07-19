import asyncio
import json
from pathlib import Path
import socket
import ssl
import unittest

from musiccloud_errors import (
    MusiccloudApiError,
    MusiccloudErrorCode,
    MusiccloudProtocolError,
    MusiccloudTransportError,
    classify_musiccloud_transport_error,
    parse_musiccloud_error_response,
)


FIXTURE = json.loads(
    (Path(__file__).parent.parent / "fixtures" / "http-errors.json").read_text()
)


class MusiccloudErrorsTest(unittest.TestCase):
    def test_parses_canonical_and_future_api_envelopes(self):
        for item in FIXTURE["apiErrors"]:
            with self.subTest(item["name"]):
                error = parse_musiccloud_error_response(
                    item["status"], item["headers"], json.dumps(item["body"])
                )
                self.assertIsInstance(error, MusiccloudApiError)
                self.assertEqual(error.code, item["body"]["error"])
                self.assertEqual(error.safe_message, item["body"]["message"])
                self.assertEqual(error.error_id, item["body"]["errorId"])
                self.assertEqual(error.status, item["status"])
                self.assertEqual(error.context, item["body"].get("context"))
                self.assertIn(error.code, str(error))
                self.assertIn(error.error_id, str(error))

    def test_auth_rate_limit_retry_and_redaction_helpers(self):
        auth_item = next(item for item in FIXTURE["apiErrors"] if item["status"] == 401)
        rate_item = next(item for item in FIXTURE["apiErrors"] if item["status"] == 429)
        rate_body = {
            **rate_item["body"],
            "context": {
                **rate_item["body"]["context"],
                "privateKey": "fixture-private-key",
                "refreshToken": "fixture-refresh-token",
            },
        }
        auth = parse_musiccloud_error_response(
            auth_item["status"], auth_item["headers"], json.dumps(auth_item["body"])
        )
        rate_limit = parse_musiccloud_error_response(
            rate_item["status"], rate_item["headers"], json.dumps(rate_body)
        )

        self.assertTrue(auth.is_authentication_error)
        self.assertEqual(auth.code, MusiccloudErrorCode.AUTHENTICATION_REQUIRED)
        self.assertTrue(rate_limit.is_rate_limit_error)
        self.assertTrue(rate_limit.is_retryable)
        self.assertEqual(rate_limit.retry_after_seconds, 42)
        self.assertNotIn("privateKey", rate_limit.context)
        self.assertNotIn("refreshToken", rate_limit.context)
        self.assertEqual(
            rate_limit.retry_headers,
            {
                "retry-after": "42",
                "x-ratelimit-limit": "10",
                "x-ratelimit-remaining": "0",
            },
        )
        debug = str(rate_limit) + repr(rate_limit.retry_headers) + repr(rate_limit.context)
        self.assertNotRegex(
            debug,
            r"fixture-secret|fixture-proof|fixture-key|fixture-private-key|fixture-refresh-token",
        )
        self.assertNotRegex(debug, r"authorization|dpop|api-key")

    def test_protocol_errors_never_invent_an_mc_code_or_echo_the_body(self):
        for item in FIXTURE["protocolErrors"]:
            with self.subTest(item["name"]):
                error = parse_musiccloud_error_response(
                    item["status"], item["headers"], item["body"]
                )
                self.assertIsInstance(error, MusiccloudProtocolError)
                self.assertEqual(error.reason, item["reason"])
                self.assertEqual(error.body_length, len(item["body"].encode("utf-8")))
                self.assertEqual(
                    error.content_type,
                    next(
                        value
                        for key, value in item["headers"].items()
                        if key.lower() == "content-type"
                    ),
                )
                self.assertFalse(hasattr(error, "code"))
                self.assertNotRegex(str(error), r"fixture-secret|Authorization")

    def test_classifies_transport_failures(self):
        class MaxRetryFixture(Exception):
            def __init__(self, reason):
                super().__init__("redacted")
                self.reason = reason

        cases = [
            (asyncio.CancelledError(), "cancelled"),
            (TimeoutError(), "timeout"),
            (socket.gaierror(), "dns"),
            (ssl.SSLError(), "tls"),
            (MaxRetryFixture(socket.gaierror()), "dns"),
            (MaxRetryFixture(ssl.SSLError()), "tls"),
            (OSError(), "network"),
        ]
        for source, kind in cases:
            with self.subTest(kind):
                error = classify_musiccloud_transport_error(source)
                self.assertIsInstance(error, MusiccloudTransportError)
                self.assertEqual(error.kind, kind)
                self.assertFalse(hasattr(error, "code"))


if __name__ == "__main__":
    unittest.main()
