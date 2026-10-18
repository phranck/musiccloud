#if os(macOS)
import Foundation
import Testing
@testable import musiccloud

// MARK: - SkyTokensTests

struct SkyTokensTests {
    /// The `shader` object as the backend serves it, with every value moved
    /// off its default so a field read from the wrong key shows.
    private static let fullShader = """
    {
      "vignette": 0.2, "skyWidth": 6000, "skyHeight": 3000, "skyFov": 90,
      "polarisX": 0.4, "polarisY": 0.7, "rotationPeriod": 900,
      "catalogSize": 2, "catalogBrightness": 1.2, "starDensity": 200, "starSize": 1.3,
      "starBrightness": 0.8, "twinkleAmount": 0.5, "twinkleSpeed": 2,
      "cloudScale": 8, "cloudCoverage": 0.4, "cloudSoftness": 0.2, "cloudOpacity": 0.9,
      "cloudNightBrightness": 1.5, "cloudDayBrightness": 1.1, "cloudDetail": 5,
      "clearZones": 0.3, "warpStrength": 0.25, "windSpeed": 0.02, "windAngle": 90,
      "evolveSpeed": 0.05, "moonIntensity": 0.3, "moonAngle": 100,
      "sunIntensity": 0.8, "sunAngle": 140, "starOcclusion": 0.2, "renderScale": 0.8,
      "fpsCap": 12, "dayness": 1, "animate": 1,
      "skyTop": "#010203", "skyBottom": "#040506", "skyTopDay": "#070809",
      "skyBottomDay": "#0a0b0c", "cloudColor": "#0d0e0f", "cloudColorDay": "#FFEEDD"
    }
    """

    private func decode(_ json: String) throws -> SkyTokens { try JSONDecoder().decode(SkyTokens.self, from: Data(json.utf8)) }

    @Test func aFullShaderObjectSetsEveryField() throws {
        let tokens = try decode(Self.fullShader)
        #expect(tokens.vignette == 0.2)
        #expect(tokens.skyWidth == 6000)
        #expect(tokens.skyHeight == 3000)
        #expect(tokens.polarisY == 0.7)
        #expect(tokens.cloudDetail == 5)
        #expect(tokens.windSpeed == 0.02)
        #expect(tokens.renderScale == 0.8)
        #expect(tokens.fpsCap == 12)
        #expect(tokens.skyTop == SkyColor(0x010203))
        #expect(tokens.cloudColorDay == SkyColor(0xffeedd))
        for field in SkyTokens.shaderNumbers {
            #expect(tokens[keyPath: field.keyPath] != SkyTokens()[keyPath: field.keyPath], "\(field.name) kept its default")
        }
        for field in SkyTokens.shaderColors {
            #expect(tokens[keyPath: field.keyPath] != SkyTokens()[keyPath: field.keyPath], "\(field.name) kept its default")
        }
    }

    @Test func missingAndInvalidFieldsKeepTheirDefaults() throws {
        let tokens = try decode(
            """
            { "windSpeed": 0.03, "cloudCoverage": "much", "skyTop": "#123", "skyBottom": "12345678",
              "skyTopDay": "#+12345", "cloudColor": "#abcdef" }
            """
        )
        var expected = SkyTokens()
        expected.windSpeed = 0.03
        expected.cloudColor = SkyColor(0xabcdef)
        #expect(tokens == expected)
    }

    @Test func anEmptyObjectIsTheDefaults() throws { #expect(try decode("{}") == SkyTokens()) }

    @Test func theDesignTokenResponseReadsItsShaderObject() throws {
        let json = #"{ "cardRadius": 28, "shader": \#(Self.fullShader) }"#
        struct Response: Decodable { let shader: SkyTokens }
        let response = try JSONDecoder().decode(Response.self, from: Data(json.utf8))
        #expect(response.shader == (try decode(Self.fullShader)))
    }

    @Test func savedTokensReadBackUnchanged() throws {
        let tokens = try decode(Self.fullShader)
        let data = try JSONEncoder().encode(tokens)
        #expect(try JSONDecoder().decode(SkyTokens.self, from: data) == tokens)
    }

    @Test(arguments: [
        ("#000000", [Float(0), 0, 0]), ("#ffffff", [Float(1), 1, 1]), ("#FF8000", [Float(1), Float(128) / 255, 0]),
        ("#0a1116", [Float(10) / 255, Float(17) / 255, Float(22) / 255]),
    ]) func hexColorsBecomeComponents(_ hex: String, _ components: [Float]) throws {
        let color = try #require(SkyColor(hex: hex))
        #expect(color.components == components)
        #expect(color.hex == hex.lowercased())
    }

    @Test(arguments: ["", "#", "0a1116", "#0a111", "#0a11166", "#0a11g6", "#-12345", "#+12345", "red"]) func otherTextIsNoColor(
        _ text: String
    ) { #expect(SkyColor(hex: text) == nil) }

    /// `NightSky.metal` reads the colors from position 32 on and needs
    /// `slot::count`, 50 values.
    @Test func shaderValuesFollowTheSlotsOfTheMetalFile() {
        var tokens = SkyTokens()
        tokens.vignette = 0.25
        tokens.renderScale = 0.5
        tokens.skyTop = SkyColor(0xff0000)
        tokens.cloudColorDay = SkyColor(0x0000ff)
        let values = tokens.shaderValues
        #expect(values.count == 50)
        #expect(values[0] == 0.25)
        #expect(values[31] == 0.5)
        #expect(Array(values[32..<35]) == [1, 0, 0])
        #expect(Array(values[47..<50]) == [0, 0, 1])
    }
}

#endif
