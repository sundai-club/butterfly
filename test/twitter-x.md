# X/Twitter Butterfly Live UX Test Plan

## Scope

Verify Butterfly on live X/Twitter pages without posting:

- Tweet/status page reply composer
- Reply modal from timeline or status page when available

## Target Script

- `content_twitter.js`

## Test Matrix

| ID | Surface | URL Strategy | Scenario | Expected Result |
| --- | --- | --- | --- | --- |
| TW-01 | Tweet/status page | A live `x.com/.../status/...` or `twitter.com/.../status/...` page | Inline reply composer | Butterfly controls appear below the reply editor, suggestion fills editor only, no submit |
| TW-02 | Timeline or status page | Open a reply modal with the reply action | Reply modal composer | Butterfly controls appear below the modal editor, suggestion fills editor only, no submit |
| TW-ERR-01 | Reply composer | Any available reply composer | Quota/error path | Error appears in `.butterfly-inline-status`; editor remains free of Gemini error text |

## Per-Test Checks

1. Navigate to a live tweet/status page or timeline.
2. Open an inline reply editor or reply modal.
3. Inject `content_twitter.js` with the deterministic runtime shim from `test/setup.md`.
4. Confirm `.butterfly-ui-container` appears for the active reply editor.
5. Click only Butterfly's `Suggest Comment`.
6. Confirm the active `[data-testid="tweetTextarea_0"]` or `div[role="textbox"][contenteditable="true"]` contains `Butterfly test suggestion for this composer.`
7. Confirm X/Twitter `Reply`, `Post`, or `Tweet` submit controls were not clicked.
8. Clear the editor.

## Error Path Check

Use the quota/error shim response from `test/setup.md`.

Pass criteria:

- `.butterfly-inline-status` contains the quota message.
- The X/Twitter editor does not contain `[Error`, `Gemini quota`, or `rate limit`.

## Execution Results - 2026-06-09

Chrome setup:

- Used the shared cloned-profile setup from `test/setup.md`.
- Launched with `--disable-extensions`.
- Injected `content_twitter.js` with deterministic success and quota shims.
- No X/Twitter submit buttons were clicked.

Live pages tested:

- `https://x.com/home`
- `https://x.com/ai_rohitt/status/2064222321116918102`

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| TW-01 | Tweet/status page inline reply composer | Pass | Butterfly appeared for the status-page reply editor and filled `Butterfly test suggestion for this composer.` |
| TW-02 | Reply modal composer | Pass | Opened a visible timeline reply action; modal URL became `https://x.com/compose/post`; Butterfly filled the modal editor only. |
| TW-ERR-01 | Quota/error path | Pass | `.butterfly-inline-status` contained the quota message; editor remained blank except for X's internal newline. |
