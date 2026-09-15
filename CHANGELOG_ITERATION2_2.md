# Iteration 2.2 — Single-Seed Diagnostic, Shareable Recommendation Links

## Overview

Iteration 2.2 makes two frontend-focused improvements: clarifying the Evaluation page as a Data Science-only diagnostic tool, and adding shareable recommendation links that reproduce results without accounts or a database.

The recommender algorithm, search algorithm, evaluation calculations, presets, and existing Data Science/Listener mode implementation are unchanged.

## Changes

### A. Single-Seed Evaluation Page

- **Renamed** page heading from "Evaluation" to "Single-seed diagnostic"
- **Updated** subtitle to: "Inspect proxy metrics for one seed. Use batch evaluation results in the notebook for formal model comparison."
- **Renamed** button from "Run evaluation" to "Inspect this seed"
- **Added** note under results: "Precision@K uses genre matching and is only a proxy for relevance. One seed does not represent overall model performance."
- **Hidden** the Diagnostics nav item and page entry point entirely in Listener mode
- **Retained** the backend `/evaluate` endpoint and page for Data Science mode and technical demonstration
- Formal evaluation remains in the notebook via reproducible multi-seed batch experiments

### B. Shareable Recommendation Links

Share links allow a user to share a recommendation result. The recipient opens the link and Bubble recreates the recommendation using the same seed and settings.

- **No database, authentication, accounts, analytics, or backend persistence required**
- Uses frontend URL query parameters and the existing recommendation API
- Reproducible configuration link, not a permanently stored snapshot

#### Share controls

- **Listener mode**: "Share this discovery" button
- **Data Science mode**: "Share reproducible result" button
- Uses native Web Share API (`navigator.share`) when available
- Falls back to `navigator.clipboard.writeText` when Web Share is unavailable
- Accessible status messages: "Link copied" (success), "Could not copy link. Please copy the address from your browser." (failure)
- Handles unsupported browsers and rejected share dialogs gracefully

#### URL parameters

The share URL includes: `seed`, `preset`, `method`, `profile`, `alpha`, `destination_mode`, `destination_weight`, `mmr`, `mmr_lambda`, `candidate_pool_size`, `k`, `view`, `v` (app version).

**Not included in URLs**: recommendation titles, artist names, comments, ratings, localStorage session data, names, emails, or any personal data.

#### Link loading

- Validates all fields before making an API request (seed, method/profile/destination enums, numeric ranges, integer k/pool, view mode)
- Makes exactly one recommendation API request on initial page load
- Restores seed, recommendations, settings, and metadata into RecommendationContext
- Sets initial UI mode from `view` parameter
- Recipient can switch modes normally after load
- Switching modes does not trigger a new API request or erase results
- After initial load, manual user actions take precedence (URL is not re-processed)

#### Error states

- Missing/invalid settings: "This share link is invalid or incomplete. Try creating a new recommendation."
- Seed no longer available: "This shared song is no longer available in the current catalogue."
- Version mismatch (non-blocking): "This link was created with an earlier version of Bubble, so results may differ slightly."

### C. Frontend Tests

Added 23 frontend tests (Vitest + Testing Library) covering:

1. Evaluation nav visible in Data Science mode
2. Evaluation nav hidden in Listener mode
3. Share link contains seed and all settings
4. Share link excludes titles/artists/personal data
5. Valid share link makes exactly one API request
6. Invalid share params show error without API request
7. Version mismatch note appears
8. Seed unavailable error appears
9. Normal result generation works without URL params
10. Web Share API used when available
11. Clipboard fallback when Web Share unavailable
12. Copy/share failure handled without crashing
13. Rejected share dialog handled gracefully

### D. Documentation

- README updated with single-seed diagnostic and shareable links sections
- This changelog

## Changed Files

- `src/components/Navbar.tsx` — mode-aware nav items
- `src/components/ShareButton.tsx` — new share button component
- `src/lib/share.ts` — new share URL builder and parser
- `src/pages/EvaluationPage.tsx` — renamed heading, subtitle, button, added note
- `src/pages/ResultsPage.tsx` — share link loading, share buttons, version mismatch note
- `src/App.tsx` — optional trackId route param for shared links
- `vite.config.ts` — Vitest configuration
- `tsconfig.node.json` — include src for test types
- `package.json` — test scripts and dev dependencies
- `src/test/setup.ts` — test setup file
- `src/test/share.test.ts` — share URL builder/parser tests
- `src/test/ShareButton.test.tsx` — share button tests
- `src/test/navbar.test.tsx` — nav visibility tests
- `src/test/results.test.tsx` — results page share link tests
- `README.md` — documentation updates

## Known Limitations

- Share links reproduce settings but do not guarantee permanently identical results after dataset/model changes.
- Precision@K is a genre-match proxy, not ground-truth relevance.
- The single-seed diagnostic is for technical inspection only; formal evaluation uses batch experiments in the notebook.
