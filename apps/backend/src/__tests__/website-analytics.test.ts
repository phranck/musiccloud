import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type WebsiteAnalyticsRealtimeEvent, websiteAnalyticsRealtimeBroadcaster } from "../lib/event-broadcaster.js";
import { deriveDeviceKey, deriveNetworkClusterKey } from "../services/website-analytics.js";

const mocks = vi.hoisted(() => ({
  insertWebsiteAnalyticsBatch: vi.fn(async () => 1),
  lookupGeoIp: vi.fn(async () => null),
}));

const insertWebsiteAnalyticsBatchMock = mocks.insertWebsiteAnalyticsBatch;
const lookupGeoIpMock = mocks.lookupGeoIp;

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({
    insertWebsiteAnalyticsBatch: mocks.insertWebsiteAnalyticsBatch,
  })),
}));

vi.mock("../services/geo-ip.js", () => ({
  lookupGeoIp: mocks.lookupGeoIp,
}));

import { buildApp } from "../server.js";

const ENDPOINT = "/api/v1/analytics/website-events";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    visitorId: "visitor-local-test",
    events: [
      {
        id: EVENT_ID,
        occurredAt: "2026-05-22T10:00:00.000Z",
        eventType: "ui_click",
        path: "/abc123",
        routeTemplate: "/:shortId",
        deviceClass: "phone",
        browserFamily: "chrome",
        osFamily: "android",
        deviceModel: "Pixel 9",
        surface: "share_card",
        elementKey: "listen_on.spotify",
        xPct: 42.5,
        yPct: 12.25,
        viewportBucket: "desktop",
        eventData: {
          service: "spotify",
          ip: "192.168.1.10",
          userAgent: "raw ua",
          canvas: "fingerprint",
        },
      },
    ],
    ...overrides,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-website-analytics";
  process.env.WEBSITE_ANALYTICS_HMAC_SECRET = "test-analytics-secret";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  process.env.WEBSITE_ANALYTICS_HMAC_SECRET = "test-analytics-secret";
  insertWebsiteAnalyticsBatchMock.mockClear();
  insertWebsiteAnalyticsBatchMock.mockResolvedValue(1);
  lookupGeoIpMock.mockClear();
  lookupGeoIpMock.mockResolvedValue(null);
});

describe("website analytics privacy helpers", () => {
  it("derives the same network cluster for IPv4 addresses in the same /24", () => {
    const day = new Date("2026-05-22T10:00:00.000Z");
    const a = deriveNetworkClusterKey("203.0.113.12", day, "secret");
    const b = deriveNetworkClusterKey("203.0.113.240", day, "secret");
    const c = deriveNetworkClusterKey("203.0.114.12", day, "secret");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203.0.113");
  });

  it("derives stable pseudonymous device keys without exposing the visitor id", () => {
    const key = deriveDeviceKey("visitor-local-test", "secret");
    expect(key).toMatch(/^wdev_[a-f0-9]{40}$/);
    expect(key).not.toContain("visitor-local-test");
  });
});

