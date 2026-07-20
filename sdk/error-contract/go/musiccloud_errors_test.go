package musicclouderrors

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"testing"
)

type fixtureFile struct {
	APIErrors      []apiFixture      `json:"apiErrors"`
	ProtocolErrors []protocolFixture `json:"protocolErrors"`
}

type apiFixture struct {
	Name    string            `json:"name"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    struct {
		Error   string         `json:"error"`
		Message string         `json:"message"`
		ErrorID string         `json:"errorId"`
		Context map[string]any `json:"context"`
	} `json:"body"`
}

type protocolFixture struct {
	Name    string            `json:"name"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Reason  string            `json:"reason"`
}

func loadFixture(t *testing.T) fixtureFile {
	t.Helper()
	data, err := os.ReadFile("../fixtures/http-errors.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture fixtureFile
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func fixtureHeaders(values map[string]string) http.Header {
	headers := http.Header{}
	for name, value := range values {
		headers.Set(name, value)
	}
	return headers
}

func TestParsesCanonicalAndFutureAPIEnvelopes(t *testing.T) {
	for _, item := range loadFixture(t).APIErrors {
		t.Run(item.Name, func(t *testing.T) {
			body, err := json.Marshal(item.Body)
			if err != nil {
				t.Fatal(err)
			}
			parsed := ParseHTTPError(item.Status, fixtureHeaders(item.Headers), body)
			apiError, ok := parsed.(*APIError)
			if !ok {
				t.Fatalf("expected APIError, got %T", parsed)
			}
			if apiError.Code != item.Body.Error || apiError.SafeMessage != item.Body.Message || apiError.ErrorID != item.Body.ErrorID || apiError.Status != item.Status {
				t.Fatalf("fields were not preserved: %#v", apiError)
			}
			if !regexp.MustCompile(regexp.QuoteMeta(apiError.Code)).MatchString(apiError.Error()) || !regexp.MustCompile(regexp.QuoteMeta(apiError.ErrorID)).MatchString(apiError.Error()) {
				t.Fatalf("safe error string lacks correlation fields: %s", apiError.Error())
			}
		})
	}
}

func TestAuthRateLimitRetryAndRedactionHelpers(t *testing.T) {
	fixture := loadFixture(t)
	var authItem, rateItem apiFixture
	for _, item := range fixture.APIErrors {
		if item.Status == 401 {
			authItem = item
		}
		if item.Status == 429 {
			rateItem = item
		}
	}
	rateItem.Body.Context["privateKey"] = "fixture-private-key"
	rateItem.Body.Context["refreshToken"] = "fixture-refresh-token"
	authBody, _ := json.Marshal(authItem.Body)
	rateBody, _ := json.Marshal(rateItem.Body)
	auth := ParseHTTPError(401, fixtureHeaders(authItem.Headers), authBody).(*APIError)
	rate := ParseHTTPError(429, fixtureHeaders(rateItem.Headers), rateBody).(*APIError)

	if !auth.IsAuthenticationError() || auth.Code != ErrorCodeAuthenticationRequired {
		t.Fatal("authentication helpers failed")
	}
	if !rate.IsRateLimitError() || !rate.IsRetryable() || rate.RetryAfterSeconds() != 42 {
		t.Fatal("rate-limit helpers failed")
	}
	if _, present := rate.Context["privateKey"]; present {
		t.Fatal("private key leaked through context")
	}
	if _, present := rate.Context["refreshToken"]; present {
		t.Fatal("refresh token leaked through context")
	}
	if !errors.Is(rate, &APIError{Code: ErrorCodeRateLimited}) {
		t.Fatal("errors.Is code matching failed")
	}
	expected := map[string]string{
		"retry-after":           "42",
		"x-ratelimit-limit":     "10",
		"x-ratelimit-remaining": "0",
	}
	if stringMapJSON(rate.RetryHeaders) != stringMapJSON(expected) {
		t.Fatalf("unexpected retry headers: %#v", rate.RetryHeaders)
	}
	debug := rate.Error() + stringMapJSON(rate.RetryHeaders) + fmt.Sprint(rate.Context)
	if regexp.MustCompile(`(?i)fixture-secret|fixture-proof|fixture-key|fixture-private-key|fixture-refresh-token|authorization|dpop|api-key|private-key|token`).MatchString(debug) {
		t.Fatalf("sensitive data leaked: %s", debug)
	}
}

func TestProtocolErrorsDoNotInventCodesOrEchoBodies(t *testing.T) {
	for _, item := range loadFixture(t).ProtocolErrors {
		t.Run(item.Name, func(t *testing.T) {
			parsed := ParseHTTPError(item.Status, fixtureHeaders(item.Headers), []byte(item.Body))
			protocolError, ok := parsed.(*ProtocolError)
			if !ok {
				t.Fatalf("expected ProtocolError, got %T", parsed)
			}
			if protocolError.Reason != item.Reason {
				t.Fatalf("expected %s, got %s", item.Reason, protocolError.Reason)
			}
			if protocolError.BodyLength != len([]byte(item.Body)) || protocolError.ContentType != item.Headers["content-type"] {
				t.Fatalf("protocol metadata was not preserved: %#v", protocolError)
			}
			if regexp.MustCompile(`fixture-secret|Authorization|MC-`).MatchString(protocolError.Error()) {
				t.Fatalf("protocol error leaked response data: %s", protocolError.Error())
			}
		})
	}
}

func TestClassifiesTransportFailures(t *testing.T) {
	cases := []struct {
		source error
		kind   TransportKind
	}{
		{context.Canceled, TransportCancelled},
		{context.DeadlineExceeded, TransportTimeout},
		{&net.DNSError{}, TransportDNS},
		{tls.RecordHeaderError{}, TransportTLS},
		{errors.New("fixture-secret"), TransportNetwork},
	}
	for _, item := range cases {
		error := ClassifyTransportError(item.source)
		if error.Kind != item.kind {
			t.Fatalf("expected %s, got %s", item.kind, error.Kind)
		}
		if regexp.MustCompile(`fixture-secret|MC-`).MatchString(error.Error()) {
			t.Fatalf("transport error leaked source: %s", error.Error())
		}
	}
}

func stringMapJSON(value map[string]string) string {
	data, _ := json.Marshal(value)
	return string(data)
}
