//
//  NightSky.metal
//  musiccloud
//
//  The sky of musiccloud.io as a SwiftUI color effect. This is a port of the
//  website's WebGL scene in apps/frontend/src/components/background/nightSky/
//  (scene.ts for the shader math, settings.ts for the parameters, catalog.ts
//  for the stars). The website draws three passes into one framebuffer; this
//  function computes all three for one pixel and composites them the same way,
//  clamping after each pass like the website's 8-bit framebuffer does.
//

#include <metal_stdlib>
#include <SwiftUI/SwiftUI.h>
using namespace metal;

namespace nightsky {

constant float TAU = 6.28318530718;

// MARK: - Settings

// The positions in the `values` argument of nightSkyColor. The order is
// defined by SkyTokens.shaderNumbers and SkyTokens.shaderColors in
// SkyTokens.swift, so a change there changes this list. A color takes three
// positions: red, green and blue in 0...1.
namespace slot {
enum : int {
    vignette,
    skyWidth,
    skyHeight,
    skyFov,
    polarisX,
    polarisY,
    rotationPeriod,
    catalogSize,
    catalogBrightness,
    starDensity,
    starSize,
    starBrightness,
    twinkleAmount,
    twinkleSpeed,
    cloudScale,
    cloudCoverage,
    cloudSoftness,
    cloudOpacity,
    cloudNightBrightness,
    cloudDayBrightness,
    cloudDetail,
    clearZones,
    warpStrength,
    windSpeed,
    windAngle,
    evolveSpeed,
    moonIntensity,
    moonAngle,
    sunIntensity,
    sunAngle,
    starOcclusion,
    renderScale,
    skyTop,
    skyBottom = skyTop + 3,
    skyTopDay = skyBottom + 3,
    skyBottomDay = skyTopDay + 3,
    cloudColor = skyBottomDay + 3,
    cloudColorDay = cloudColor + 3,
    count = cloudColorDay + 3,
};
} // namespace slot

/// The design-token values of the sky, read once per pixel from the `values`
/// argument so the helpers below take them by name.
struct SkySettings {
    float vignette;
    float2 skySize;
    float skyFov;
    float2 polaris01;
    float rotationPeriod;
    float catalogSize;
    float catalogBrightness;
    float starDensity;
    float starSize;
    float starBrightness;
    float twinkleAmount;
    float twinkleSpeed;
    float cloudScale;
    float cloudCoverage;
    float cloudSoftness;
    float cloudOpacity;
    float cloudNightBrightness;
    float cloudDayBrightness;
    float cloudDetail;
    float clearZones;
    float warpStrength;
    float windSpeed;
    float windAngle;
    float evolveSpeed;
    float moonIntensity;
    float moonAngle;
    float sunIntensity;
    float sunAngle;
    float starOcclusion;
    float renderScale;
    float3 skyTop;
    float3 skyBottom;
    float3 skyTopDay;
    float3 skyBottomDay;
    float3 cloudColor;
    float3 cloudColorDay;
};

/// The color at `index` and the two positions after it.
inline float3 readColor(device const float *values, int index) {
    return float3(values[index], values[index + 1], values[index + 2]);
}

/// Unpacks the `values` argument; the caller has checked it holds `slot::count` numbers.
SkySettings readSettings(device const float *values) {
    SkySettings settings;
    settings.vignette = values[slot::vignette];
    settings.skySize = float2(values[slot::skyWidth], values[slot::skyHeight]);
    settings.skyFov = values[slot::skyFov];
    settings.polaris01 = float2(values[slot::polarisX], values[slot::polarisY]);
    settings.rotationPeriod = values[slot::rotationPeriod];
    settings.catalogSize = values[slot::catalogSize];
    settings.catalogBrightness = values[slot::catalogBrightness];
    settings.starDensity = values[slot::starDensity];
    settings.starSize = values[slot::starSize];
    settings.starBrightness = values[slot::starBrightness];
    settings.twinkleAmount = values[slot::twinkleAmount];
    settings.twinkleSpeed = values[slot::twinkleSpeed];
    settings.cloudScale = values[slot::cloudScale];
    settings.cloudCoverage = values[slot::cloudCoverage];
    settings.cloudSoftness = values[slot::cloudSoftness];
    settings.cloudOpacity = values[slot::cloudOpacity];
    settings.cloudNightBrightness = values[slot::cloudNightBrightness];
    settings.cloudDayBrightness = values[slot::cloudDayBrightness];
    settings.cloudDetail = values[slot::cloudDetail];
    settings.clearZones = values[slot::clearZones];
    settings.warpStrength = values[slot::warpStrength];
    settings.windSpeed = values[slot::windSpeed];
    settings.windAngle = values[slot::windAngle];
    settings.evolveSpeed = values[slot::evolveSpeed];
    settings.moonIntensity = values[slot::moonIntensity];
    settings.moonAngle = values[slot::moonAngle];
    settings.sunIntensity = values[slot::sunIntensity];
    settings.sunAngle = values[slot::sunAngle];
    settings.starOcclusion = values[slot::starOcclusion];
    settings.renderScale = values[slot::renderScale];
    settings.skyTop = readColor(values, slot::skyTop);
    settings.skyBottom = readColor(values, slot::skyBottom);
    settings.skyTopDay = readColor(values, slot::skyTopDay);
    settings.skyBottomDay = readColor(values, slot::skyBottomDay);
    settings.cloudColor = readColor(values, slot::cloudColor);
    settings.cloudColorDay = readColor(values, slot::cloudColorDay);
    return settings;
}

// MARK: - Star catalog

// The 67 catalog stars of catalog.ts in the same order and units:
// right ascension in hours, declination in degrees, V magnitude, and the color
// class (0 blue-white, 1 white, 2 warm). Polaris comes first.
constant int starCount = 67;
constant float4 starCatalog[starCount] = {
    // Ursa Minor
    float4(2.53, 89.264, 1.98, 1),   // Polaris
    float4(14.845, 74.156, 2.08, 2), // Kochab
    float4(15.345, 71.834, 3.05, 1), // Pherkad
    float4(16.766, 82.037, 4.21, 2), // epsilon UMi
    float4(15.734, 77.795, 4.32, 1), // zeta UMi
    float4(17.537, 86.586, 4.35, 1), // delta UMi
    float4(16.292, 75.755, 4.95, 1), // eta UMi
    // Ursa Major
    float4(11.062, 61.751, 1.79, 2), // Dubhe
    float4(11.031, 56.382, 2.37, 1), // Merak
    float4(11.897, 53.695, 2.44, 1), // Phecda
    float4(12.257, 57.033, 3.31, 1), // Megrez
    float4(12.9, 55.96, 1.77, 1),    // Alioth
    float4(13.399, 54.925, 2.27, 1), // Mizar
    float4(13.792, 49.313, 1.86, 0), // Alkaid
    float4(8.504, 60.718, 3.36, 2),  // Muscida
    float4(9.548, 51.677, 3.18, 1),  // theta UMa
    float4(10.372, 41.499, 3.06, 2), // mu UMa
    float4(10.285, 42.914, 3.45, 1), // lambda UMa
    float4(11.161, 44.499, 3.01, 2), // psi UMa
    float4(9.525, 63.062, 3.67, 1),  // h UMa
    // Cassiopeia
    float4(0.153, 59.15, 2.27, 1),   // Caph
    float4(0.675, 56.537, 2.24, 2),  // Schedar
    float4(0.945, 60.717, 2.47, 0),  // gamma Cas
    float4(1.43, 60.235, 2.68, 1),   // Ruchbah
    float4(1.907, 63.67, 3.38, 0),   // Segin
    // Cepheus
    float4(21.31, 62.585, 2.46, 1),  // Alderamin
    float4(21.478, 70.561, 3.23, 0), // Alfirk
    float4(23.656, 77.632, 3.21, 2), // Errai
    float4(22.181, 58.201, 3.35, 2), // zeta Cep
    float4(20.754, 61.839, 3.43, 2), // eta Cep
    float4(22.828, 66.201, 3.52, 2), // iota Cep
    // Draco
    float4(17.943, 51.489, 2.23, 2), // Eltanin
    float4(17.507, 52.301, 2.79, 2), // Rastaban
    float4(16.4, 61.514, 2.74, 2),   // eta Dra
    float4(17.146, 65.715, 3.17, 0), // zeta Dra
    float4(19.209, 67.661, 3.07, 2), // Altais
    float4(15.415, 58.966, 3.29, 2), // Edasich
    float4(14.073, 64.376, 3.65, 1), // Thuban
    float4(18.351, 72.733, 3.57, 1), // chi Dra
    float4(12.558, 69.788, 3.87, 0), // kappa Dra
    float4(11.523, 69.331, 3.84, 2), // Giausar
    float4(19.802, 70.268, 3.83, 2), // epsilon Dra
    float4(17.892, 56.873, 3.75, 2), // Grumium
    // Lyra and Cygnus
    float4(18.616, 38.784, 0.03, 0), // Vega
    float4(20.69, 45.28, 1.25, 1),   // Deneb
    float4(20.371, 40.257, 2.23, 1), // Sadr
    float4(19.749, 45.131, 2.87, 0), // delta Cyg
    float4(20.77, 33.97, 2.46, 2),   // epsilon Cyg
    float4(19.285, 53.368, 3.77, 2), // kappa Cyg
    // Auriga
    float4(5.278, 45.998, 0.08, 2),  // Capella
    float4(5.992, 44.947, 1.9, 1),   // Menkalinan
    float4(5.995, 37.213, 2.65, 1),  // theta Aur
    float4(5.032, 43.823, 2.99, 1),  // epsilon Aur
    float4(5.108, 41.234, 3.18, 0),  // eta Aur
    float4(5.041, 41.076, 3.75, 2),  // zeta Aur
    float4(5.992, 54.285, 3.72, 2),  // delta Aur
    // Perseus
    float4(3.405, 49.861, 1.79, 1),  // Mirfak
    float4(3.136, 40.956, 2.09, 0),  // Algol
    float4(3.08, 53.506, 2.93, 2),   // gamma Per
    float4(3.715, 47.788, 3.01, 0),  // delta Per
    float4(2.845, 55.895, 3.77, 2),  // eta Per
    // Andromeda, Canes Venatici, Bootes, Lynx
    float4(2.065, 42.33, 2.26, 2),   // Almach
    float4(1.162, 35.62, 2.05, 2),   // Mirach
    float4(12.934, 38.318, 2.9, 1),  // Cor Caroli
    float4(14.535, 38.308, 3.03, 1), // Seginus
    float4(15.032, 40.391, 3.5, 2),  // Nekkar
    float4(9.351, 34.393, 3.13, 2),  // alpha Lyn
};

// MARK: - Helpers

/// GLSL's `radians()`, which the Metal standard library does not offer.
inline float radiansFromDegrees(float degrees) {
    return degrees * M_PI_F / 180.0;
}

/// The smoothstep formula GLSL evaluates. The website calls it with the edges
/// reversed for falloffs, which Metal's `smoothstep` leaves undefined.
inline float smoothstepGLSL(float edge0, float edge1, float value) {
    float ramp = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return ramp * ramp * (3.0 - 2.0 * ramp);
}

/// `hash21` of scene.ts: a hash of a 2D cell to 0...1.
inline float hash21(float2 point) {
    float3 p3 = fract(float3(point.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/// `hash13` of scene.ts: a hash of a 3D lattice point to 0...1.
inline float hash13(float3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.zyx + 31.32);
    return fract((point.x + point.y) * point.z);
}

/// `vnoise` of scene.ts: 3D value noise. The third axis is time, so the
/// clouds change shape instead of only drifting.
float valueNoise(float3 point) {
    float3 cell = floor(point);
    float3 local = fract(point);
    float3 weight = local * local * (3.0 - 2.0 * local);
    float n000 = hash13(cell);
    float n100 = hash13(cell + float3(1, 0, 0));
    float n010 = hash13(cell + float3(0, 1, 0));
    float n110 = hash13(cell + float3(1, 1, 0));
    float n001 = hash13(cell + float3(0, 0, 1));
    float n101 = hash13(cell + float3(1, 0, 1));
    float n011 = hash13(cell + float3(0, 1, 1));
    float n111 = hash13(cell + float3(1, 1, 1));
    return mix(
        mix(mix(n000, n100, weight.x), mix(n010, n110, weight.x), weight.y),
        mix(mix(n001, n101, weight.x), mix(n011, n111, weight.x), weight.y),
        weight.z);
}

/// `fbm` of scene.ts: up to seven octaves of value noise.
float fbm(float3 point, float octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 7; octave++) {
        if (float(octave) >= octaves) break;
        value += amplitude * valueNoise(point);
        point = point * 2.03 + float3(11.7, 5.3, 0.0);
        amplitude *= 0.5;
    }
    return value;
}

/// The outputs of `cloudRaw` in scene.ts, which GLSL returns through `out`
/// parameters.
struct CloudSample {
    float density;
    float3 warpedPoint;
    float2 domain;
    float evolution;
};

/// `cloudRaw` of scene.ts: the domain-warped cloud field at a plane position.
CloudSample cloudRaw(float2 planeCuv, float time, thread const SkySettings &settings) {
    float windRadians = radiansFromDegrees(settings.windAngle);
    float2 wind = float2(cos(windRadians), sin(windRadians)) * settings.windSpeed * time;
    float2 domain = planeCuv * settings.cloudScale + wind;
    float evolution = time * settings.evolveSpeed;
    float2 warp = float2(
        fbm(float3(domain * 0.9 + 13.1, evolution * 0.7), 3.0),
        fbm(float3(domain * 0.9 + 41.7, evolution * 0.7), 3.0)) - 0.5;
    CloudSample field;
    field.warpedPoint = float3(domain + warp * settings.warpStrength, evolution);
    field.domain = domain;
    field.evolution = evolution;
    field.density = fbm(field.warpedPoint, settings.cloudDetail);
    return field;
}

/// `cloudMask` of scene.ts: coverage threshold, with large clear windows
/// carved between the cloud banks.
float cloudMask(CloudSample field, thread const SkySettings &settings) {
    float cloud = smoothstepGLSL(1.0 - settings.cloudCoverage - settings.cloudSoftness,
                                 1.0 - settings.cloudCoverage + settings.cloudSoftness, field.density);
    float macroNoise = fbm(float3(field.domain * 0.3 + 71.3, field.evolution * 0.4), 3.0);
    return cloud * mix(1.0, smoothstepGLSL(0.36, 0.6, macroNoise), settings.clearZones);
}

/// `vignetteAt` of scene.ts: corner darkening relative to the window.
inline float vignetteAt(float2 windowCuv, float vignette) {
    return 1.0 - vignette * smoothstepGLSL(0.45, 1.25, length(windowCuv) * 1.15);
}

/// `starLayer` of scene.ts: one grid of procedural fill stars. Distances are
/// in points, which is what the website's buffer pixels divided by its pixel
/// scale amount to, so the stars keep the website's size.
float starLayer(float2 starUv, float density, float sizePoints, float brightnessFactor, float time,
                thread const SkySettings &settings) {
    float2 grid = starUv * density;
    float2 cellID = floor(grid);
    float2 local = fract(grid);
    float cellHash = hash21(cellID);
    float present = step(cellHash, 0.22);
    float2 starPosition = float2(hash21(cellID + 7.1), hash21(cellID + 3.7)) * 0.6 + 0.2;
    float distancePoints = length(local - starPosition) * (settings.skySize.y / density);
    float star = smoothstepGLSL(sizePoints, sizePoints * 0.15, distancePoints);
    float magnitude = pow(hash21(cellID + 13.3), 3.0);
    float twinkle = 1.0 + settings.twinkleAmount
                        * sin(time * settings.twinkleSpeed * (0.5 + cellHash * 2.0) + cellHash * TAU);
    return star * present * magnitude * brightnessFactor * twinkle;
}

/// Pass B of scene.ts for one pixel: the catalog stars, whose point sprites
/// the website draws additively. Each star is the vertex shader's projection
/// plus the fragment shader's soft core and halo.
float3 catalogStars(float2 pixel, float2 size, float2 skyOffset, float2 polaris, float theta,
                    float aspect, float time, float occlusion, float starVisibility, float displayScale,
                    thread const SkySettings &settings) {
    const float3 blueWhite = float3(0.72, 0.82, 1.00);
    const float3 white = float3(0.95, 0.97, 1.00);
    const float3 warm = float3(1.00, 0.86, 0.68);
    // The website's buffer pixels per point: renderScale times the device
    // pixel ratio, clamped to 2. Sprites never get smaller than one of them.
    float pixelScale = settings.renderScale * min(displayScale, 2.0);
    float3 light = float3(0.0);
    for (int index = 0; index < starCount; index++) {
        float4 star = starCatalog[index];
        float polarDistance = 90.0 - star.y;
        float negativeRightAscension = -(star.x / 24.0) * TAU;
        float angle = negativeRightAscension + theta;
        float2 planeCuv = polaris + float2(cos(angle), sin(angle)) * (polarDistance / settings.skyFov);
        float2 skyPoint = (planeCuv / float2(aspect, 1.0) + 0.5) * settings.skySize;
        float2 windowPoint = skyPoint - skyOffset;

        float magnitude = star.z;
        float sizePoints = settings.catalogSize * (0.9 + (4.2 - magnitude) * 0.55);
        float diameter = max(sizePoints * pixelScale, 1.0) / pixelScale;
        float spriteDistance = length(pixel - windowPoint) * 2.0 / diameter;
        if (spriteDistance >= 1.0) continue;

        float seed = fract(negativeRightAscension * 13.37 + polarDistance * 7.7);
        float twinkle = 1.0 + settings.twinkleAmount * 0.6
                            * sin(time * settings.twinkleSpeed * (0.6 + seed * 1.8) + seed * TAU);
        float brightness = clamp(0.18 + (4.2 - magnitude) * 0.26, 0.0, 1.3) * settings.catalogBrightness * twinkle;
        brightness *= occlusion * starVisibility;
        float2 windowCuv = (windowPoint / size - 0.5) * float2(size.x / size.y, 1.0);
        float alpha = brightness * vignetteAt(windowCuv, settings.vignette);

        float3 tint = (star.w < 0.5) ? blueWhite : (star.w < 1.5) ? white : warm;
        float core = smoothstepGLSL(1.0, 0.15, spriteDistance);
        float halo = smoothstepGLSL(1.0, 0.0, spriteDistance) * 0.25;
        light += tint * alpha * (core + halo);
    }
    return light;
}

} // namespace nightsky

/// The website's sky at one pixel of a SwiftUI view.
///
/// - Parameters:
///   - position: The pixel in the view's coordinate space, in points from the top left.
///   - color: The view's own color, which the sky replaces.
///   - size: The view's size in points. It is the website's viewport: the sky is a
///     fixed plane the view only crops, anchored so Polaris sits at the same place.
///   - time: Seconds of animation, the website's `simTimeSeconds`.
///   - dayness: 0 for the night sky with stars, 1 for the day sky.
///   - displayScale: Device pixels per point, the website's `devicePixelRatio`.
///   - values, valueCount: The design-token values in the order of `nightsky::slot`,
///     which SkyTokens.shaderValues in SkyTokens.swift supplies.
[[ stitchable ]] half4 nightSkyColor(float2 position, half4 color, float2 size, float time,
                                     float dayness, float displayScale,
                                     device const float *values, int valueCount) {
    using namespace nightsky;

    // Fewer values than slots would read past the buffer; the view's own
    // color stands in until the arguments match.
    if (valueCount < slot::count) return color;
    SkySettings settings = readSettings(values);

    // The pixel in points from the bottom left, the orientation of gl_FragCoord.
    float2 pixel = float2(position.x, size.y - position.y);
    float2 skyOffset = settings.polaris01 * (settings.skySize - size);
    float aspect = settings.skySize.x / settings.skySize.y;
    float2 planeUv = (pixel + skyOffset) / settings.skySize;
    float2 planeCuv = (planeUv - 0.5) * float2(aspect, 1.0);
    float2 windowCuv = (pixel / size - 0.5) * float2(size.x / size.y, 1.0);
    float windowVignette = vignetteAt(windowCuv, settings.vignette);
    float dither = (hash21(position * displayScale + fract(time)) - 0.5) / 255.0;

    // Pass A: sky gradient and procedural fill stars.
    float gradient = smoothstepGLSL(0.0, 1.0, planeUv.y);
    float3 night = mix(settings.skyBottom, settings.skyTop, gradient);
    float3 day = mix(settings.skyBottomDay, settings.skyTopDay, gradient);
    float3 sky = mix(night, day, dayness);

    float starVisibility = 1.0 - smoothstepGLSL(0.05, 0.45, dayness);
    float2 polaris = float2((settings.polaris01.x - 0.5) * aspect, settings.polaris01.y - 0.5);
    float theta = time / settings.rotationPeriod * TAU;
    float2 relative = planeCuv - polaris;
    float cosTheta = cos(theta);
    float sinTheta = sin(theta);
    // rot2(theta) * relative, with GLSL's column-major mat2.
    float2 starUv = float2(cosTheta * relative.x + sinTheta * relative.y,
                           -sinTheta * relative.x + cosTheta * relative.y);

    CloudSample cloudField = cloudRaw(planeCuv, time, settings);
    float cloud = cloudMask(cloudField, settings);

    if (starVisibility > 0.0) {
        float stars = starLayer(starUv, settings.starDensity, settings.starSize, 1.0, time, settings)
                    + starLayer(starUv + 31.7, settings.starDensity * 0.35, settings.starSize * 1.5, 1.4, time,
                                settings);
        stars *= settings.starBrightness * starVisibility;
        sky += float3(0.85, 0.92, 1.0) * stars;
    }
    sky = saturate(sky * windowVignette + dither);

    // Pass B: catalog stars, added on top. The website samples the clouds at
    // each star's center; a sprite is a few points wide, so the pixel's own
    // cloud value stands in for it.
    if (starVisibility > 0.0) {
        float occlusion = 1.0 - clamp(cloud * settings.starOcclusion, 0.0, 1.0);
        sky = saturate(sky + catalogStars(pixel, size, skyOffset, polaris, theta, aspect, time,
                                          occlusion, starVisibility, displayScale, settings));
    }

    // Pass C: clouds with moon or sun rim light, alpha-blended over the rest.
    float moonRadians = radiansFromDegrees(settings.moonAngle);
    float sunRadians = radiansFromDegrees(settings.sunAngle);
    float2 lightDirection = normalize(mix(float2(cos(moonRadians), sin(moonRadians)),
                                          float2(cos(sunRadians), sin(sunRadians)), dayness));
    float density = cloudField.density;
    float towardLight = fbm(float3(cloudField.warpedPoint.xy + lightDirection * 0.18, cloudField.warpedPoint.z),
                            min(settings.cloudDetail, 4.0));
    float rim = clamp((density - towardLight) * 4.5, 0.0, 1.0) * cloud;
    float coreShade = smoothstepGLSL(0.4, 1.0, density) * cloud;

    float3 nightCloud = settings.cloudColor + settings.moonIntensity * rim * float3(0.50, 0.56, 0.62);
    nightCloud *= 1.0 - 0.42 * coreShade;
    nightCloud *= settings.cloudNightBrightness;

    float3 dayCloud = settings.cloudColorDay + settings.sunIntensity * rim * float3(1.00, 0.97, 0.88);
    dayCloud = mix(dayCloud, dayCloud * float3(0.72, 0.78, 0.86), coreShade * 0.55);
    dayCloud *= settings.cloudDayBrightness;

    float3 cloudColor = saturate(mix(nightCloud, dayCloud, dayness) * windowVignette + dither);
    float cloudAlpha = saturate(cloud * settings.cloudOpacity);
    float3 result = cloudColor * cloudAlpha + sky * (1.0 - cloudAlpha);

    return half4(half3(result), 1.0h);
}