describe(`POST ${ENDPOINT}`, () => {
  it("accepts a valid batch and strips forbidden eventData keys before persistence", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      remoteAddress: "203.0.113.12",
      payload: validBody(),
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1 });
    expect(insertWebsiteAnalyticsBatchMock).toHaveBeenCalledTimes(1);

    const [batch] = insertWebsiteAnalyticsBatchMock.mock.calls[0];
    expect(batch.session.id).toBe(SESSION_ID);
    expect(batch.session.deviceKey).toMatch(/^wdev_[a-f0-9]{40}$/);
    expect(batch.session.networkClusterKey).toMatch(/^wnc_[a-f0-9]{40}$/);
    expect(batch.events[0].deviceModel).toBe("Pixel 9");
    expect(batch.events[0].isBot).toBe(false);
    expect(batch.events[0].geoCountryCode).toBeNull();
    expect(batch.events[0].eventData).toEqual({ service: "spotify" });
  });

  it("persists derived Geo-IP fields without exposing the raw request IP", async () => {
    lookupGeoIpMock.mockResolvedValueOnce({
      accuracyRadiusKm: 20,
      city: "Berlin",
      countryCode: "DE",
      databaseBuildAt: new Date("2026-05-20T00:00:00.000Z"),
      latitude: 52.52,
      longitude: 13.405,
      provider: "maxmind",
      regionCode: "BE",
      regionName: "Berlin",
      timeZone: "Europe/Berlin",
    });

    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      remoteAddress: "198.51.100.24",
      payload: validBody(),
    });

    expect(res.statusCode).toBe(202);
    expect(lookupGeoIpMock).toHaveBeenCalledWith("198.51.100.24");

    const [batch] = insertWebsiteAnalyticsBatchMock.mock.calls[0];
    expect(batch.events[0]).toMatchObject({
      geoAccuracyRadiusKm: 20,
      geoCity: "Berlin",
      geoCountryCode: "DE",
      geoLatitude: 52.52,
      geoLongitude: 13.405,
      geoProvider: "maxmind",
      geoRegionCode: "BE",
      geoRegionName: "Berlin",
      geoTimeZone: "Europe/Berlin",
    });
    expect(JSON.stringify(batch)).not.toContain("198.51.100.24");
  });

  it("emits realtime Geo-IP events for accepted geolocated analytics events", async () => {
    const received: WebsiteAnalyticsRealtimeEvent[] = [];
    const unsubscribe = websiteAnalyticsRealtimeBroadcaster.subscribe((event) => received.push(event));
    lookupGeoIpMock.mockResolvedValueOnce({
      accuracyRadiusKm: 8,
      city: "Vienna",
      countryCode: "AT",
      databaseBuildAt: new Date("2026-05-20T00:00:00.000Z"),
      latitude: 48.2082,
      longitude: 16.3738,
      provider: "maxmind",
      regionCode: "9",
      regionName: "Vienna",
      timeZone: "Europe/Vienna",
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: ENDPOINT,
        remoteAddress: "198.51.100.55",
        payload: validBody({
          events: [
            {
              id: EVENT_ID,
              occurredAt: "2026-05-22T10:00:00.000Z",
              eventType: "listen_on_clicked",
              path: "/abc123",
              routeTemplate: "/:shortId",
              deviceClass: "desktop",
              surface: "share_card",
              elementKey: "listen_on.apple_music",
            },
          ],
        }),
      });

      expect(res.statusCode).toBe(202);
      expect(received).toEqual([
        {
          type: "website-analytics-geo-event",
          data: {
            accuracyRadiusKm: 8,
            activity: "listen",
            city: "Vienna",
            countryCode: "AT",
            deviceClass: "desktop",
            elementKey: "listen_on.apple_music",
            eventType: "listen_on_clicked",
            id: EVENT_ID,
            isBot: false,
            latitude: 48.2082,
            longitude: 16.3738,
            occurredAt: "2026-05-22T10:00:00.000Z",
            path: "/abc123",
            regionCode: "9",
            regionName: "Vienna",
            routeTemplate: "/:shortId",
            surface: "share_card",
          },
        },
      ]);
      expect(JSON.stringify(received)).not.toContain("198.51.100.55");
    } finally {
      unsubscribe();
    }
  });

  it("resolves Android model codes from browser Client Hints before persistence", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      headers: {
        "sec-ch-ua": '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-model": '"CPH2663"',
        "sec-ch-ua-platform": '"Android"',
        "user-agent":
          "Mozilla/5.0 (Linux; Android 14; CPH2663) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      },
      payload: validBody({
        events: [
          {
            id: EVENT_ID,
            occurredAt: "2026-05-22T10:00:00.000Z",
            eventType: "page_view",
            path: "/abc123",
            routeTemplate: "/:shortId",
            deviceClass: "phone",
            browserFamily: "chrome",
            osFamily: "android",
            deviceModel: "CPH2663",
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(202);
    const [batch] = insertWebsiteAnalyticsBatchMock.mock.calls[0];
    expect(batch.events[0]).toMatchObject({
      browserFamily: "Chrome Mobile",
      deviceBrand: "OnePlus",
      deviceClass: "phone",
      deviceModel: "OnePlus Nord 4",
      deviceModelCode: "CPH2663",
      isBot: false,
      osFamily: "Android",
    });
  });

  it("marks bot traffic separately from human website analytics", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      headers: {
        "user-agent":
          "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      payload: validBody({
        events: [
          {
            id: EVENT_ID,
            occurredAt: "2026-05-22T10:00:00.000Z",
            eventType: "page_view",
            path: "/abc123",
            routeTemplate: "/:shortId",
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(202);
    const [batch] = insertWebsiteAnalyticsBatchMock.mock.calls[0];
    expect(batch.events[0]).toMatchObject({
      botName: "Googlebot",
      isBot: true,
    });
    expect(batch.events[0].botCategory).toBeTruthy();
  });

  it("rejects unknown event types before reaching persistence", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody({
        events: [{ occurredAt: "2026-05-22T10:00:00.000Z", eventType: "fingerprint_probe" }],
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(insertWebsiteAnalyticsBatchMock).not.toHaveBeenCalled();
  });

  it("accepts live-example clicks without turning them into resolve events", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      remoteAddress: "203.0.113.12",
      payload: validBody({
        events: [
          {
            id: EVENT_ID,
            occurredAt: "2026-05-22T10:00:00.000Z",
            eventType: "live_example_clicked",
            path: "/",
            routeTemplate: "/",
            surface: "landing_example",
            elementKey: "landing.live_example",
            shortId: "abc123",
            eventData: { suppressResolveAnalytics: true },
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(202);
    const [batch] = insertWebsiteAnalyticsBatchMock.mock.calls[0];
    expect(batch.events[0]).toMatchObject({
      eventType: "live_example_clicked",
      shortId: "abc123",
      surface: "landing_example",
      elementKey: "landing.live_example",
      eventData: { suppressResolveAnalytics: true },
    });
  });

  it("returns 503 when the HMAC secret is not configured", async () => {
    delete process.env.WEBSITE_ANALYTICS_HMAC_SECRET;

    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "ANALYTICS_NOT_CONFIGURED" });
  });
});
