package musicclouderrors

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const (
	ErrorCodeAuthenticationRequired = "MC-AUTH-0001"
	ErrorCodePermissionDenied       = "MC-AUTH-0002"
	ErrorCodeRateLimited            = "MC-API-0003"
	ErrorCodeRequestTimeout         = "MC-API-0005"
	ErrorCodeInvalidRequest         = "MC-REQ-0001"
	ErrorCodeRequestConflict        = "MC-REQ-0002"
	ErrorCodeResourceNotFound       = "MC-RES-0003"
	ErrorCodeUnexpectedServerError  = "MC-SYS-0001"
	ErrorCodeBackendUnavailable     = "MC-SYS-0002"
)

var (
	errorCodePattern = regexp.MustCompile(`^MC-(URL|API|AUTH|RES|DB|CFG|MAP|REQ|SYS)-\d{3,4}$`)
	errorIDPattern   = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	sensitiveKey     = regexp.MustCompile(`(?i)authorization|dpop|api[-_]?key|private[-_]?key|password|secret|token`)
)

var retryHeaderNames = []string{
	"retry-after",
	"ratelimit-limit",
	"ratelimit-remaining",
	"ratelimit-reset",
	"x-ratelimit-limit",
	"x-ratelimit-remaining",
	"x-ratelimit-reset",
}

type APIError struct {
	Code         string
	SafeMessage  string
	ErrorID      string
	Status       int
	Context      map[string]any
	RetryHeaders map[string]string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s [%s; errorId=%s; status=%d]", e.SafeMessage, e.Code, e.ErrorID, e.Status)
}

func (e *APIError) Is(target error) bool {
	other, ok := target.(*APIError)
	return ok && other.Code != "" && e.Code == other.Code
}

func (e *APIError) IsAuthenticationError() bool {
	return e.Status == http.StatusUnauthorized || e.Status == http.StatusForbidden || strings.HasPrefix(e.Code, "MC-AUTH-")
}

func (e *APIError) IsRateLimitError() bool {
	return e.Status == http.StatusTooManyRequests || e.Code == ErrorCodeRateLimited
}

func (e *APIError) IsRetryable() bool {
	return e.Status == http.StatusRequestTimeout || e.Status == http.StatusTooManyRequests || e.Status >= 500
}

func (e *APIError) RetryAfterSeconds() float64 {
	value := e.RetryHeaders["retry-after"]
	if value == "" {
		if contextValue, ok := e.Context["retryAfterSeconds"]; ok {
			value = fmt.Sprint(contextValue)
		}
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}

type ProtocolError struct {
	Status      int
	Reason      string
	BodyLength  int
	ContentType string
}

func (e *ProtocolError) Error() string {
	return fmt.Sprintf("MusicCloud returned an invalid error response (%s; status=%d).", e.Reason, e.Status)
}

type TransportKind string

const (
	TransportCancelled TransportKind = "cancelled"
	TransportTimeout   TransportKind = "timeout"
	TransportDNS       TransportKind = "dns"
	TransportTLS       TransportKind = "tls"
	TransportNetwork   TransportKind = "network"
)

type TransportError struct {
	Kind TransportKind
}

func (e *TransportError) Error() string {
	return fmt.Sprintf("The MusicCloud request failed before an HTTP error response was received (%s).", e.Kind)
}

func ParseHTTPError(status int, headers http.Header, body []byte) error {
	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		return &ProtocolError{Status: status, Reason: "empty-body", BodyLength: len(body), ContentType: headers.Get("Content-Type")}
	}
	if contentType := headers.Get("Content-Type"); contentType != "" && !strings.Contains(strings.ToLower(contentType), "json") {
		return &ProtocolError{Status: status, Reason: "unexpected-content-type", BodyLength: len(body), ContentType: contentType}
	}
	if !json.Valid(trimmedBody) {
		return &ProtocolError{Status: status, Reason: "invalid-json", BodyLength: len(body), ContentType: headers.Get("Content-Type")}
	}

	var envelope struct {
		Error   string         `json:"error"`
		Message string         `json:"message"`
		ErrorID string         `json:"errorId"`
		Context map[string]any `json:"context"`
	}
	if err := json.Unmarshal(trimmedBody, &envelope); err != nil || !validEnvelope(envelope.Error, envelope.Message, envelope.ErrorID, envelope.Context) {
		return &ProtocolError{Status: status, Reason: "invalid-envelope", BodyLength: len(body), ContentType: headers.Get("Content-Type")}
	}

	contextValues := make(map[string]any)
	for key, value := range envelope.Context {
		if !sensitiveKey.MatchString(key) {
			contextValues[key] = value
		}
	}
	if len(contextValues) == 0 {
		contextValues = nil
	}
	retryHeaders := make(map[string]string)
	for _, name := range retryHeaderNames {
		if value := headers.Get(name); value != "" {
			retryHeaders[name] = value
		}
	}

	return &APIError{
		Code:         envelope.Error,
		SafeMessage:  envelope.Message,
		ErrorID:      envelope.ErrorID,
		Status:       status,
		Context:      contextValues,
		RetryHeaders: retryHeaders,
	}
}

func ClassifyTransportError(source error) *TransportError {
	if errors.Is(source, context.Canceled) {
		return &TransportError{Kind: TransportCancelled}
	}
	if errors.Is(source, context.DeadlineExceeded) {
		return &TransportError{Kind: TransportTimeout}
	}
	var dnsError *net.DNSError
	if errors.As(source, &dnsError) {
		return &TransportError{Kind: TransportDNS}
	}
	var recordHeaderError tls.RecordHeaderError
	var certificateError *tls.CertificateVerificationError
	if errors.As(source, &recordHeaderError) || errors.As(source, &certificateError) {
		return &TransportError{Kind: TransportTLS}
	}
	return &TransportError{Kind: TransportNetwork}
}

func validEnvelope(code, message, errorID string, contextValues map[string]any) bool {
	if !errorCodePattern.MatchString(code) || message == "" || !errorIDPattern.MatchString(errorID) {
		return false
	}
	for _, value := range contextValues {
		switch value.(type) {
		case string, float64:
		default:
			return false
		}
	}
	return true
}
