import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  SCREENSHOT_SPECS,
  buildScreenshotSetPayload,
  collectAttachments,
  confirmScreenshot,
  createScreenshotReservation,
  executeUploadOperations,
  readImageSize,
  uploadScreenshots,
  validateScreenshot,
} from "./apple-app-store-screenshots.mjs";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), "musiccloud-screenshots-test-"));
}

function writePng(path, width, height) {
  writeFileSync(path, onePixelPng);
  execFileSync("sips", ["-z", String(height), String(width), path], { stdio: "ignore" });
}

function manifestEntry(testIdentifier, exportedFileName) {
  return {
    testIdentifier,
    attachments: [{ exportedFileName, suggestedHumanReadableName: `${testIdentifier}.png` }],
  };
}

test("the twelve capture specs map exact test IDs, display types, and dimensions", () => {
  assert.equal(SCREENSHOT_SPECS.length, 12);
  assert.deepEqual(
    SCREENSHOT_SPECS.map(({ fileName, displayType, width, height }) => [fileName, displayType, width, height]),
    [
      ["iphone-home-light.png", "APP_IPHONE_67", 1320, 2868],
      ["iphone-home-dark.png", "APP_IPHONE_67", 1320, 2868],
      ["iphone-settings-light.png", "APP_IPHONE_67", 1320, 2868],
      ["iphone-settings-dark.png", "APP_IPHONE_67", 1320, 2868],
      ["ipad-history-light.png", "APP_IPAD_PRO_3GEN_129", 2064, 2752],
      ["ipad-history-dark.png", "APP_IPAD_PRO_3GEN_129", 2064, 2752],
      ["ipad-settings-light.png", "APP_IPAD_PRO_3GEN_129", 2064, 2752],
      ["ipad-settings-dark.png", "APP_IPAD_PRO_3GEN_129", 2064, 2752],
      ["mac-history-light.png", "APP_DESKTOP", 2880, 1800],
      ["mac-history-dark.png", "APP_DESKTOP", 2880, 1800],
      ["mac-settings-light.png", "APP_DESKTOP", 2880, 1800],
      ["mac-settings-dark.png", "APP_DESKTOP", 2880, 1800],
    ],
  );
});

test("readImageSize reads real PNG dimensions through sips", () => {
  const directory = temporaryDirectory();
  const file = join(directory, "pixel.png");
  writePng(file, 1320, 2868);
  assert.deepEqual(readImageSize(file), { width: 1320, height: 2868 });
});

test("validateScreenshot rejects wrong dimensions and missing files", async () => {
  const directory = temporaryDirectory();
  const file = join(directory, "wrong.png");
  writePng(file, 1, 1);
  const spec = SCREENSHOT_SPECS.find(({ fileName }) => fileName === "iphone-home-light.png");
  await assert.rejects(() => validateScreenshot(file, spec), /1320 x 2868/);
  await assert.rejects(() => validateScreenshot(join(directory, "missing.png"), spec), /missing|ENOENT/);
});

test("collectAttachments renames exported files using their test IDs", () => {
  const directory = temporaryDirectory();
  const source = join(directory, "source");
  const output = join(directory, "output");
  mkdirSync(source);
  mkdirSync(output);
  writePng(join(source, "home-light-uuid.png"), 1320, 2868);
  writePng(join(source, "home-dark-uuid.png"), 1320, 2868);
  writePng(join(source, "settings-light-uuid.png"), 1320, 2868);
  writePng(join(source, "settings-dark-uuid.png"), 1320, 2868);
  const manifest = [
    manifestEntry("AppStoreScreenshotTests/captureIPhoneHomeLight()", "home-light-uuid.png"),
    manifestEntry("AppStoreScreenshotTests/captureIPhoneHomeDark()", "home-dark-uuid.png"),
    manifestEntry("AppStoreScreenshotTests/captureIPhoneSettingsLight()", "settings-light-uuid.png"),
    manifestEntry("AppStoreScreenshotTests/captureIPhoneSettingsDark()", "settings-dark-uuid.png"),
  ];
  const files = collectAttachments(manifest, source, output, "ios");
  assert.deepEqual(files.sort(), [
    "iphone-home-dark.png",
    "iphone-home-light.png",
    "iphone-settings-dark.png",
    "iphone-settings-light.png",
  ]);
  assert.deepEqual(readImageSize(join(output, "iphone-home-light.png")), { width: 1320, height: 2868 });
});

test("collectAttachments rejects missing and duplicate test IDs", () => {
  const directory = temporaryDirectory();
  const source = join(directory, "source");
  const output = join(directory, "output");
  mkdirSync(source);
  mkdirSync(output);
  assert.throws(
    () => collectAttachments([], source, output, "ios"),
    /captureIPhoneHomeLight\(\)/,
  );
  const duplicate = manifestEntry("AppStoreScreenshotTests/captureIPhoneHomeLight()", "duplicate.png");
  assert.throws(
    () => collectAttachments([duplicate, duplicate], source, output, "ios"),
    /duplicate|Duplicate/,
  );
});


test("buildScreenshotSetPayload creates the documented set relationship", () => {
  assert.deepEqual(buildScreenshotSetPayload("localization-id", "APP_DESKTOP"), {
    data: {
      type: "appScreenshotSets",
      attributes: { screenshotDisplayType: "APP_DESKTOP" },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: "appStoreVersionLocalizations", id: "localization-id" },
        },
      },
    },
  });
});

