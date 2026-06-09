# Browser Test Setup

## Scope

Use this setup for live browser UX testing across Butterfly's supported services:

- LinkedIn
- Product Hunt
- X/Twitter
- Old Reddit

The goal is to exercise each platform content script against real DOMs without posting and without spending Gemini quota.

## Safety Rules

- Do not click platform submit controls such as `Comment`, `Reply`, `Post`, `Tweet`, `Send`, or `Save`.
- Use deterministic test suggestions through a local `chrome.runtime` shim.
- Clear generated test text from editable fields after each test when feasible.
- Use a cloned Chrome profile for remote debugging.
- Do not inspect cookies, local storage, passwords, API keys, or other sensitive browser state.

## Chrome Remote Debugging

Chrome 136+ ignores `--remote-debugging-port` when launched against the default user data directory. Use a non-default user data directory. To preserve logged-in sessions without debugging the default profile directly, copy the real profile to a temporary profile and launch Chrome against that clone.

### Prepare the Clone

Close any old debug clone:

```bash
pkill -9 -f '/tmp/butterfly-chrome-live-rd' || true
rm -f /tmp/butterfly-chrome-live-rd/SingletonLock \
  /tmp/butterfly-chrome-live-rd/SingletonSocket \
  /tmp/butterfly-chrome-live-rd/SingletonCookie
```

Create or refresh the clone while the real Chrome profile is closed or idle:

```bash
rm -rf /tmp/butterfly-chrome-live-rd
rsync -a \
  --exclude='Singleton*' \
  --exclude='Crashpad' \
  --exclude='ShaderCache' \
  --exclude='GrShaderCache' \
  --exclude='GraphiteDawnCache' \
  "$HOME/Library/Application Support/Google/Chrome/" \
  /tmp/butterfly-chrome-live-rd/
```

### Launch the Clone

Use `open -na` on macOS so this is a separate Chrome instance. Launch with extensions disabled when testing by direct script injection; this prevents installed extensions from racing the current checkout.

```bash
open -na 'Google Chrome' --args \
  --user-data-dir=/tmp/butterfly-chrome-live-rd \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9225 \
  --disable-extensions \
  --profile-directory=Default \
  --new-window 'https://www.linkedin.com/feed/'
```

Confirm the debugging endpoint is available:

```bash
curl -fsS http://127.0.0.1:9225/json/list
```

## Deterministic Runtime Shim

Attach to the target page via CDP, Playwright, or another browser client. Inject the target platform content script with a local `chrome` variable:

```js
const butterflyChromeShim = {
  runtime: {
    id: 'butterfly-test-runtime',
    getURL: path => path,
    sendMessage: (message, callback) => {
      setTimeout(() => callback({
        suggestions: [
          'Butterfly test suggestion for this composer.',
          'Second test suggestion.',
          'Third test suggestion.',
          'Fourth test suggestion.'
        ],
        debugPrompt: 'test prompt'
      }), 120);
    }
  },
  storage: {
    sync: {
      get: (keys, callback) => callback({
        enabledPlatforms: {
          linkedin: true,
          producthunt: true,
          twitter: true,
          reddit: true
        },
        geminiApiKey: 'test-key',
        geminiModel: 'flash',
        commentLength: 1
      })
    }
  }
};

const source = await fs.promises.readFile('<platform-content-script>.js', 'utf8');
Function('chrome', source)(butterflyChromeShim);
```

For the quota/error path, change the shim response to:

```js
callback({
  error: 'Gemini quota or rate limit reached. Try again in 47s before generating another comment.'
});
```

## Common Assertions

For every composer test:

- A `.butterfly-ui-container` appears near the active composer.
- Clicking only Butterfly's `Suggest Comment` button fills the intended editor with the deterministic suggestion.
- The platform submit button is not clicked.
- The editor does not contain `[Error`, `Gemini quota`, or `rate limit` after a successful suggestion.
- Error responses render in `.butterfly-inline-status` and do not write error text into the editor.

## Cleanup

Clear generated text from visible editors using platform-specific selectors, then close only the temporary Chrome clone:

```bash
pkill -9 -f '/tmp/butterfly-chrome-live-rd' || true
rm -f /tmp/butterfly-chrome-live-rd/SingletonLock \
  /tmp/butterfly-chrome-live-rd/SingletonSocket \
  /tmp/butterfly-chrome-live-rd/SingletonCookie
```
