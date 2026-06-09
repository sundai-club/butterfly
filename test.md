# LinkedIn Butterfly Live UX Test Plan

## Scope

Verify Butterfly comment UI on live LinkedIn surfaces without posting:

- LinkedIn feed
- Direct post page
- Person profile/activity feed
- Company page/feed

Each surface must cover:

- Top-level post comments
- Replies to existing comments

## Safety Rules

- Do not click LinkedIn `Comment`, `Reply`, `Post`, `Send`, or equivalent submit buttons.
- Use deterministic test suggestions for content-script flow tests so no Gemini quota is consumed.
- Clear any generated test text from editable fields after each test when feasible.
- Use a cloned Chrome profile for remote debugging; do not inspect cookies, local storage, passwords, or API keys.

## Browser Test Workflow

Chrome 136+ ignores `--remote-debugging-port` when it is launched against the default user data directory. Test with a non-default user data directory. To preserve the real LinkedIn login without debugging the default profile directly, copy the profile to a temporary directory and launch Chrome against that clone.

### 1. Prepare a cloned Chrome profile

Close any old debug clone first:

```bash
pkill -9 -f '/tmp/butterfly-chrome-live-rd' || true
rm -f /tmp/butterfly-chrome-live-rd/SingletonLock \
  /tmp/butterfly-chrome-live-rd/SingletonSocket \
  /tmp/butterfly-chrome-live-rd/SingletonCookie
```

If `/tmp/butterfly-chrome-live-rd` does not exist yet, create it from the real Chrome profile while Chrome is closed or idle:

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

### 2. Launch Chrome for isolated live LinkedIn testing

Use `open -na` on macOS so this is a separate Chrome instance, not a handoff to the already-running app. Launch with extensions disabled when testing by direct script injection; this prevents the installed Butterfly extension from racing the current checkout.

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

### 3. Attach a browser automation client

Use CDP, Playwright, or another browser client to attach to the LinkedIn page target from `http://127.0.0.1:9225/json/list`. The test runner must:

- Navigate to each test URL.
- Open a top-level comment composer or a reply composer.
- Inject the current `content_linkedin.js`.
- Provide a deterministic local `chrome.runtime` shim:

```js
const butterflyChromeShim = {
  runtime: {
    id: 'butterfly-test-runtime',
    getURL: path => path,
    sendMessage: (message, callback) => {
      setTimeout(() => callback({
        suggestions: [
          'Butterfly test suggestion for this LinkedIn composer.',
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
        enabledPlatforms: { linkedin: true },
        geminiApiKey: 'test-key',
        geminiModel: 'flash',
        commentLength: 1
      })
    }
  }
};
```

Evaluate the content script with the shim as a local variable so page or extension globals do not interfere:

```js
const source = await fs.promises.readFile('content_linkedin.js', 'utf8');
Function('chrome', source)(butterflyChromeShim);
```

### 4. Validate each composer

For each test case, assert these DOM facts after clicking only Butterfly's `Suggest Comment` button:

- At least one `.butterfly-ui-container` is present.
- The active editor contains `Butterfly test suggestion for this LinkedIn composer.`
- The Butterfly UI is not contained by the editor element.
- The Butterfly UI is not contained by `.comments-comment-texteditor`, `[data-testid="ui-core-tiptap-text-editor-wrapper"]`, or `.comments-comment-box-comment__text-editor`.
- The Butterfly UI is not contained by LinkedIn's native emoji/photo toolbar row.
- The editor does not contain `[Error`, `Gemini quota`, or `rate limit`.

For the quota/error path, change the shim response to:

```js
callback({
  error: 'Gemini quota or rate limit reached. Try again in 47s before generating another comment.'
});
```

Then assert:

- `.butterfly-inline-status` contains the quota message.
- The LinkedIn editor remains blank.
- No Gemini error text is written into the LinkedIn editor.

### 5. Cleanup

Clear generated text from all visible editors:

```js
for (const editor of document.querySelectorAll(
  '.ql-editor[contenteditable="true"], [data-test-ql-editor-contenteditable="true"], [contenteditable="true"][role="textbox"]'
)) {
  editor.innerHTML = editor.classList.contains('ProseMirror') ? '<p></p>' : '<p><br></p>';
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
}
```

Shut down only the temporary debug Chrome:

