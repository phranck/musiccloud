/**
 * @file Reads the authenticator data App Attest puts into attestations and
 * assertions.
 *
 * The layout follows WebAuthn: a 32-byte RP ID hash, one byte of flags and a
 * big-endian 32-bit counter. An attestation continues with the attested
 * credential, so the `aaguid`, the credential id and the COSE public key, and
 * either may end with a CBOR map of extensions. Apple's sample attestation
 * carries that map without setting the extension flag, so its presence is read
 * from the remaining bytes rather than from the flag.
 */
import { type CBORType, decodePartialCBOR } from "@levischuck/tiny-cbor";

const RP_ID_HASH_LENGTH = 32;
const FLAGS_OFFSET = RP_ID_HASH_LENGTH;
const COUNTER_OFFSET = FLAGS_OFFSET + 1;
const COUNTER_LENGTH = 4;
/** Where the attested credential starts, which is also the full length of an assertion's fixed part. */
const FIXED_PART_LENGTH = COUNTER_OFFSET + COUNTER_LENGTH;
const AAGUID_LENGTH = 16;
const CREDENTIAL_ID_LENGTH_SIZE = 2;

/** The extension that names the launch validation category of the app. */
const VALIDATION_CATEGORY_EXTENSION = "apple_validation_category_01";
/** The extension that names the bundle version of the app. */
const BUNDLE_VERSION_EXTENSION = "apple_bundle_version_01";

/** Why authenticator data could not be read. */
export class AuthenticatorDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticatorDataError";
  }
}

/**
 * The two Apple extensions, each absent when the operating system did not
 * send it.
 *
 * @property validationCategory - The launch category, see `AppAttestValidationCategory`.
 * @property bundleVersion - The app's bundle version as Apple read it.
 */
export interface AppAttestExtensions {
  validationCategory?: number;
  bundleVersion?: string;
}

/** The fields every App Attest authenticator data carries. */
export interface AuthenticatorData {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
  extensions: AppAttestExtensions;
}

/**
 * The attested credential an attestation's authenticator data adds.
 *
 * @property aaguid - 16 bytes that name the App Attest environment.
 * @property credentialId - The key id, the SHA-256 of the public key.
 * @property coseKey - The public key as COSE decoded it, a map of integer labels.
 */
export interface AttestedAuthenticatorData extends AuthenticatorData {
  aaguid: Buffer;
  credentialId: Buffer;
  coseKey: Map<string | number, CBORType>;
}

/**
 * Reads an attestation's authenticator data, attested credential included.
 *
 * @param bytes - `authData` from the attestation object.
 * @returns The parsed fields.
 * @throws {AuthenticatorDataError} When the bytes are too short, the COSE key
 *   is not a map, or anything other than an extension map follows it.
 */
export function readAttestationAuthenticatorData(bytes: Uint8Array): AttestedAuthenticatorData {
  const data = Buffer.from(bytes);
  const fixed = readFixedPart(data);

  const aaguidEnd = FIXED_PART_LENGTH + AAGUID_LENGTH;
  if (data.length < aaguidEnd + CREDENTIAL_ID_LENGTH_SIZE) {
    throw new AuthenticatorDataError("Authenticator data ends before the attested credential.");
  }
  const aaguid = data.subarray(FIXED_PART_LENGTH, aaguidEnd);
  const credentialIdLength = data.readUInt16BE(aaguidEnd);
  const credentialIdStart = aaguidEnd + CREDENTIAL_ID_LENGTH_SIZE;
  const credentialIdEnd = credentialIdStart + credentialIdLength;
  if (data.length <= credentialIdEnd) {
    throw new AuthenticatorDataError("Authenticator data ends before the credential public key.");
  }
  const credentialId = data.subarray(credentialIdStart, credentialIdEnd);

  const [coseKey, coseLength] = decodeAt(data, credentialIdEnd);
  if (!(coseKey instanceof Map)) {
    throw new AuthenticatorDataError("The credential public key is not a COSE map.");
  }

  return {
    ...fixed,
    aaguid,
    credentialId,
    coseKey,
    extensions: readExtensions(data, credentialIdEnd + coseLength),
  };
}

/**
 * Reads an assertion's authenticator data, which has no attested credential.
 *
 * @param bytes - `authenticatorData` from the assertion object.
 * @returns The parsed fields.
 * @throws {AuthenticatorDataError} When the bytes are too short or anything
 *   other than an extension map follows the counter.
 */
export function readAssertionAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
  const data = Buffer.from(bytes);
  return { ...readFixedPart(data), extensions: readExtensions(data, FIXED_PART_LENGTH) };
}

/**
 * Reads the RP ID hash, the flags and the counter.
 *
 * @param data - The whole authenticator data.
 * @returns The three fields, extensions left empty for the caller to fill.
 */
function readFixedPart(data: Buffer): Omit<AuthenticatorData, "extensions"> {
  if (data.length < FIXED_PART_LENGTH) {
    throw new AuthenticatorDataError("Authenticator data is shorter than its fixed part.");
  }
  return {
    rpIdHash: data.subarray(0, RP_ID_HASH_LENGTH),
    flags: data[FLAGS_OFFSET] as number,
    counter: data.readUInt32BE(COUNTER_OFFSET),
  };
}

/**
 * Reads the extension map that may close the authenticator data.
 *
 * @param data - The whole authenticator data.
 * @param offset - Where the extensions would start.
 * @returns The Apple extensions found, none when no bytes remain.
 * @throws {AuthenticatorDataError} When the remainder is not exactly one CBOR
 *   map, or a known extension has the wrong type.
 */
function readExtensions(data: Buffer, offset: number): AppAttestExtensions {
  if (offset === data.length) return {};

  const [map, length] = decodeAt(data, offset);
  if (!(map instanceof Map) || offset + length !== data.length) {
    throw new AuthenticatorDataError("Authenticator data has trailing bytes that are not one extension map.");
  }

  const extensions: AppAttestExtensions = {};
  const category = map.get(VALIDATION_CATEGORY_EXTENSION);
  if (category !== undefined) extensions.validationCategory = readValidationCategory(category);

  const bundleVersion = map.get(BUNDLE_VERSION_EXTENSION);
  if (bundleVersion !== undefined) {
    if (typeof bundleVersion !== "string") {
      throw new AuthenticatorDataError("The bundle version extension is not a string.");
    }
    extensions.bundleVersion = bundleVersion;
  }
  return extensions;
}

/**
 * Reads the validation category, which Apple documents as a `UInt32`. Its
 * sample sends it as four bytes, least significant first, so `1` is
 * `01 00 00 00`. A plain CBOR integer is read as well.
 *
 * @param value - The extension's CBOR value.
 * @returns The category number.
 */
function readValidationCategory(value: CBORType): number {
  if (value instanceof Uint8Array && value.length === 4) {
    return Buffer.from(value).readUInt32LE(0);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new AuthenticatorDataError("The validation category extension is not a 32-bit value.");
}

/**
 * Decodes one CBOR item at an offset, turning a decoder failure into an
 * {@link AuthenticatorDataError}.
 *
 * @param data - The whole authenticator data.
 * @param offset - Where the item starts.
 * @returns The item and how many bytes it took.
 */
function decodeAt(data: Buffer, offset: number): [CBORType, number] {
  try {
    return decodePartialCBOR(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
  } catch {
    throw new AuthenticatorDataError("Authenticator data holds malformed CBOR.");
  }
}
