// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "MusiccloudErrors",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "MusiccloudErrors", targets: ["MusiccloudErrors"]),
    ],
    targets: [
        .target(name: "MusiccloudErrors"),
        .testTarget(name: "MusiccloudErrorsTests", dependencies: ["MusiccloudErrors"]),
    ]
)
