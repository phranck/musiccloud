#if os(macOS)
//
//  SkyTokens.swift
//  musiccloud
//

import Foundation

// MARK: - SkyTokens

/// The values the website's sky is drawn with: the `shader` object of the
/// design tokens the backend serves at `/api/v1/site-settings/design-tokens`.
///
/// The website reads the same object (`mergeShaderTokens` in
/// `apps/frontend/src/components/background/BackgroundScene.tsx`), so a change
/// in the dashboard reaches the website and the app alike. The backend
/// validates the object against the ranges of `SHADER_NUMBER_SPECS` in
/// `packages/shared/src/design-tokens.ts` before it serves it.
///
/// Every field falls back on its own. A field the answer lacks, or one that
/// is not a finite number or a `#rrggbb` color, keeps the value written here.
/// These values are the only copy of the defaults: `NightSky.metal` reads
/// every value from its arguments.
struct SkyTokens: Equatable, Sendable {
    var vignette: Float = 0.1
    var skyWidth: Float = 5632
    var skyHeight: Float = 3168
    var skyFov: Float = 110
    var polarisX: Float = 0.5
    var polarisY: Float = 0.66
    var rotationPeriod: Float = 1200
    var catalogSize: Float = 1.7
    var catalogBrightness: Float = 1.1
    var starDensity: Float = 170
    var starSize: Float = 1.1
    var starBrightness: Float = 0.95
    var twinkleAmount: Float = 0.6
    var twinkleSpeed: Float = 1.8
    var cloudScale: Float = 10
    var cloudCoverage: Float = 0.32
    var cloudSoftness: Float = 0.15
    var cloudOpacity: Float = 1
    var cloudNightBrightness: Float = 2.1
    var cloudDayBrightness: Float = 0.9
    var cloudDetail: Float = 7
    var clearZones: Float = 0.4
    var warpStrength: Float = 0.15
    var windSpeed: Float = 0.015
    var windAngle: Float = 180
    var evolveSpeed: Float = 0.035
    var moonIntensity: Float = 0.15
    var moonAngle: Float = 120
    var sunIntensity: Float = 1
    var sunAngle: Float = 120
    var starOcclusion: Float = 0.1
    var renderScale: Float = 0.7
    /// The website's idle frame rate. The sky moves slowly enough that more
    /// frames would only cost energy.
    var fpsCap: Float = 8
    var skyTop = SkyColor(0x0a1116)
    var skyBottom = SkyColor(0x122d44)
    var skyTopDay = SkyColor(0x0076d5)
    var skyBottomDay = SkyColor(0x69d1fd)
    var cloudColor = SkyColor(0x2c3b47)
    var cloudColorDay = SkyColor(0xe6edf3)
}

// MARK: - Shader arguments

extension SkyTokens {
    /// A number field, named as in the design tokens.
    struct NumberField: Sendable {
        let name: String
        let keyPath: WritableKeyPath<SkyTokens, Float> & Sendable
    }

    /// A color field, named as in the design tokens.
    struct ColorField: Sendable {
        let name: String
        let keyPath: WritableKeyPath<SkyTokens, SkyColor> & Sendable
    }

