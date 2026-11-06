import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export const SCREENSHOT_SPECS = [
  spec("iphone-home-light.png", "captureIPhoneHomeLight", "ios", "APP_IPHONE_67", 1320, 2868),
  spec("iphone-home-dark.png", "captureIPhoneHomeDark", "ios", "APP_IPHONE_67", 1320, 2868),
  spec("iphone-settings-light.png", "captureIPhoneSettingsLight", "ios", "APP_IPHONE_67", 1320, 2868),
  spec("iphone-settings-dark.png", "captureIPhoneSettingsDark", "ios", "APP_IPHONE_67", 1320, 2868),
  spec("ipad-history-light.png", "captureIPadHistoryLight", "ipados", "APP_IPAD_PRO_3GEN_129", 2064, 2752),
  spec("ipad-history-dark.png", "captureIPadHistoryDark", "ipados", "APP_IPAD_PRO_3GEN_129", 2064, 2752),
  spec("ipad-settings-light.png", "captureIPadSettingsLight", "ipados", "APP_IPAD_PRO_3GEN_129", 2064, 2752),
  spec("ipad-settings-dark.png", "captureIPadSettingsDark", "ipados", "APP_IPAD_PRO_3GEN_129", 2064, 2752),
  spec("mac-history-light.png", "captureMacHistoryLight", "macos", "APP_DESKTOP", 2880, 1800),
  spec("mac-history-dark.png", "captureMacHistoryDark", "macos", "APP_DESKTOP", 2880, 1800),
  spec("mac-settings-light.png", "captureMacSettingsLight", "macos", "APP_DESKTOP", 2880, 1800),
  spec("mac-settings-dark.png", "captureMacSettingsDark", "macos", "APP_DESKTOP", 2880, 1800),
];

const destinations = {
  ios: "iOS Simulator,id=2893D52A-F5E4-4608-B56A-55BE942F76D4",
  ipados: "iOS Simulator,id=7711CC67-0139-478A-BC15-4B784911776C",
  macos: "macOS,arch=arm64",
};

function spec(fileName, testName, platform, displayType, width, height) {
  return { fileName, testId: `AppStoreScreenshotTests/${testName}()`, platform, displayType, width, height };
}

export function readImageSize(path) {
  if (!existsSync(path)) throw new Error(`Missing screenshot: ${path}`);
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!width || !height) throw new Error(`Could not read PNG dimensions for ${path}`);
  return { width, height };
}

export async function validateScreenshot(path, expected) {
  const { width, height } = readImageSize(path);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`${basename(path)} must be ${expected.width} x ${expected.height}, got ${width} x ${height}`);
  }
}

export function collectAttachments(manifest, sourceDirectory, outputDirectory, platform) {
  const specs = SCREENSHOT_SPECS.filter((candidate) => candidate.platform === platform);
  const expected = new Map(specs.map((candidate) => [candidate.testId, candidate]));
  const seen = new Set();

  for (const entry of manifest) {
    const expectedSpec = expected.get(entry.testIdentifier);
    if (!expectedSpec) continue;
    if (seen.has(expectedSpec.testId)) throw new Error(`Duplicate attachment for ${expectedSpec.testId}`);
    seen.add(expectedSpec.testId);
    if (!Array.isArray(entry.attachments) || entry.attachments.length !== 1) {
      throw new Error(`Expected exactly one attachment for ${expectedSpec.testId}`);
    }
    const source = join(sourceDirectory, entry.attachments[0].exportedFileName);
    copyFileSync(source, join(outputDirectory, expectedSpec.fileName), constants.COPYFILE_EXCL);
  }

  for (const expectedSpec of specs) {
    if (!seen.has(expectedSpec.testId)) throw new Error(`Missing attachment for ${expectedSpec.testId}`);
  }
  return specs.map(({ fileName }) => fileName);
}

const screenshotSources = JSON.parse(
  readFileSync(new URL("./fixtures/apple-app-store-screenshot-sources.json", import.meta.url), "utf8"),
);

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}`);
  return response.json();
}

async function fetchArtwork(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Artwork request failed with HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`Artwork response is not an image: ${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Artwork response has an invalid size");
  return bytes;
}