test("createScreenshotReservation includes file name, size, and set ID", async () => {
  const directory = temporaryDirectory();
  const file = join(directory, "image.png");
  writeFileSync(file, Buffer.from("0123456789"));
  assert.deepEqual(await createScreenshotReservation(file, "set-id"), {
    data: {
      type: "appScreenshots",
      attributes: { fileName: "image.png", fileSize: 10 },
      relationships: {
        appScreenshotSet: { data: { type: "appScreenshotSets", id: "set-id" } },
      },
    },
  });
});

test("executeUploadOperations sends exact byte ranges and only supplied headers", async () => {
  const directory = temporaryDirectory();
  const file = join(directory, "image.png");
  writeFileSync(file, Buffer.from("0123456789"));
  const calls = [];
  const operations = [
    {
      method: "PUT",
      url: "https://upload.example/first",
      offset: 0,
      length: 4,
      requestHeaders: [{ name: "Content-Type", value: "application/octet-stream" }],
    },
    {
      method: "PUT",
      url: "https://upload.example/second",
      offset: 4,
      length: 6,
      requestHeaders: [{ name: "X-Chunk", value: "second" }],
    },
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };
  await executeUploadOperations(file, operations, fetchImpl);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.body.toString(), "0123");
  assert.equal(calls[1].options.body.toString(), "456789");
  assert.deepEqual(calls[0].options.headers, { "Content-Type": "application/octet-stream" });
  assert.deepEqual(calls[1].options.headers, { "X-Chunk": "second" });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, undefined);
});

test("confirmScreenshot patches uploaded and the MD5 checksum", async () => {
  const calls = [];
  const api = {
    async patch(path, body) {
      calls.push({ path, body });
      return { data: { id: "screenshot-id" } };
    },
  };
  const checksum = createHash("md5").update("image").digest("hex");
  await confirmScreenshot("screenshot-id", checksum, api);
  assert.deepEqual(calls, [{
    path: "/v1/appScreenshots/screenshot-id",
    body: {
      data: {
        type: "appScreenshots",
        id: "screenshot-id",
        attributes: { uploaded: true, sourceFileChecksum: checksum },
      },
    },
  }]);
});

test("uploadScreenshots creates a missing empty set and verifies COMPLETE", async () => {
  const directory = temporaryDirectory();
  const files = SCREENSHOT_SPECS.filter(({ platform }) => platform === "macos").map(({ fileName }) => {
    const file = join(directory, fileName);
    writePng(file, 2880, 1800);
    return file;
  });
  const calls = [];
  const api = {
    async get(path) {
      calls.push(["get", path]);
      if (path.endsWith("appScreenshotSets")) return { data: [] };
      const fileName = path.split("/").at(-1);
      return {
        data: {
          attributes: {
            fileName,
            imageAsset: { width: 2880, height: 1800 },
            assetDeliveryState: { state: "COMPLETE" },
          },
        },
      };
    },
    async post(path, body) {
      calls.push(["post", path, body]);
      if (path === "/v1/appScreenshotSets") return { data: { id: "set-id" } };
      return { data: { id: `screenshot-${calls.length}`, attributes: { uploadOperations: [] } } };
    },
    async patch(path, body) {
      calls.push(["patch", path, body]);
      return { data: {} };
    },
  };
  const results = await uploadScreenshots({
    localizationId: "localization-id",
    displayType: "APP_DESKTOP",
    files,
    api,
  });
  assert.equal(results.length, 4);
  assert.ok(results.every(({ state }) => state === "COMPLETE"));
  assert.equal(calls.filter(([method]) => method === "post").length, 5);
  assert.equal(calls.filter(([method]) => method === "patch").length, 4);
});

test("uploadScreenshots refuses a non-empty remote set", async () => {
  const directory = temporaryDirectory();
  const files = SCREENSHOT_SPECS.filter(({ platform }) => platform === "macos").map(({ fileName }) => {
    const file = join(directory, fileName);
    writePng(file, 2880, 1800);
    return file;
  });
  const calls = [];
  const api = {
    async get() {
      return {
        data: [{
          id: "set-id",
          attributes: { screenshotDisplayType: "APP_DESKTOP" },
          relationships: { appScreenshots: { data: [{ id: "existing" }] } },
        }],
      };
    },
    async post(...args) {
      calls.push(args);
      throw new Error("POST must not happen");
    },
  };
  await assert.rejects(
    () => uploadScreenshots({ localizationId: "localization-id", displayType: "APP_DESKTOP", files, api }),
    /non-empty/,
  );
  assert.equal(calls.length, 0);
});

test("uploadScreenshots dry-run validates files without any API call", async () => {
  const directory = temporaryDirectory();
  const files = SCREENSHOT_SPECS.filter(({ platform }) => platform === "macos").map(({ fileName }) => {
    const file = join(directory, fileName);
    writePng(file, 2880, 1800);
    return file;
  });
  const api = {
    async get() { throw new Error("GET must not happen"); },
    async post() { throw new Error("POST must not happen"); },
    async patch() { throw new Error("PATCH must not happen"); },
  };
  const results = await uploadScreenshots({
    localizationId: "localization-id",
    displayType: "APP_DESKTOP",
    files,
    dryRun: true,
    api,
  });
  assert.equal(results.length, 4);
  assert.ok(results.every(({ state }) => state === "DRY_RUN"));
});
