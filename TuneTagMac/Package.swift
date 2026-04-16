// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TuneTagMac",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "TuneTagApp", targets: ["TuneTagApp"])
    ],
    targets: [
        .executableTarget(
            name: "TuneTagApp",
            path: "Sources/TuneTagApp"
        )
    ]
)
