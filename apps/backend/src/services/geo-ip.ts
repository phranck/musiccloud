import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { gunzipSync } from "fflate";
import { type CityResponse, Reader } from "mmdb-lib";

const DEFAULT_DBIP_DB_NAME = "dbip-city-lite.mmdb";
const DEFAULT_MAX_AGE_DAYS = 45;
const GEOIP_PROVIDER = "db-ip";
const DBIP_DOWNLOAD_PAGE_URL = "https://db-ip.com/db/download/ip-to-city-lite";
const REMOTE_RELEASE_CACHE_MS = 30 * 60 * 1000;

type LocalizedNames = { de?: string; en?: string };

type DbIpCityResponse = CityResponse;

interface DbIpRemoteRelease {
  downloadUrl: string;
  md5: string | null;
  release: string;
  releaseAt: string | null;
  sha1: string | null;
}

interface DbIpSidecarMetadata {
  downloadedAt: string;
  downloadUrl: string;
  md5: string | null;
  release: string;
  releaseAt: string | null;
  sha1: string | null;
}

export type GeoIpStatusState = "disabled" | "fresh" | "stale" | "missing" | "updating" | "error";

export interface GeoIpStatus {
  state: GeoIpStatusState;
  provider: string;
  databasePath: string;
  databaseType: string | null;
  buildEpoch: string | null;
  lastModifiedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  message: string | null;
  latestRelease: string | null;
  latestReleaseAt: string | null;
  lastDownloadedAt: string | null;
  updateAvailable: boolean | null;
}

export interface GeoIpLookupResult {
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyRadiusKm: number | null;
  timeZone: string | null;
  provider: string;
  databaseBuildAt: Date | null;
}

export interface GeoIpUpdateResult {
  ok: boolean;
  status: GeoIpStatus;
  message: string;
}

let cachedReader: Reader<DbIpCityResponse> | null = null;
let cachedPath: string | null = null;
let cachedStatus: GeoIpStatus | null = null;
let cachedOpenPromise: Promise<Reader<DbIpCityResponse> | null> | null = null;
let updateInFlight: Promise<GeoIpUpdateResult> | null = null;
let remoteReleaseCache: { fetchedAt: number; release: DbIpRemoteRelease } | null = null;

function geoIpDbPath(): string {
  const explicitPath = process.env.DBIP_DB_PATH?.trim();
  if (explicitPath) return explicitPath;

  const dbDir = process.env.DBIP_DB_DIR?.trim() || path.join(process.cwd(), "data", "geoip");
  return path.join(dbDir, DEFAULT_DBIP_DB_NAME);
}

function geoIpDbDir(): string {
  return path.dirname(geoIpDbPath());
}

function geoIpSidecarPath(): string {
  return `${geoIpDbPath()}.json`;
}

function geoIpDisabled(): boolean {
  return process.env.DBIP_ENABLED === "false";
}

