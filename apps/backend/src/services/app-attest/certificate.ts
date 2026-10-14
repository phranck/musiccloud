/**
 * @file Reads the Apple-specific extensions of an App Attest credential
 * certificate.
 *
 * Node's `X509Certificate` verifies signatures and validity but exposes no
 * arbitrary extensions, so the DER is walked here with `asn1js`. Only the
 * structure Apple documents is accepted: an extension whose value is a
 * sequence holding a single octet string, possibly inside context-specific
 * wrappers. Anything else reads as absent or throws.
 */
import * as asn1js from "asn1js";

/** OID of the extension holding the attestation nonce. */
export const NONCE_EXTENSION_OID = "1.2.840.113635.100.8.2";

/** OID of the extension holding the macOS access-control policy of the key (`aclBlob`). */
export const ACL_BLOB_EXTENSION_OID = "1.2.840.113635.100.8.6";

/**
 * OID of the extension that describes the device's operating system. Apple
 * does not document it. Its sample attestation, made on iOS, holds the string
 * `iphoneos` under context tag 1026, which is the only part read here.
 */
export const OPERATING_SYSTEM_EXTENSION_OID = "1.2.840.113635.100.8.7";

/** Context tag inside {@link OPERATING_SYSTEM_EXTENSION_OID} under which the sample names its platform. */
const OPERATING_SYSTEM_PLATFORM_TAG = 1026;

/** ASN.1 tag class number asn1js uses for context-specific tags. */
const CONTEXT_SPECIFIC_TAG_CLASS = 3;

/** Context tag of the `extensions` field in a TBSCertificate. */
const EXTENSIONS_FIELD_TAG = 3;

/** Why a certificate's extension could not be read. */
export class CertificateExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificateExtensionError";
  }
}

/**
 * Decodes DER bytes into exactly one ASN.1 value.
 *
 * @param bytes - The DER encoding.
 * @returns The decoded value.
 * @throws {CertificateExtensionError} When the bytes do not decode or leave a remainder.
 */
function decodeDer(bytes: Uint8Array): asn1js.AsnType {
  const decoded = asn1js.fromBER(bytes);
  if (decoded.offset === -1 || decoded.offset !== bytes.byteLength) {
    throw new CertificateExtensionError("The DER encoding is malformed.");
  }
  return decoded.result;
}

/**
 * Returns the raw value of one extension of a certificate.
 *
 * @param certificateDer - The certificate in DER.
 * @param oid - The extension's dotted OID.
 * @returns The bytes of the extension's `extnValue`, or `null` when the
 *   certificate has no such extension.
 * @throws {CertificateExtensionError} When the certificate is not shaped like X.509.
 */
export function readCertificateExtension(certificateDer: Uint8Array, oid: string): Buffer | null {
  const certificate = decodeDer(certificateDer);
  const tbsCertificate = certificate instanceof asn1js.Sequence ? certificate.valueBlock.value[0] : undefined;
  if (!(tbsCertificate instanceof asn1js.Sequence)) {
    throw new CertificateExtensionError("The certificate has no TBSCertificate.");
  }

  const extensionsField = tbsCertificate.valueBlock.value.find(
    (field) =>
      field.idBlock.tagClass === CONTEXT_SPECIFIC_TAG_CLASS && field.idBlock.tagNumber === EXTENSIONS_FIELD_TAG,
  );
  if (!(extensionsField instanceof asn1js.Constructed)) return null;
  const extensions = extensionsField.valueBlock.value[0];
  if (!(extensions instanceof asn1js.Sequence)) {
    throw new CertificateExtensionError("The certificate's extensions are not a sequence.");
  }

  for (const extension of extensions.valueBlock.value) {
    if (!(extension instanceof asn1js.Sequence)) continue;
    const parts = extension.valueBlock.value;
    const extensionId = parts[0];
    const extensionValue = parts[parts.length - 1];
    if (
      extensionId instanceof asn1js.ObjectIdentifier &&
      extensionId.valueBlock.toString() === oid &&
      extensionValue instanceof asn1js.OctetString
    ) {
      return Buffer.from(extensionValue.valueBlock.valueHexView);
    }
  }
  return null;
}

/**
 * Extracts the single octet string a DER-encoded sequence holds, which is how
 * Apple encodes both the nonce and the `aclBlob`. The nonce sits inside a
 * `[1]` wrapper and the `aclBlob` inside a `[3]` wrapper, so any number of
 * context-specific wrappers with exactly one element each is followed.
 *
 * @param extensionValue - The extension's `extnValue` bytes.
 * @returns The octet string's content.
 * @throws {CertificateExtensionError} When the value holds anything other than one octet string.
 */
export function readSingleOctetString(extensionValue: Uint8Array): Buffer {
  const sequence = decodeDer(extensionValue);
  if (!(sequence instanceof asn1js.Sequence) || sequence.valueBlock.value.length !== 1) {
    throw new CertificateExtensionError("The extension value is not a sequence of one element.");
  }

  let element = sequence.valueBlock.value[0];
  while (
    element instanceof asn1js.Constructed &&
    element.idBlock.tagClass === CONTEXT_SPECIFIC_TAG_CLASS &&
    element.valueBlock.value.length === 1
  ) {
    element = element.valueBlock.value[0];
  }
  if (!(element instanceof asn1js.OctetString)) {
    throw new CertificateExtensionError("The extension value holds no single octet string.");
  }
  return Buffer.from(element.valueBlock.valueHexView);
}

/**
 * Reads the platform name the operating-system extension carries, such as
 * `iphoneos` in Apple's iOS sample.
 *
 * @param extensionValue - The `extnValue` of {@link OPERATING_SYSTEM_EXTENSION_OID}.
 * @returns The platform name, or `null` when the field is missing or not text.
 */
export function readAttestedPlatform(extensionValue: Uint8Array): string | null {
  let sequence: asn1js.AsnType;
  try {
    sequence = decodeDer(extensionValue);
  } catch {
    return null;
  }
  if (!(sequence instanceof asn1js.Sequence)) return null;

  const field = sequence.valueBlock.value.find(
    (entry) =>
      entry.idBlock.tagClass === CONTEXT_SPECIFIC_TAG_CLASS &&
      entry.idBlock.tagNumber === OPERATING_SYSTEM_PLATFORM_TAG,
  );
  const value = field instanceof asn1js.Constructed ? field.valueBlock.value[0] : undefined;
  if (!(value instanceof asn1js.OctetString)) return null;
  return Buffer.from(value.valueBlock.valueHexView).toString("utf8");
}
