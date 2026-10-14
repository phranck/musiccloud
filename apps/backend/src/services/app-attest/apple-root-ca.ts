/**
 * @file Apple's App Attestation root certificate, pinned.
 *
 * Every attestation the Apple app sends carries a certificate chain that must
 * end at this root. Holding the certificate in the repository means the
 * backend never fetches it at runtime, so no network path can substitute a
 * different one.
 */

/**
 * "Apple App Attestation Root CA" in PEM form, as served at
 * https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem.
 * Apple's App Attest documentation links to its Private PKI page,
 * https://www.apple.com/certificateauthority/private/, which links this file.
 * It is valid from 2020-03-18 until 2045-03-15.
 *
 * Its SHA-256 fingerprint is {@link APPLE_APP_ATTESTATION_ROOT_CA_SHA256}.
 * Neither Apple page publishes a fingerprint, so it is computed from the file
 * as fetched over HTTPS from apple.com, and the unit test checks that this
 * root signs the intermediate in Apple's sample attestation. The test also
 * recomputes the fingerprint, so an edit to the PEM fails it.
 */
export const APPLE_APP_ATTESTATION_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----
`;

/** SHA-256 fingerprint of {@link APPLE_APP_ATTESTATION_ROOT_CA_PEM}, in the colon form `openssl` and Node print. */
export const APPLE_APP_ATTESTATION_ROOT_CA_SHA256 =
  "1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32";