    /// The numbers `nightSkyColor` reads, in the order of its `values`
    /// argument. The `slot` enum in `NightSky.metal` names the same
    /// positions, so a change here changes it there.
    static let shaderNumbers: [NumberField] = [
        NumberField(name: "vignette", keyPath: \.vignette), NumberField(name: "skyWidth", keyPath: \.skyWidth),
        NumberField(name: "skyHeight", keyPath: \.skyHeight), NumberField(name: "skyFov", keyPath: \.skyFov),
        NumberField(name: "polarisX", keyPath: \.polarisX), NumberField(name: "polarisY", keyPath: \.polarisY),
        NumberField(name: "rotationPeriod", keyPath: \.rotationPeriod), NumberField(name: "catalogSize", keyPath: \.catalogSize),
        NumberField(name: "catalogBrightness", keyPath: \.catalogBrightness), NumberField(name: "starDensity", keyPath: \.starDensity),
        NumberField(name: "starSize", keyPath: \.starSize), NumberField(name: "starBrightness", keyPath: \.starBrightness),
        NumberField(name: "twinkleAmount", keyPath: \.twinkleAmount), NumberField(name: "twinkleSpeed", keyPath: \.twinkleSpeed),
        NumberField(name: "cloudScale", keyPath: \.cloudScale), NumberField(name: "cloudCoverage", keyPath: \.cloudCoverage),
        NumberField(name: "cloudSoftness", keyPath: \.cloudSoftness), NumberField(name: "cloudOpacity", keyPath: \.cloudOpacity),
        NumberField(name: "cloudNightBrightness", keyPath: \.cloudNightBrightness),
        NumberField(name: "cloudDayBrightness", keyPath: \.cloudDayBrightness), NumberField(name: "cloudDetail", keyPath: \.cloudDetail),
        NumberField(name: "clearZones", keyPath: \.clearZones), NumberField(name: "warpStrength", keyPath: \.warpStrength),
        NumberField(name: "windSpeed", keyPath: \.windSpeed), NumberField(name: "windAngle", keyPath: \.windAngle),
        NumberField(name: "evolveSpeed", keyPath: \.evolveSpeed), NumberField(name: "moonIntensity", keyPath: \.moonIntensity),
        NumberField(name: "moonAngle", keyPath: \.moonAngle), NumberField(name: "sunIntensity", keyPath: \.sunIntensity),
        NumberField(name: "sunAngle", keyPath: \.sunAngle), NumberField(name: "starOcclusion", keyPath: \.starOcclusion),
        NumberField(name: "renderScale", keyPath: \.renderScale),
    ]

    /// The colors `nightSkyColor` reads, after ``shaderNumbers`` and three
    /// positions each. The `slot` enum in `NightSky.metal` names them too.
    static let shaderColors: [ColorField] = [
        ColorField(name: "skyTop", keyPath: \.skyTop), ColorField(name: "skyBottom", keyPath: \.skyBottom),
        ColorField(name: "skyTopDay", keyPath: \.skyTopDay), ColorField(name: "skyBottomDay", keyPath: \.skyBottomDay),
        ColorField(name: "cloudColor", keyPath: \.cloudColor), ColorField(name: "cloudColorDay", keyPath: \.cloudColorDay),
    ]

    /// The number the app reads itself rather than the shader.
    static let frameRateField = NumberField(name: "fpsCap", keyPath: \.fpsCap)

    /// Every number field, the ones the shader reads and the frame rate.
    private static var numberFields: [NumberField] { shaderNumbers + [frameRateField] }

    /// The `values` argument of `nightSkyColor`: the numbers of
    /// ``shaderNumbers`` in order, then each color of ``shaderColors`` as
    /// red, green and blue.
    var shaderValues: [Float] {
        Self.shaderNumbers.map { self[keyPath: $0.keyPath] } + Self.shaderColors.flatMap { self[keyPath: $0.keyPath].components }
    }
}

// MARK: - Codable

extension SkyTokens: Codable {
    /// A key of the `shader` object, which the field tables name.
    private struct TokenKey: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }

        init(stringValue: String) { self.stringValue = stringValue }

        init?(intValue: Int) { nil }
    }

    /// Reads every field that is present and valid and keeps the default for
    /// the rest, so one bad value in the dashboard costs only that value.
    init(from decoder: any Decoder) throws {
        self.init()
        let container = try decoder.container(keyedBy: TokenKey.self)
        for field in Self.numberFields {
            let key = TokenKey(stringValue: field.name)
            if let number = try? container.decodeIfPresent(Float.self, forKey: key), number.isFinite {
                self[keyPath: field.keyPath] = number
            }
        }
        for field in Self.shaderColors {
            let key = TokenKey(stringValue: field.name)
            if let hex = try? container.decodeIfPresent(String.self, forKey: key), let color = SkyColor(hex: hex) {
                self[keyPath: field.keyPath] = color
            }
        }
    }

    /// Writes the fields with the names and formats of the design tokens, so
    /// the saved copy reads back through ``init(from:)``.
    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: TokenKey.self)
        for field in Self.numberFields { try container.encode(self[keyPath: field.keyPath], forKey: TokenKey(stringValue: field.name)) }
        for field in Self.shaderColors { try container.encode(self[keyPath: field.keyPath].hex, forKey: TokenKey(stringValue: field.name)) }
    }
}

