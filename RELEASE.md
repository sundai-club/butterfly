# Release Steps

## 1. Verify the Build

Run syntax checks before packaging:

```bash
node --check background.js
node --check content_linkedin.js
node --check content_producthunt.js
node --check content_twitter.js
node --check content_reddit_old.js
```

Run or update the browser test plans under `test/` for the affected platforms.

## 2. Bump the Version

Update `manifest.json`:

```json
"version": "x.yz"
```

Chrome Web Store requires every uploaded package to have a version higher than the currently published version.

## 3. Create the ZIP

Use the release script:

```bash
./release.sh
```

The script reads `manifest.json` and creates:

```text
YYYYMMDD-HHMMSS-butterfly-<version>.zip
```

The ZIP includes only the extension files needed by Chrome.

## 4. Smoke Test the ZIP

In Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Drag the ZIP into the page, or unzip it and use `Load unpacked`.
4. Open the Butterfly popup and verify settings load.
5. Run a no-post smoke test on the changed platform.

## 5. Upload to Chrome Web Store

1. Open the Chrome Web Store Developer Dashboard.
2. Select Butterfly.
3. Upload the generated ZIP.
4. Fill release notes with the main user-visible changes.
5. Submit for review.

## 6. Tag the Release

After the upload is accepted or submitted:

```bash
git tag v<version>
git push origin v<version>
```

Keep the generated ZIP attached to the GitHub release or stored with the release notes if needed.
