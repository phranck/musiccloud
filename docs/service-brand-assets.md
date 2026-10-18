# Shared service-brand artwork

`assets/service-brands/manifest.json` and its adjacent SVG, PNG and JPEG files are the maintained source of service artwork. Share pages, the dashboard and Apple Settings consume generated representations of that source.

## Change a mark

1. Update the curated source file and its provenance in the manifest. Preserve the actual brand name and record any transformation. Do not replace a mark with a generic interface symbol.
2. Regenerate the platform outputs:

   ```sh
   node scripts/service-brand-assets.mjs --write
   ```

3. Check reproducibility and the generation regressions:

   ```sh
   node scripts/service-brand-assets.mjs --check
   node --test scripts/service-brand-assets.test.mjs scripts/apple-brand-assets.test.mjs
   ```

4. Run the affected web icon tests and native artwork/build checks. Commit the curated inputs and their generated outputs together.

The generator needs the repository's installed TypeScript development dependency to read the existing shared service namespace. It does not need React or download artwork. Apple builds consume committed asset-catalog outputs and do not need Node, React or network icon requests.

## Maintained inputs

Each manifest entry uses an existing shared service identifier, declares whether Apple consumes it, names its variants and retains its provenance. Display labels and runtime palette metadata remain in `packages/shared/src/platform.ts`; the manifest does not duplicate that map.

- `default` is the original-color artwork.
- `dark` is an optional appearance-specific original.
- `glyph` is an optional transparent silhouette suitable for text-color rendering. It may reuse the default file. Never use an opaque app tile as a silhouette.
- `webVariant` optionally selects the appropriate original for the web's existing presentation. Tidal retains its white mark there.

All 23 shared service identifiers are covered. The 21 existing Apple image sets remain bundled under their existing names; Jamendo and MusicBrainz remain web-only. Valid existing website glyphs are curated as static source files rather than imported from a second runtime icon library.

## Generated outputs

Do not hand-edit these files:

- `apps/frontend/public/icons/service-brands/`
- `apps/dashboard/public/icons/service-brands/`
- `packages/dashboard-ui/src/platform-icon/platformIconFiles.ts`
- `apps/Apple/App/Supporting Files/Assets.xcassets/ServiceBrandIcons/`
- `apps/Apple/BRAND_ASSETS.json`

Platform copies are packaging outputs, not independently maintained selections. The generator preserves curated bytes, emits the Apple namespace and appearance metadata, derives bundled checksums, and removes obsolete files only within its owned asset subtrees. Unrelated public icons are left alone. Check mode reports drift without writing; the existing workflow-contract test command runs this reproducibility check in CI.

`PlatformIcon` uses original artwork for colored marks and a CSS mask for an available text-color glyph. A service without a transparent glyph retains its original image. Unknown future service identifiers still draw nothing. Native Settings keeps its original-color rendering and scalable frame without Swift or preference changes.

## Scope and ownership

Brand assets remain their owners' property. The manifest preserves source and rights notices; inclusion does not assert independent trademark or redistribution clearance. The previously bundled Jamendo asset did not record its upstream attribution, so its provenance identifies the existing repository source instead of inventing an upstream license.

The legacy native menu-template catalog is not migrated by this consolidation. Its geometry, tint behavior and placeholder replacement remain tracked in [#747](https://github.com/phranck/musiccloud/issues/747).
