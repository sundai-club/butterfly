# Product Hunt Butterfly Live UX Test Plan

## Scope

Verify Butterfly on live Product Hunt pages without posting:

- Product detail page comment composer
- Product detail page reply composer when available

## Target Script

- `content_producthunt.js`

## Test Matrix

| ID | Surface | URL Strategy | Scenario | Expected Result |
| --- | --- | --- | --- | --- |
| PH-01 | Product page | A live Product Hunt product detail page with a comment form | Top-level comment | Butterfly controls appear below the editor, suggestion fills editor only, no submit |
| PH-02 | Product page | Same or another live product page with visible comments | Reply to comment | Butterfly controls appear below the reply editor, suggestion fills editor only, no submit |
| PH-ERR-01 | Product page | Any page with a comment form | Quota/error path | Error appears in `.butterfly-inline-status`; editor remains free of Gemini error text |

## Per-Test Checks

1. Navigate to a Product Hunt product detail page.
2. Open the top-level comment or reply composer.
3. Inject `content_producthunt.js` with the deterministic runtime shim from `test/setup.md`.
4. Confirm `.butterfly-ui-container` appears for the active editor.
5. Click only Butterfly's `Suggest Comment`.
6. Confirm the active `.tiptap.ProseMirror[contenteditable="true"]` editor contains `Butterfly test suggestion for this composer.`
7. Confirm Product Hunt submit controls were not clicked.
8. Clear the editor.

## Error Path Check

Use the quota/error shim response from `test/setup.md`.

Pass criteria:

- `.butterfly-inline-status` contains the quota message.
- The Product Hunt editor does not contain `[Error`, `Gemini quota`, or `rate limit`.

## Execution Results - 2026-06-09

Chrome setup:

- Used the shared cloned-profile setup from `test/setup.md`.
- Launched with `--disable-extensions`.
- Injected `content_producthunt.js` with deterministic success and quota shims.
- No Product Hunt submit buttons were clicked.

Live page tested:

- `https://www.producthunt.com/products/vcboom`

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| PH-01 | Top-level comment | Blocked by auth | The live page rendered `Login to comment` and did not expose `.tiptap.ProseMirror[contenteditable="true"]`. |
| PH-02 | Reply to comment | Blocked by auth | No authenticated comment or reply editor was available in the cloned profile. |
| PH-ERR-01 | Quota/error path | Blocked by auth for live composer | No live editor was available. |
| PH-FIXTURE-01 | Product Hunt selector fixture, success path | Pass | Injected a temporary `form[data-test="comment-form"]` with `.tiptap.ProseMirror[contenteditable="true"]` into the live Product Hunt page; Butterfly filled only that editor. |
| PH-FIXTURE-ERR-01 | Product Hunt selector fixture, quota/error path | Pass | Error rendered in `.butterfly-inline-status`; fixture editor stayed free of Gemini error text. |

Follow-up:

- Rerun PH-01, PH-02, and PH-ERR-01 with a Chrome profile authenticated to Product Hunt.
