# Old Reddit Butterfly Live UX Test Plan

## Scope

Verify Butterfly on `old.reddit.com` without posting:

- Top-level comment textarea on a post page
- Reply textarea under an existing comment

## Target Script

- `content_reddit_old.js`

## Test Matrix

| ID | Surface | URL Strategy | Scenario | Expected Result |
| --- | --- | --- | --- | --- |
| RD-01 | Old Reddit post page | A live `old.reddit.com/r/.../comments/...` page | Top-level comment | Butterfly controls appear near the textarea buttons, suggestion fills textarea only, no submit |
| RD-02 | Old Reddit post page | Same page with visible comments | Reply to comment | Butterfly controls appear near the reply textarea buttons, suggestion fills textarea only, no submit |
| RD-ERR-01 | Old Reddit post page | Any available comment textarea | Quota/error path | Error appears in `.butterfly-inline-status`; textarea remains free of Gemini error text |

## Per-Test Checks

1. Navigate to a live old Reddit comments page.
2. Use the existing top-level `form.usertext textarea[name="text"]`, or click a comment's `reply` link to open a reply textarea.
3. Inject `content_reddit_old.js` with the deterministic runtime shim from `test/setup.md`.
4. Confirm `.butterfly-ui-container` appears for the active textarea.
5. Click only Butterfly's `Suggest Comment`.
6. Confirm the active textarea contains `Butterfly test suggestion for this composer.`
7. Confirm Reddit `save` submit controls were not clicked.
8. Clear the textarea.

## Error Path Check

Use the quota/error shim response from `test/setup.md`.

Pass criteria:

- `.butterfly-inline-status` contains the quota message.
- The Reddit textarea does not contain `[Error`, `Gemini quota`, or `rate limit`.

## Execution Results - 2026-06-09

Chrome setup:

- Used the shared cloned-profile setup from `test/setup.md`.
- Launched with `--disable-extensions`.
- Injected `content_reddit_old.js` with deterministic success and quota shims.
- No Reddit `save` buttons were clicked.

Live page tested:

- `https://old.reddit.com/r/AskReddit/comments/1u1h1qg/why_girls_love_rich_guys_and_hate_poor_guys_is_it/`

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| RD-01 | Top-level comment textarea | Pass | Butterfly appeared near the top-level `textarea[name="text"]` and filled `Butterfly test suggestion for this composer.` |
| RD-02 | Reply textarea | Pass | Opened a visible `reply` link; Butterfly appeared for the new reply textarea and filled it only. |
| RD-ERR-01 | Quota/error path | Pass | `.butterfly-inline-status` contained the quota message; textarea remained empty. |