// MARK: - Loading

extension SkyTokens {
    /// The file in `Application Support/musiccloud` that keeps the last
    /// values the backend served, so an offline start draws the same sky.
    static let savedFileName = "sky-tokens.json"

    /// The answer of the design-token route. Only the sky is read.
    private struct DesignTokens: Decodable { let shader: SkyTokens }

    /// The values saved after the last successful ``fetchAndSave(from:directory:)``.
    ///
    /// - Parameter directory: The folder of ``savedFileName``.
    /// - Returns: The saved values, or `nil` before the first success.
    @concurrent static func saved(in directory: URL? = .applicationSupportFolder()) async -> SkyTokens? {
        directory.flatMap { savedFile(in: $0).load() }
    }

    /// Asks the backend for the current values and saves them on success.
    ///
    /// The route is public, so the request needs no app session. It runs on
    /// the concurrent pool, so decoding and writing the file never occupy the
    /// main actor.
    ///
    /// - Parameters:
    ///   - base: The backend, ``MusicCloudAPI/appAccessURL`` by default,
    ///     which is where the website reads the tokens from too.
    ///   - directory: The folder of ``savedFileName``, or `nil` to save nothing.
    /// - Returns: The values, or `nil` when the backend cannot be reached or
    ///   answers with something other than design tokens.
    @concurrent static func fetchAndSave(
        from base: URL = MusicCloudAPI.appAccessURL,
        directory: URL? = .applicationSupportFolder()
    ) async -> SkyTokens? {
        var request = URLRequest(url: base.appending(path: "api/v1/site-settings/design-tokens"))
        request.timeoutInterval = 10
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(statusCode)
            else {
                AppLogger.api.error("Design tokens answered HTTP \(statusCode)")
                return nil
            }
            let tokens = try JSONDecoder().decode(DesignTokens.self, from: data).shader
            if let directory { savedFile(in: directory).save(tokens) }
            return tokens
        } catch {
            AppLogger.api.error("Design tokens could not be loaded: \(error.localizedDescription)")
            return nil
        }
    }

    private static func savedFile(in directory: URL) -> JSONFile<SkyTokens> {
        JSONFile(url: directory.appending(path: savedFileName), label: "Sky tokens")
    }
}

// MARK: - SkyColor

/// A design-token color, `#rrggbb` in the tokens and red, green and blue in
/// 0...1 for the shader, which is how `hexToRgb` in the website's `scene.ts`
/// reads it.
struct SkyColor: Equatable, Sendable {
    /// The color as `0xRRGGBB`.
    let rgb: UInt32

    /// The color `0xRRGGBB`, as a design token writes `#rrggbb`.
    init(_ rgb: UInt32) { self.rgb = rgb & 0xFFFFFF }

    /// The color `#rrggbb`, or `nil` for any other text, which is the only
    /// form the backend serves.
    init?(hex: String) {
        guard
            hex.count == 7,
            hex.first == "#"
        else {
            return nil
        }
        let digits = hex.dropFirst()
        guard
            digits.allSatisfy(\.isHexDigit),
            let rgb = UInt32(digits, radix: 16)
        else {
            return nil
        }
        self.init(rgb)
    }

    /// The color as `#rrggbb`.
    var hex: String { "#" + String(rgb, radix: 16).leftPadded(to: 6) }

    /// Red, green and blue in 0...1.
    var components: [Float] { [rgb >> 16, rgb >> 8, rgb].map { Float($0 & 0xFF) / 255 } }
}

private extension String {
    /// The string with leading zeros up to `length` characters.
    func leftPadded(to length: Int) -> String { String(repeating: "0", count: max(0, length - count)) + self }
}

#endif
