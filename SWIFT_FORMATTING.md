# Swift formatting

The Apple app uses the `swift-format` bundled with the Xcode version in `.xcode-version`. `.xcode-build-version` pins the exact compiler distribution because Apple's formatter reports its version as `main`.

## Layout

`.swift-format` defines four-space indentation and a 140-character line length. Parameter and argument lists stay on one line when they fit. Wrapped lists break after `(`, place each parameter or argument on its own line, and put `)` on its own closing line. Conditional compilation blocks remain unindented. Private extensions remain permitted.

## Commands

```sh
node scripts/swift-format.mjs
node --test scripts/swift-format/fixtures.test.mjs
node scripts/swift-format.mjs --write
```

The first command is a non-mutating check. The regression suite covers short lists, the 140/141-character boundary, initializer declarations, calls, and idempotence.

The write command uses `XcodeRead` and `XcodeWrite` through `xcrun mcpbridge`. It never runs an in-place formatter over Swift files. Every file is read completely, and formatter output must parse and remain unchanged on a second pass before Xcode receives it. It does not run the app or its previews.

The check reads source membership with Apple's plist reader and checks the Swift files in the Xcode targets. Historical files outside target membership and generated SDKs are not part of the application's formatting baseline. The write command discovers the same project through Xcode's navigator.

The Git pre-commit hook runs the check and regression fixtures when native Swift or formatter files change. The `Swift formatting` workflow selects the same pinned Xcode distribution, runs the same checks, and rejects formatting drift on pull requests and pushes to `main`.

## Conditional modifier chains

Keep platform conditionals around complete declarations or expressions. For example, bind a platform-specific modified view to a local value and apply common modifiers afterwards. Do not place `#if` directly between a value and a chained modifier. The pinned formatter can join those tokens incorrectly when canonicalizing line breaks.