```bash
pkill -9 -f '/tmp/butterfly-chrome-live-rd' || true
rm -f /tmp/butterfly-chrome-live-rd/SingletonLock \
  /tmp/butterfly-chrome-live-rd/SingletonSocket \
  /tmp/butterfly-chrome-live-rd/SingletonCookie
```

## Test Matrix

| ID | Surface | URL Strategy | Top-level Comment | Reply to Comment | Expected Result |
| --- | --- | --- | --- | --- | --- |
| LI-01 | Feed | `https://www.linkedin.com/feed/` | Open visible post comment composer | Open visible reply composer under an existing comment | Butterfly controls appear below editor, suggestion fills editor only, no submit |
| LI-02 | Direct post page | Known post permalink | Use visible comment composer | Open visible reply composer under an existing comment | Butterfly controls appear below editor, suggestion fills editor only, no submit |
| LI-03 | Person feed | Current profile activity or visible person profile activity | Open visible post comment composer | Open visible reply composer under an existing comment | Butterfly controls appear below editor, suggestion fills editor only, no submit |
| LI-04 | Company feed | Current accessible company page posts/feed | Open visible post comment composer | Open visible reply composer under an existing comment | Butterfly controls appear below editor, suggestion fills editor only, no submit |

## Per-Test Checks

For each top-level and reply composer:

1. Open a composer on the target surface.
2. Inject current `content_linkedin.js` into the live page with a test `chrome.runtime` shim.
3. Confirm exactly one Butterfly UI container is associated with the composer.
4. Confirm the Butterfly UI is not inside LinkedIn's editor element.
5. Confirm the Butterfly UI is not inside LinkedIn's native emoji/photo toolbar row.
6. Click `Suggest Comment`.
7. Confirm the generated suggestion appears in the intended composer.
8. Confirm no submit button was clicked and no comment/reply was posted.
9. Clear generated test text when feasible.

## Error Path Check

Run once on a direct post page:

1. Inject current `content_linkedin.js` with a quota-style error response.
2. Confirm the error is shown in Butterfly's inline status block.
3. Confirm the LinkedIn editor remains blank and does not contain `[Error: ...]` or Gemini error text.

## Pass Criteria

All matrix rows pass both top-level and reply checks, and the error path check passes. Any failure must be fixed in code and the failed test rerun until passing.

## Execution Results - 2026-06-09

Chrome setup:

- Used a cloned Chrome profile at `/tmp/butterfly-chrome-live-rd` with LinkedIn logged in.
- Launched with `--disable-extensions` to prevent the installed Butterfly extension from interfering with the current checkout test.
- Injected the current `content_linkedin.js` with a deterministic `chrome.runtime` shim.
- No LinkedIn submit buttons were clicked.

| ID | Surface | Tested URL | Scenario | Result |
| --- | --- | --- | --- | --- |
| LI-01 | Feed | `https://www.linkedin.com/feed/` | Top-level comment | Pass |
| LI-01 | Feed | `https://www.linkedin.com/feed/` | Reply to comment | Pass |
| LI-02 | Direct post page | `https://www.linkedin.com/feed/update/urn:li:activity:7470141292304334848/` | Top-level comment | Pass |
| LI-02 | Direct post page | `https://www.linkedin.com/feed/update/urn:li:activity:7470141292304334848/` | Reply to comment | Pass |
| LI-03 | Person feed | `https://www.linkedin.com/in/vyahhi/recent-activity/all/` | Top-level comment | Pass |
| LI-03 | Person feed | `https://www.linkedin.com/in/vyahhi/recent-activity/all/` | Reply to comment | Pass |
| LI-04 | Company feed | `https://www.linkedin.com/company/mit-csail/posts/` | Top-level comment | Pass |
| LI-04 | Company feed | `https://www.linkedin.com/company/mit-csail/posts/` | Reply to comment | Pass |
| ERR-01 | Direct post page | `https://www.linkedin.com/feed/update/urn:li:activity:7470141292304334848/` | Quota/error path | Pass |

Notes:

- An initial company-feed reply attempt on `https://www.linkedin.com/company/n-able/posts/` did not expose reply controls in the visible post, so it was not counted as a passing reply test.
- The company-feed reply case was rerun on `https://www.linkedin.com/company/mit-csail/posts/`, where LinkedIn exposed real reply controls, and passed.