function maxAgeDays(): number {
  const raw = Number(process.env.DBIP_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_DAYS;
}

function updateOnStart(): boolean {
  return process.env.DBIP_UPDATE_ON_START === "true";
}

function requireReady(): boolean {
  return process.env.DBIP_REQUIRE_READY === "true";
}

function isoDate(value: Date | null | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function ageInDays(buildEpoch: Date | null): number | null {
  if (!buildEpoch || Number.isNaN(buildEpoch.getTime())) return null;
  return Math.max(0, (Date.now() - buildEpoch.getTime()) / (24 * 60 * 60 * 1000));
}

function stripIpv4MappedIpv6(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

function parseIpv4(ip: string): number[] | null {
  if (!net.isIPv4(ip)) return null;
  return ip.split(".").map((part) => Number(part));
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return false;
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:") ||
    lower.startsWith("2001:db8:")
  );
}

export function normalisePublicIp(rawIp: string | null | undefined): string | null {
  const ip = stripIpv4MappedIpv6(rawIp?.trim() ?? "");
  if (!ip || net.isIP(ip) === 0) return null;
  if (net.isIPv4(ip) && isPrivateOrReservedIpv4(ip)) return null;
  if (net.isIPv6(ip) && isPrivateOrReservedIpv6(ip)) return null;
  return ip;
}

function emptyStatus(state: GeoIpStatusState, message: string | null): GeoIpStatus {
  return {
    state,
    provider: GEOIP_PROVIDER,
    databasePath: geoIpDbPath(),
    databaseType: null,
    buildEpoch: null,
    lastModifiedAt: null,
    ageDays: null,
    maxAgeDays: maxAgeDays(),
    message,
    latestRelease: null,
    latestReleaseAt: null,
    lastDownloadedAt: null,
    updateAvailable: null,
  };
}

function statusFromError(databasePath: string, error: unknown): GeoIpStatus {
  const message = error instanceof Error ? error.message : "Geo-IP database could not be opened.";
  const state = /ENOENT|no such file/i.test(message) ? "missing" : "error";
  return {
    ...emptyStatus(
      state,
      state === "missing"
        ? "DB-IP City Lite database is missing. Run an update from the dashboard."
        : "DB-IP City Lite database could not be opened.",
    ),
    databasePath,
  };
}

function parseReleaseMonth(value: string): string | null {
  const match = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const [, monthName, year] = match;
  const monthIndex = new Date(`${monthName} 1, ${year} 00:00:00 UTC`).getUTCMonth();
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(Date.UTC(Number(year), monthIndex, 1)).toISOString();
}

function releaseFromDownloadUrl(downloadUrl: string): string {
  const match = downloadUrl.match(/dbip-city-lite-(\d{4})-(\d{2})\.mmdb\.gz$/);
  if (!match) return "unknown";
  const [, year, month] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleString("en", { month: "long", timeZone: "UTC", year: "numeric" });
}

function strippedText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function parseDbIpDownloadPage(html: string): DbIpRemoteRelease {
  const downloadUrl =
    process.env.DBIP_DOWNLOAD_URL?.trim() ||
    html.match(/https:\/\/download\.db-ip\.com\/free\/dbip-city-lite-\d{4}-\d{2}\.mmdb\.gz/)?.[0];
  if (!downloadUrl) throw new Error("DB-IP City Lite MMDB download URL was not found.");

  const text = strippedText(html).replace(/\s+/g, " ");
  const mmdbSection = text.match(/Format\s+MMDB\s+([\s\S]*?)(?:Commercial version|$)/i)?.[1] ?? text;
  const release = mmdbSection.match(/Release\s+([A-Za-z]+\s+\d{4})/i)?.[1] ?? releaseFromDownloadUrl(downloadUrl);

  return {
    downloadUrl,
    md5: mmdbSection.match(/MD5SUM\s+([a-f0-9]{32})/i)?.[1] ?? null,
    release,
    releaseAt: parseReleaseMonth(release),
    sha1: mmdbSection.match(/SHA1SUM\s+([a-f0-9]{40})/i)?.[1] ?? null,
  };
}

async function getDbIpRemoteRelease(force = false): Promise<DbIpRemoteRelease | null> {
  if (!force && remoteReleaseCache && Date.now() - remoteReleaseCache.fetchedAt < REMOTE_RELEASE_CACHE_MS) {
    return remoteReleaseCache.release;
  }

  try {
    const response = await fetch(process.env.DBIP_DOWNLOAD_PAGE_URL?.trim() || DBIP_DOWNLOAD_PAGE_URL);
    if (!response.ok) throw new Error(`DB-IP download page returned HTTP ${response.status}.`);
    const release = parseDbIpDownloadPage(await response.text());
    remoteReleaseCache = { fetchedAt: Date.now(), release };
    return release;
  } catch {
    return null;
  }
}

async function readSidecarMetadata(): Promise<DbIpSidecarMetadata | null> {
  try {
    return JSON.parse(await readFile(geoIpSidecarPath(), "utf8")) as DbIpSidecarMetadata;
  } catch {
    return null;
  }
}

function updateAvailable(
  localBuildEpoch: string | null,
  sidecar: DbIpSidecarMetadata | null,
  remote: DbIpRemoteRelease | null,
): boolean | null {
  if (!remote?.releaseAt) return null;
  const localReleaseAt = sidecar?.releaseAt ?? localBuildEpoch;
  if (!localReleaseAt) return true;
  return new Date(localReleaseAt).getTime() < new Date(remote.releaseAt).getTime();
}

async function enrichStatusWithRelease(status: GeoIpStatus): Promise<GeoIpStatus> {
  const [sidecar, remote] = await Promise.all([readSidecarMetadata(), getDbIpRemoteRelease()]);
  return {
    ...status,
    latestRelease: remote?.release ?? sidecar?.release ?? null,
    latestReleaseAt: remote?.releaseAt ?? sidecar?.releaseAt ?? null,
    lastDownloadedAt: sidecar?.downloadedAt ?? null,
    updateAvailable: updateAvailable(status.buildEpoch, sidecar, remote),
  };
}

async function openGeoIpReader(): Promise<Reader<DbIpCityResponse> | null> {
  const databasePath = geoIpDbPath();
  if (cachedReader && cachedPath === databasePath && cachedStatus?.state === "fresh") return cachedReader;
  if (cachedOpenPromise && cachedPath === databasePath) return cachedOpenPromise;

  cachedPath = databasePath;
  cachedOpenPromise = (async () => {
    try {
      const reader = new Reader<DbIpCityResponse>(await readFile(databasePath));
      const fileStat = await stat(databasePath);
      const sidecar = await readSidecarMetadata();
      const buildEpoch = reader.metadata.buildEpoch ?? null;
      const ageDays = ageInDays(buildEpoch);
      const maxAge = maxAgeDays();
      const state: GeoIpStatusState = ageDays !== null && ageDays <= maxAge ? "fresh" : "stale";
      cachedReader = reader;
      cachedStatus = {
        state,
        provider: GEOIP_PROVIDER,
        databasePath,
        databaseType: reader.metadata.databaseType,
        buildEpoch: isoDate(buildEpoch),
        lastModifiedAt: isoDate(fileStat.mtime),
        ageDays,
        maxAgeDays: maxAge,
        message: state === "stale" ? `DB-IP City Lite database is older than ${maxAge} days.` : null,
        latestRelease: sidecar?.release ?? null,
        latestReleaseAt: sidecar?.releaseAt ?? null,
        lastDownloadedAt: sidecar?.downloadedAt ?? null,
        updateAvailable: null,
      };
      return state === "fresh" ? reader : null;
    } catch (error) {
      cachedReader = null;
      cachedStatus = statusFromError(databasePath, error);
      return null;
    } finally {
      cachedOpenPromise = null;
    }
  })();

  return cachedOpenPromise;
}

async function readGeoIpStatus(): Promise<GeoIpStatus> {
  if (!cachedStatus) {
    await openGeoIpReader();
  }

  return enrichStatusWithRelease(
    cachedStatus ?? statusFromError(geoIpDbPath(), new Error("Geo-IP status is unavailable.")),
  );
}

export async function getGeoIpStatus(): Promise<GeoIpStatus> {
  if (updateInFlight) {
    return {
      ...emptyStatus("updating", "DB-IP City Lite database update is currently running."),
      databaseType: cachedStatus?.databaseType ?? null,
      buildEpoch: cachedStatus?.buildEpoch ?? null,
      lastModifiedAt: cachedStatus?.lastModifiedAt ?? null,
      ageDays: cachedStatus?.ageDays ?? null,
      latestRelease: cachedStatus?.latestRelease ?? null,
      latestReleaseAt: cachedStatus?.latestReleaseAt ?? null,
      lastDownloadedAt: cachedStatus?.lastDownloadedAt ?? null,
      updateAvailable: cachedStatus?.updateAvailable ?? null,
    };
  }

  if (geoIpDisabled()) {
    return emptyStatus("disabled", "Geo-IP lookup is disabled by DBIP_ENABLED=false.");
  }

  return readGeoIpStatus();
}

function resetGeoIpCache(): void {
  cachedReader = null;
  cachedStatus = null;
  cachedOpenPromise = null;
}

async function fetchDbIpDatabase(release: DbIpRemoteRelease): Promise<Buffer> {
  const response = await fetch(release.downloadUrl);
  if (!response.ok) throw new Error(`DB-IP City Lite download returned HTTP ${response.status}.`);
  const compressed = Buffer.from(await response.arrayBuffer());

  const decompressed = Buffer.from(gunzipSync(compressed));
  const sha1 = createHash("sha1").update(decompressed).digest("hex");
  if (release.sha1 && sha1 !== release.sha1) {
    throw new Error("DB-IP City Lite download checksum mismatch.");
  }

  if (release.md5) {
    const md5 = createHash("md5").update(decompressed).digest("hex");
    if (md5 !== release.md5) throw new Error("DB-IP City Lite download checksum mismatch.");
  }

  return decompressed;
}

export async function updateGeoIpDatabase(): Promise<GeoIpUpdateResult> {
  if (geoIpDisabled()) {
    const status = await getGeoIpStatus();
    return { ok: false, status, message: "Geo-IP lookup is disabled." };
  }

  if (updateInFlight) return updateInFlight;

  updateInFlight = (async () => {
    try {
      const release = await getDbIpRemoteRelease(true);
      if (!release) throw new Error("DB-IP City Lite release metadata could not be fetched.");

      const databaseBuffer = await fetchDbIpDatabase(release);
      const databaseDir = geoIpDbDir();
      const databasePath = geoIpDbPath();
      const tempPath = `${databasePath}.${process.pid}.${Date.now()}.tmp`;
      const tempSidecarPath = `${geoIpSidecarPath()}.${process.pid}.${Date.now()}.tmp`;

      await mkdir(databaseDir, { recursive: true });
      await writeFile(tempPath, databaseBuffer, { mode: 0o644 });
      const validationReader = new Reader<DbIpCityResponse>(databaseBuffer);
      validationReader.get("8.8.8.8");

      const sidecar: DbIpSidecarMetadata = {
        downloadedAt: new Date().toISOString(),
        downloadUrl: release.downloadUrl,
        md5: release.md5,
        release: release.release,
        releaseAt: release.releaseAt,
        sha1: release.sha1,
      };
      await writeFile(tempSidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, { mode: 0o644 });
      await rename(tempPath, databasePath);
      await rename(tempSidecarPath, geoIpSidecarPath());

      resetGeoIpCache();
      const status = await readGeoIpStatus();
      return {
        ok: status.state === "fresh",
        status,
        message:
          status.state === "fresh"
            ? "DB-IP City Lite database updated successfully."
            : "DB-IP City Lite update completed, but the database is not fresh.",
      };
    } catch (error) {
      resetGeoIpCache();
      cachedStatus = statusFromError(geoIpDbPath(), error);
      return {
        ok: false,
        status: await enrichStatusWithRelease(cachedStatus),
        message: error instanceof Error ? error.message : "DB-IP City Lite database update failed.",
      };
    } finally {
      updateInFlight = null;
    }
  })();

  return updateInFlight;
}

export async function ensureGeoIpDatabaseReady(): Promise<GeoIpStatus> {
  const status = await getGeoIpStatus();
  if (geoIpDisabled() || !updateOnStart()) return status;
  if (status.state === "fresh" && status.updateAvailable !== true) return status;

  const updateResult = await updateGeoIpDatabase();
  if (!updateResult.ok && requireReady()) {
    throw new Error(updateResult.message);
  }
  return updateResult.status;
}

export function isGeoIpRequiredForReadiness(): boolean {
  return requireReady() && !geoIpDisabled();
}

function preferredName(names: LocalizedNames | undefined): string | null {
  return names?.en ?? names?.de ?? null;
}

export async function lookupGeoIp(rawIp: string): Promise<GeoIpLookupResult | null> {
  if (geoIpDisabled()) return null;

  const ip = normalisePublicIp(rawIp);
  if (!ip) return null;

  const reader = await openGeoIpReader();
  if (!reader || cachedStatus?.state !== "fresh") return null;

  const result = reader.get(ip);
  if (!result?.location) return null;

  const subdivision = result.subdivisions?.[0];
  return {
    countryCode: result.country?.iso_code ?? null,
    regionCode: subdivision?.iso_code ?? null,
    regionName: preferredName(subdivision?.names),
    city: preferredName(result.city?.names),
    latitude: result.location.latitude ?? null,
    longitude: result.location.longitude ?? null,
    accuracyRadiusKm: null,
    timeZone: result.location.time_zone ?? null,
    provider: GEOIP_PROVIDER,
    databaseBuildAt: cachedStatus?.buildEpoch ? new Date(cachedStatus.buildEpoch) : null,
  };
}
