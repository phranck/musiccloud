# Swift formatting

One deterministic pipeline enforces the Apple app's layout:

1. Apple's `swift-format` canonicalizes 140-column parameter and argument lists.
2. A SwiftSyntax visitor identifies real guard statements and their trivia boundaries. It places each guard condition on its own line and expands exit blocks without rewriting expressions or literals.
3. The pinned SwiftFormat CLI normalizes indentation. Its other rules are disabled, so it cannot undo the argument layout.

Neither stock formatter implements both requirements alone. SwiftFormat preserves existing short argument wrapping, and its condition option does not split every condition. The syntax pass closes that gap rather than weakening the regression tests or using regexes on Swift code.

`.xcode-version` and `.xcode-build-version` pin Apple's formatter, compiler, and host SwiftSyntax libraries. `.swiftformat-version` pins SwiftFormat; `.swiftformat-sha256` verifies its release archive. Both local checks and CI use these pins.

## Layout

`.swift-format` defines four-space indentation and a 140-character line length. Parameter and argument lists stay on one line when they fit. Wrapped lists break after `(`, place each parameter or argument on its own line, and put `)` on its own closing line.

Guards with multiple conditions put `guard` on its own line and each condition on a separate line. `else` begins the following line, and its body occupies an expanded block. Single-condition guards keep the condition next to `guard`, but expand the exit block too. Comments and nested expression commas are preserved through syntax-aware boundaries.

Conditional compilation blocks remain unindented relative to their containing scope. Private extensions remain permitted.

## Commands

```sh
bash scripts/install-swift-format.sh
node scripts/swift-format.mjs
node --test scripts/swift-format/fixtures.test.mjs
node scripts/swift-format.mjs --write
```

Installation puts only the verified CLI in this repository's ignored `.tmp` tool cache. It does not install an app or service.

The check compares source against the complete pipeline output. The regression suite covers the requested deep-link guard, short lists, the 140/141-character boundary, initializer declarations, calls, and idempotence.

The write command uses `XcodeRead` and `XcodeWrite` through `xcrun mcpbridge`. It never runs an in-place formatter over application files. Every file is read completely; output must remain unchanged on a second pass and pass the Swift compiler's parser before Xcode receives it. It does not run the app or its previews.

The check reads target membership with Apple's plist reader. Historical files outside target membership and generated SDKs are not part of the application's baseline. The write command discovers project files through Xcode's navigator.

The Git pre-commit hook and the `Swift formatting` workflow run the same checks and fixtures. CI selects the pinned Xcode distribution and verifies the pinned SwiftFormat archive before running them.

## Conditional modifier chains

Keep platform conditionals around complete declarations or expressions. Bind a platform-specific modified view to a local value and apply common modifiers afterwards. Do not place `#if` directly between a value and a chained modifier; Apple's canonicalizer can join those tokens incorrectly.