export async function prepareFixtures() {
  const directory = join(repositoryRoot, ".tmp/ScreenshotFixtures");
  mkdirSync(directory, { recursive: true });
  copyFileSync(
    new URL("./fixtures/apple-app-store-screenshot-sources.json", import.meta.url),
    join(directory, "sources.json"),
  );

  for (let index = 0; index < screenshotSources.length; index += 1) {
    const sourceUrl = screenshotSources[index];
    const file = join(directory, `${index}.json`);
    if (existsSync(file)) continue;
    const resolved = await fetchJson("https://musiccloud.io/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: sourceUrl }),
    });
    const mediaType = resolved.track ? "track" : resolved.album ? "album" : "artist";
    const artworkUrl = resolved[mediaType]?.artworkUrl;
    if (!artworkUrl) throw new Error(`Resolved fixture ${index} has no artwork URL`);
    const artwork = await fetchArtwork(artworkUrl);
    const entry = {
      originalUrl: sourceUrl,
      shortUrl: resolved.shortUrl,
      mediaType,
      artworkImageData: artwork.toString("base64"),
      date: new Date().toISOString(),
      track: resolved.track,
      album: resolved.album,
      artist: resolved.artist,
      serviceLinks: resolved.links ?? [],
    };
    writeFileSync(file, JSON.stringify(entry));
  }

  const ruby = `
    require 'xcodeproj'
    project = Xcodeproj::Project.open('apps/Apple/musiccloud.xcodeproj')
    target = project.targets.find { |candidate| candidate.name == 'musiccloudTests' }
    abort 'musiccloudTests target missing' unless target
    resources = target.resources_build_phase || target.new_resources_build_phase
    group = project.main_group.find_subpath('musiccloudTests/Visual/Fixtures', true)
    group.set_source_tree('<group>')
    group.set_path('../../../../.tmp/ScreenshotFixtures')
    Dir.glob(File.join(Dir.pwd, '.tmp/ScreenshotFixtures/*.json')).sort.each do |path|
      name = File.basename(path)
      next if group.files.any? { |file| file.path == name }
      reference = group.new_file(name)
      reference.last_known_file_type = 'text.json'
      resources.add_file_reference(reference)
    end
    project.save
  `;
  execFileSync("ruby", ["-e", ruby], { cwd: repositoryRoot, stdio: "inherit" });
  return directory;
}

export async function capture({ platforms = ["ios", "ipados", "macos"], outputDirectory } = {}) {
  await prepareFixtures();
  const output = outputDirectory ?? mkdtempSync(join(tmpdir(), "musiccloud-app-store-screenshots-"));
  mkdirSync(output, { recursive: true });

  for (const platform of platforms) {
    const destination = destinations[platform];
    if (!destination) throw new Error(`Unknown platform: ${platform}`);
    const workspace = mkdtempSync(join(tmpdir(), `musiccloud-capture-${platform}-`));
    const resultBundle = join(workspace, "result.xcresult");
    const exported = join(workspace, "attachments");
    execFileSync(
      "xcodebuild",
      [
        "-project", "apps/Apple/musiccloud.xcodeproj",
        "-scheme", "musiccloud",
        "-destination", `platform=${destination}`,
        "-derivedDataPath", join(workspace, "derived"),
        "-resultBundlePath", resultBundle,
        "-only-testing:musiccloudTests/AppStoreScreenshotTests",
        "test",
      ],
      { cwd: repositoryRoot, stdio: "inherit" },
    );
    execFileSync(
      "xcrun",
      ["xcresulttool", "export", "attachments", "--path", resultBundle, "--output-path", exported, "--filter", "*.png"],
      { stdio: "inherit" },
    );
    const manifest = JSON.parse(readFileSync(join(exported, "manifest.json"), "utf8"));
    collectAttachments(manifest, exported, output, platform);
  }

  for (const expected of SCREENSHOT_SPECS.filter((candidate) => platforms.includes(candidate.platform))) {
    await validateScreenshot(join(output, expected.fileName), expected);
  }
  return output;
}

export function buildScreenshotSetPayload(localizationId, displayType) {
  return {
    data: {
      type: "appScreenshotSets",
      attributes: { screenshotDisplayType: displayType },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: "appStoreVersionLocalizations", id: localizationId },
        },
      },
    },
  };
}

export async function createScreenshotReservation(file, setId) {
  return {
    data: {
      type: "appScreenshots",
      attributes: { fileName: basename(file), fileSize: statSync(file).size },
      relationships: {
        appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
      },
    },
  };
}

