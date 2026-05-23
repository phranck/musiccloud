import DeviceDetector, {
  type DetectResult,
  type ResultBot,
  type ResultClient,
  type ResultDevice,
  type ResultOs,
} from "node-device-detector";
import ClientHints from "node-device-detector/client-hints";

import type { WebsiteAnalyticsEventRequest } from "./website-analytics.js";

export type WebsiteAnalyticsHeaderMap = Record<string, string>;

export interface WebsiteAnalyticsDeviceDetection {
  browserFamily: string | null;
  browserVersion: string | null;
  deviceBrand: string | null;
  deviceClass: string | null;
  deviceModel: string | null;
  deviceModelCode: string | null;
  isBot: boolean;
  botName: string | null;
  botCategory: string | null;
  osFamily: string | null;
  osVersion: string | null;
}

const detector = new DeviceDetector({
  clientIndexes: true,
  deviceAliasCode: true,
  deviceIndexes: true,
  deviceInfo: false,
  deviceTrusted: false,
  maxUserAgentSize: 500,
  osIndexes: true,
});
const clientHints = new ClientHints();

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstHeader(headers: WebsiteAnalyticsHeaderMap, name: string): string | null {
  return cleanText(headers[name.toLowerCase()]);
}

function normalizeDeviceClass(value: string | null | undefined): string | null {
  const normalized = cleanText(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "smartphone" || normalized === "feature phone" || normalized === "phablet") return "phone";
  if (normalized === "tv" || normalized === "television") return "tv";
  return normalized;
}

function deviceModelLabel(device: ResultDevice, fallback: WebsiteAnalyticsEventRequest): string | null {
  const model = cleanText(device.model);
  const brand = cleanText(device.brand);
  if (model && brand && !model.toLowerCase().startsWith(brand.toLowerCase())) return `${brand} ${model}`;
  return model ?? cleanText(fallback.deviceModel);
}

function valueOrFallback(detected: string | null | undefined, fallback: string | null | undefined): string | null {
  return cleanText(detected) ?? cleanText(fallback);
}

function parseBot(userAgent: string, hints: ReturnType<ClientHints["parse"]>): ResultBot | null {
  const bot = detector.parseBot(userAgent, hints) as Partial<ResultBot> | null;
  return bot?.name ? (bot as ResultBot) : null;
}

function parseBrowser(client: ResultClient, fallback: WebsiteAnalyticsEventRequest) {
  return {
    family: valueOrFallback(client.name, fallback.browserFamily),
    version: cleanText(client.version),
  };
}

function parseOs(os: ResultOs, fallback: WebsiteAnalyticsEventRequest) {
  return {
    family: valueOrFallback(os.name, fallback.osFamily),
    version: cleanText(os.version),
  };
}

function parseDevice(device: ResultDevice, fallback: WebsiteAnalyticsEventRequest) {
  return {
    brand: cleanText(device.brand),
    class: normalizeDeviceClass(device.type) ?? normalizeDeviceClass(fallback.deviceClass),
    model: deviceModelLabel(device, fallback),
    modelCode: cleanText(device.code) ?? cleanText(fallback.deviceModel),
  };
}

/**
 * Derive user-agent based analytics fields without persisting raw user-agent
 * or Client-Hint headers. This stays inside the ingestion boundary: raw
 * headers are accepted only as request-scoped parser input and are discarded
 * before repository persistence.
 */
export function detectWebsiteAnalyticsDevice(
  headers: WebsiteAnalyticsHeaderMap,
  fallback: WebsiteAnalyticsEventRequest,
): WebsiteAnalyticsDeviceDetection {
  const userAgent = firstHeader(headers, "user-agent") ?? "";
  const parsedHints = clientHints.parse(
    {
      ...headers,
      "sec-ch-ua-model": firstHeader(headers, "sec-ch-ua-model") ?? fallback.deviceModel ?? "",
      "sec-ch-ua-mobile": firstHeader(headers, "sec-ch-ua-mobile") ?? (fallback.deviceClass === "phone" ? "?1" : ""),
      "sec-ch-ua-platform": firstHeader(headers, "sec-ch-ua-platform") ?? fallback.osFamily ?? "",
    },
    {},
  );
  const detected: DetectResult = detector.detect(userAgent, parsedHints);
  const bot = userAgent ? parseBot(userAgent, parsedHints) : null;
  const browser = parseBrowser(detected.client, fallback);
  const os = parseOs(detected.os, fallback);
  const device = parseDevice(detected.device, fallback);

  return {
    browserFamily: browser.family,
    browserVersion: browser.version,
    deviceBrand: device.brand,
    deviceClass: device.class,
    deviceModel: device.model,
    deviceModelCode: device.modelCode,
    isBot: Boolean(bot),
    botName: cleanText(bot?.name),
    botCategory: cleanText(bot?.category),
    osFamily: os.family,
    osVersion: os.version,
  };
}
