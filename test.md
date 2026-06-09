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