export async function executeUploadOperations(file, operations, fetchImpl = fetch) {
  const bytes = readFileSync(file);
  for (const operation of operations) {
    const { method, url, offset, length } = operation;
    if (offset < 0 || length < 0 || offset + length > bytes.length) {
      throw new Error(`Invalid upload range ${offset}:${length} for ${basename(file)}`);
    }
    const headers = Object.fromEntries((operation.requestHeaders ?? []).map(({ name, value }) => [name, value]));
    const response = await fetchImpl(url, { method, headers, body: bytes.subarray(offset, offset + length) });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Screenshot upload failed with HTTP ${response.status}: ${detail}`);
    }
  }
}

export async function confirmScreenshot(id, checksum, api) {
  await api.patch(`/v1/appScreenshots/${id}`, {
    data: {
      type: "appScreenshots",
      id,
      attributes: { uploaded: true, sourceFileChecksum: checksum },
    },
  });
}

function createAscClient() {
  const candidates = [
    `${process.env.HOME}/.agents/skill-sets/apple/lw-app-release/scripts/asc.py`,
    `${process.env.HOME}/.claude/skills/lw-app-release/scripts/asc.py`,
  ];
  const helper = candidates.find((candidate) => existsSync(candidate));
  if (!helper) throw new Error("App Store Connect API helper not found");

  function call(method, path, body, paginate) {
    const args = ["run", "--with", "cryptography", "python3", helper, method, path];
    if (body !== undefined) {
      const directory = mkdtempSync(join(tmpdir(), "musiccloud-asc-payload-"));
      const payload = join(directory, "payload.json");
      writeFileSync(payload, JSON.stringify(body));
      args.push("--data-file", payload);
    }
    if (paginate) args.push("--paginate");
    const output = execFileSync("uv", args, { encoding: "utf8" });
    return output.trim() ? JSON.parse(output) : null;
  }

  return {
    get: (path, paginate = false) => call("get", path, undefined, paginate),
    post: (path, body) => call("post", path, body, false),
    patch: (path, body) => call("patch", path, body, false),
  };
}

export async function uploadScreenshots({
  localizationId,
  displayType,
  files,
  inputDirectory,
  dryRun = false,
  api = dryRun ? undefined : createAscClient(),
}) {
  const specs = SCREENSHOT_SPECS.filter((candidate) => candidate.displayType === displayType);
  if (!specs.length) throw new Error(`Unknown display type: ${displayType}`);
  const selectedFiles = files ?? specs.map(({ fileName }) => join(inputDirectory ?? "", fileName));
  if (selectedFiles.length !== specs.length) {
    throw new Error(`Expected ${specs.length} screenshots for ${displayType}, got ${selectedFiles.length}`);
  }

  const checksums = new Map();
  for (let index = 0; index < specs.length; index += 1) {
    const file = selectedFiles[index];
    await validateScreenshot(file, specs[index]);
    checksums.set(file, createHash("md5").update(readFileSync(file)).digest("hex"));
  }

  if (dryRun) {
    return selectedFiles.map((file) => ({
      fileName: basename(file),
      fileSize: statSync(file).size,
      checksum: checksums.get(file),
      state: "DRY_RUN",
    }));
  }

  const setResponse = await api.get(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`, true);
  let set = setResponse.data.find(({ attributes }) => attributes.screenshotDisplayType === displayType);
  if (set) {
    const existing = await api.get(`/v1/appScreenshotSets/${set.id}/appScreenshots`, true);
    if (existing.data.length) throw new Error(`Refusing to upload into a non-empty screenshot set: ${set.id}`);
  } else {
    const created = await api.post("/v1/appScreenshotSets", buildScreenshotSetPayload(localizationId, displayType));
    set = created.data;
  }

  const results = [];
  for (const file of selectedFiles) {
    const reservation = await createScreenshotReservation(file, set.id);
    const created = await api.post("/v1/appScreenshots", reservation);
    const screenshot = created.data;
    await executeUploadOperations(file, screenshot.attributes.uploadOperations ?? []);
    await confirmScreenshot(screenshot.id, checksums.get(file), api);

    let readback;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      readback = await api.get(`/v1/appScreenshots/${screenshot.id}`);
      const state = readback.data.attributes.assetDeliveryState?.state;
      if (state === "COMPLETE") break;
      if (state === "FAILED") throw new Error(`Screenshot ${screenshot.id} failed asset processing`);
      if (attempt === 29) throw new Error(`Screenshot ${screenshot.id} did not reach COMPLETE`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const attributes = readback.data.attributes;
    const expected = specs[selectedFiles.indexOf(file)];
    if (attributes.imageAsset?.width !== expected.width || attributes.imageAsset?.height !== expected.height) {
      throw new Error(`Screenshot ${screenshot.id} has unexpected remote dimensions`);
    }
    results.push({
      id: screenshot.id,
      fileName: attributes.fileName,
      width: attributes.imageAsset.width,
      height: attributes.imageAsset.height,
      state: attributes.assetDeliveryState.state,
    });
  }
  return results;
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "capture") {
    const platforms = [];
    let outputDirectory;
    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index];
      if (argument === "--platform") {
        platforms.push(arguments_[index + 1]);
        index += 1;
      } else if (argument === "--output") {
        outputDirectory = arguments_[index + 1];
        index += 1;
      } else {
        throw new Error(`Unknown argument: ${argument}`);
      }
    }
    const output = await capture({ platforms: platforms.length ? platforms : undefined, outputDirectory });
    console.log(output);
    return;
  }

  if (command === "upload") {
    const options = { files: undefined, inputDirectory: undefined, dryRun: false };
    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index];
      if (argument === "--localization") {
        options.localizationId = arguments_[index + 1];
        index += 1;
      } else if (argument === "--display-type") {
        options.displayType = arguments_[index + 1];
        index += 1;
      } else if (argument === "--input") {
        options.inputDirectory = arguments_[index + 1];
        index += 1;
      } else if (argument === "--dry-run") {
        options.dryRun = true;
      } else {
        throw new Error(`Unknown argument: ${argument}`);
      }
    }
    if (!options.localizationId || !options.displayType || !options.inputDirectory) {
      throw new Error("upload requires --localization, --display-type, and --input");
    }
    const results = await uploadScreenshots(options);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("Usage: node scripts/apple-app-store-screenshots.mjs capture [--platform ios|ipados|macos] [--output directory]");
  console.log("       node scripts/apple-app-store-screenshots.mjs upload --localization ID --display-type TYPE --input directory [--dry-run]");
  if (command !== "--help" && command !== "-h") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
