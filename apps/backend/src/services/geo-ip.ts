import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import maxmind, { type CityResponse, type Reader } from "maxmind";

const DEFAULT_MAXMIND_DB_NAME = "GeoLite2-City.mmdb";
const DEFAULT_MAX_AGE_DAYS = 14;
const GEOIP_PROVIDER = "maxmind";

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

let cachedReader: Reader<CityResponse> | null = null;
let cachedPath: string | null = null;
let cachedStatus: GeoIpStatus | null = null;
let cachedOpenPromise: Promise<Reader<CityResponse> | null> | null = null;
let updateInFlight: Promise<GeoIpUpdateResult> | null = null;

function maxMindDbPath(): string {
  const explicitPath = process.env.MAXMIND_DB_PATH?.trim();
  if (explicitPath) return explicitPath;

  const dbDir = process.env.MAXMIND_DB_DIR?.trim() || path.join(process.cwd(), "data", "geoip");
  return path.join(dbDir, DEFAULT_MAXMIND_DB_NAME);
}

function maxMindDbDir(): string {
  return path.dirname(maxMindDbPath());
}

function maxAgeDays(): number {
  const raw = Number(process.env.MAXMIND_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_DAYS;
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

function statusFromError(databasePath: string, error: unknown): GeoIpStatus {
  const message = error instanceof Error ? error.message : "Geo-IP database could not be opened.";
  const state = /ENOENT|no such file/i.test(message) ? "missing" : "error";
  return {
    state,
    provider: GEOIP_PROVIDER,
    databasePath,
    databaseType: null,
    buildEpoch: null,
    lastModifiedAt: null,
    ageDays: null,
    maxAgeDays: maxAgeDays(),
    message,
  };
}

async function openGeoIpReader(): Promise<Reader<CityResponse> | null> {
  const databasePath = maxMindDbPath();
  if (cachedReader && cachedPath === databasePath && cachedStatus?.state === "fresh") return cachedReader;
  if (cachedOpenPromise && cachedPath === databasePath) return cachedOpenPromise;

  cachedPath = databasePath;
  cachedOpenPromise = (async () => {
    try {
      const reader = await maxmind.open<CityResponse>(databasePath, {
        cache: { max: 10_000 },
        watchForUpdates: true,
        watchForUpdatesNonPersistent: true,
        watchForUpdatesHook: () => {
          cachedStatus = null;
        },
      });
      const fileStat = await stat(databasePath);
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
        message: state === "stale" ? `Geo-IP database is older than ${maxAge} days.` : null,
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

export async function getGeoIpStatus(): Promise<GeoIpStatus> {
  if (updateInFlight) {
    return {
      state: "updating",
      provider: GEOIP_PROVIDER,
      databasePath: maxMindDbPath(),
      databaseType: cachedStatus?.databaseType ?? null,
      buildEpoch: cachedStatus?.buildEpoch ?? null,
      lastModifiedAt: cachedStatus?.lastModifiedAt ?? null,
      ageDays: cachedStatus?.ageDays ?? null,
      maxAgeDays: maxAgeDays(),
      message: "Geo-IP database update is currently running.",
    };
  }

  if (process.env.MAXMIND_ENABLED === "false") {
    return {
      state: "disabled",
      provider: GEOIP_PROVIDER,
      databasePath: maxMindDbPath(),
      databaseType: null,
      buildEpoch: null,
      lastModifiedAt: null,
      ageDays: null,
      maxAgeDays: maxAgeDays(),
      message: "Geo-IP lookup is disabled by MAXMIND_ENABLED=false.",
    };
  }

  if (!cachedStatus) {
    await openGeoIpReader();
  }

  return cachedStatus ?? statusFromError(maxMindDbPath(), new Error("Geo-IP status is unavailable."));
}

function geoIpUpdateBinary(): string {
  return process.env.MAXMIND_GEOIPUPDATE_BIN?.trim() || "geoipupdate";
}

async function geoIpUpdateConfigFile(): Promise<{ cleanup: () => Promise<void>; path: string | null }> {
  const accountId = process.env.MAXMIND_ACCOUNT_ID?.trim();
  const licenseKey = process.env.MAXMIND_LICENSE_KEY?.trim();
  if (!accountId || !licenseKey) {
    return { cleanup: async () => {}, path: null };
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "musiccloud-geoipupdate-"));
  const configPath = path.join(tempDir, "GeoIP.conf");
  const databaseDir = maxMindDbDir();
  await mkdir(databaseDir, { recursive: true });
  await writeFile(
    configPath,
    [
      `AccountID ${accountId}`,
      `LicenseKey ${licenseKey}`,
      "EditionIDs GeoLite2-City",
      `DatabaseDirectory ${databaseDir}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    path: configPath,
  };
}

function runGeoIpUpdateCommand(configPath: string | null): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const args = configPath ? ["-f", configPath] : [];
    const child = spawn(geoIpUpdateBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }
      reject(new Error(`geoipupdate exited with code ${code}: ${stderr || stdout || "no output"}`));
    });
  });
}

function resetGeoIpCache(): void {
  cachedReader = null;
  cachedStatus = null;
  cachedOpenPromise = null;
}

export async function updateGeoIpDatabase(): Promise<GeoIpUpdateResult> {
  if (process.env.MAXMIND_ENABLED === "false") {
    const status = await getGeoIpStatus();
    return { ok: false, status, message: "Geo-IP lookup is disabled." };
  }

  if (updateInFlight) return updateInFlight;

  updateInFlight = (async () => {
    const config = await geoIpUpdateConfigFile();
    try {
      await runGeoIpUpdateCommand(config.path);
      resetGeoIpCache();
      const status = await getGeoIpStatus();
      return {
        ok: status.state === "fresh",
        status,
        message:
          status.state === "fresh"
            ? "Geo-IP database updated successfully."
            : "Geo-IP update completed, but the database is not fresh.",
      };
    } catch (error) {
      resetGeoIpCache();
      cachedStatus = statusFromError(maxMindDbPath(), error);
      return {
        ok: false,
        status: cachedStatus,
        message: error instanceof Error ? error.message : "Geo-IP database update failed.",
      };
    } finally {
      await config.cleanup();
      updateInFlight = null;
    }
  })();

  return updateInFlight;
}

function preferredName(names: { en?: string; de?: string } | undefined): string | null {
  return names?.en ?? names?.de ?? null;
}

export async function lookupGeoIp(rawIp: string): Promise<GeoIpLookupResult | null> {
  if (process.env.MAXMIND_ENABLED === "false") return null;

  const ip = normalisePublicIp(rawIp);
  if (!ip) return null;

  const reader = await openGeoIpReader();
  if (!reader || cachedStatus?.state !== "fresh") return null;

  const result = reader.get(ip);
  if (!result?.location) return null;

  const subdivision = result.subdivisions?.[0];
  return {
    countryCode: result.country?.iso_code ?? result.registered_country?.iso_code ?? null,
    regionCode: subdivision?.iso_code ?? null,
    regionName: preferredName(subdivision?.names),
    city: preferredName(result.city?.names),
    latitude: result.location.latitude ?? null,
    longitude: result.location.longitude ?? null,
    accuracyRadiusKm: result.location.accuracy_radius ?? null,
    timeZone: result.location.time_zone ?? null,
    provider: GEOIP_PROVIDER,
    databaseBuildAt: cachedStatus?.buildEpoch ? new Date(cachedStatus.buildEpoch) : null,
  };
}
