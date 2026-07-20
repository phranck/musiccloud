// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "MusicCloudSwiftGeneratorCandidate",
    platforms: [
        .macOS(.v13),
        .iOS(.v16),
    ],
    products: [
        .library(name: "MusicCloudGenerated", targets: ["MusicCloudGenerated"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-openapi-runtime",
            exact: "1.12.0"
        ),
        .package(
            url: "https://github.com/apple/swift-http-types",
            exact: "1.6.0"
        ),
    ],
    targets: [
        .target(
            name: "MusicCloudGenerated",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ],
            path: "generated"
        ),
    ]
)
