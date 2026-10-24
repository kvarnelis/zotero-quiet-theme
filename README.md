# Quiet Theme for Zotero

Quiet Theme gives Zotero a compact interface with muted colors and restrained selection states. Its menu combines Zotero's native appearance setting with an optional interface overlay.

## Install

Current version: **0.3.2**. Supported target: **Zotero 9.x and 10.0.x on macOS**. No companion add-on is required.

1. Download [`zotero-quiet-theme.xpi`](https://github.com/kvarnelis/zotero-quiet-theme/releases/latest/download/zotero-quiet-theme.xpi) from [Releases](https://github.com/kvarnelis/zotero-quiet-theme/releases).
2. In Zotero, open the Add-ons Manager and choose **Install Add-on From File…**.
3. Select the XPI and restart Zotero.

After this version is installed, Zotero can check this repository's `updates.json` for future releases. Downloading and installing a newer XPI manually also works.

## Use

Open **View → Quiet Theme**. Choose **Automatic**, **Light**, or **Dark** for Zotero's native appearance. **Quiet Overlay** controls the compact interface stylesheet independently.

The overlay is copied into the Zotero profile as managed `userChrome.css`. Restart Zotero after enabling or disabling it to reload the interface reliably. Turning it off removes the managed overlay; unrelated profile customizations are preserved where the source's safety checks can identify them.

The menu also includes **Restart Zotero**. This add-on needs no companion plugin, external service, or command-line AI tool.

## Limits

The overlay targets Zotero's internal interface selectors and can need adjustment after a Zotero update. Current testing targets macOS. The predecessor build received startup checks on Zotero 10.0.6; a complete appearance and profile-restoration review has not been repeated for this standalone packaging change. There is no separate behavioral test suite; the repository's test script checks JavaScript syntax.

## Build and check

Building requires a Unix shell, `zip`, and Python 3. Syntax checks and any included unit tests require Node.js. End users installing an XPI do not need these developer tools.

```sh
./scripts/build.sh
./scripts/test.sh
```

The package is written to `dist/zotero-quiet-theme.xpi`. The build also regenerates `updates.json` with the package's SHA-256 hash and versioned release URL. To publish an update, change the version in `manifest.json`, build and check, commit the new update manifest, and attach that exact XPI to release `v<version>`.

Keep examples synthetic. Do not commit library exports, conversations, personal configuration, or screenshots containing private material.

## License

No repository-wide license has been specified. Author attribution is retained in the add-on manifest.
