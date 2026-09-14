# Iteration 2.1 — Relevance Tuning, Intelligent Seed Search, and Dual-Interface Modes

## Formative Feedback Context

This iteration responds to formative feedback from a very small exploratory study. The feedback identified three issues:

1. Some recommendations feel too distant from the selected seed.
2. Some recommendation lists feel too varied.
3. Users found the frontend hard to understand.

**This iteration does not claim statistical significance or that user satisfaction has been proven.** The feedback was formative and exploratory, not a controlled evaluation.

## Changes Made

### A. Similarity-First Relevance Tuning

- **Default behaviour unchanged**: `destination_mode="none"` remains the default. MMR is off by default. No automatic calm-positive forcing.
- **New `balanced` feature-weight profile**: A milder affect emphasis than `affect_emphasis`, keeping recommendations recognisably related to the seed while allowing some cross-genre discovery without excessive drift. All weights remain positive (no zeroed features).
- **Candidate pool safeguard**: Before applying hybrid scoring or MMR, a large candidate pool is retrieved based on content similarity only (no genre hard-filter). Default pool size is `max(100, top_k * 10)`. The pool size is included in response metadata. The seed track is always excluded.
- **MMR remains optional and conservative**: MMR is available but not enabled by default. Conservative lambda values (0.85, 0.90) are evaluated for the balanced preset.
- **Alpha evaluation**: Tested alpha values 0.70, 0.80, 0.85, 0.90 for the balanced hybrid.

### B. RapidFuzz-Backed Intelligent Seed Search

- Added `rapidfuzz>=3.0,<4.0` to backend dependencies.
- **Text normalisation helper**: Handles null values, lowercasing, Unicode NFKD normalisation, accent folding, punctuation/separator replacement, and whitespace collapse.
- **Precomputed search fields**: `trackname_search`, `artistname_search`, `combined_search` are computed during dataset loading. Display fields are unchanged.
- **Tiered deterministic ranking** (7 tiers, 0–6):
  - Tier 0: exact combined title + artist match (natural or reversed ordering)
  - Tier 1: exact artist match or exact track-title match
  - Tier 2: all query tokens occur across combined text
  - Tier 3: full query prefix matches
  - Tier 4: token-prefix matching
  - Tier 5: partial substring matching
  - Tier 6: RapidFuzz fuzzy fallback (WRatio scorer, cutoff=70)
- **Deterministic ordering within tiers**: textual match strength → fuzzy score → popularity descending (tie-breaker only) → artist alphabetical → title alphabetical → track ID alphabetical.
- **Fuzzy matching never outranks exact matches**: Tiers 0–5 are evaluated before fuzzy fallback.
- **Search API preserved**: `GET /tracks/search?q=...` with optional `match_type` and `search_score` fields added.
- **Frontend dropdown**: Displays `Track title — Artist`, with loading feedback and empty state message.

### C. Dual Interface Modes

- **Data Science mode** (default): The existing advanced interface with all controls — method choice, alpha, feature-weight profiles (now including `balanced`), destination mode, MMR controls, evaluation metrics, emotion map, and technical metadata.
- **Listener mode**: A simple, friendly interface for users with no data-science background:
  - Search for a song, artist, or both
  - Select one seed song
  - Choose one preference:
    - "Stay close to this song" → cosine, equal weights, no MMR, no destination
    - "A little more variety" → balanced hybrid, alpha=0.85, MMR on (lambda=0.90), no destination
    - "Calm and warm suggestions" → balanced hybrid, alpha=0.85, destination calm_positive, no MMR
  - Click "Find songs for me"
  - Results show title, artist, rank, and a friendly label derived from the chosen preference
  - No technical metrics, alpha values, or mathematical terminology displayed

- **Mode toggle**: Accessible radiogroup in the navbar, keyboard operable, with visible selected state and ARIA attributes. Selected mode persists in `localStorage` across navigation and refresh.
- **Results preserved across mode switches**: Switching modes does not clear the seed track, recommendation list, or metadata. No new backend request is triggered solely by switching modes. The same recommendations render with different levels of detail.
- **Session persistence**: The latest completed recommendation session (seed, results, configuration) is persisted in `localStorage` and restored on refresh. Malformed/stale data is cleared gracefully.

### D. Backend Tests

- All 37 existing iteration-2 tests continue to pass.
- 45 new iteration-2.1 tests covering: text normalisation, search tiers, fuzzy fallback, accent folding, typo tolerance, deterministic ordering, result limits, no duplicates, balanced profile validation, candidate pool safeguard, iteration-2.1 batch evaluation configs, and API validation for `candidate_pool_size`.

### E. Batch Evaluation Configurations

The `ITERATION21_CONFIGS` list in `evaluation.py` includes:

| Config | Method | Alpha | Profile | MMR | Lambda | Pool |
|--------|--------|-------|---------|-----|--------|------|
| iter21_baseline | cosine | 0.70 | equal | off | — | default |
| iter21_hybrid_affect_mmr | hybrid | 0.70 | affect_emphasis | on | 0.75 | default |
| iter21_balanced_a080_no_mmr | hybrid | 0.80 | balanced | off | — | default |
| iter21_balanced_a085_no_mmr | hybrid | 0.85 | balanced | off | — | default |
| iter21_balanced_a090_no_mmr | hybrid | 0.90 | balanced | off | — | default |
| iter21_balanced_a085_mmr_l085 | hybrid | 0.85 | balanced | on | 0.85 | default |
| iter21_balanced_a085_mmr_l090 | hybrid | 0.85 | balanced | on | 0.90 | default |

## Selected Default Configuration

- **Default method**: `cosine` (similarity-first, iteration-1 reproducible)
- **Default destination_mode**: `none`
- **Default MMR**: off
- **Default feature_weight_profile**: `equal`
- **Rationale**: The default preserves iteration-1 baseline reproducibility. The `balanced` profile is available as an option for users who want cross-genre discovery with controlled drift. The candidate pool safeguard ensures hybrid scoring and MMR operate within a similarity-first candidate set, addressing the "too distant" feedback without removing advanced controls.

## Known Limitations

- The genre-match proxy (Precision@K) is not ground-truth relevance; user ratings are needed for final validation.
- Affect labels (Q1–Q4) are heuristic categories, not proven emotional labels.
- The candidate pool safeguard uses content similarity only; it does not use genre as a hard filter, which means some cross-genre results may still appear.
- The fuzzy search cutoff (70) is conservative; very short or ambiguous queries may return fewer results.
- Session persistence stores recommendation results in localStorage; very large result sets may exceed storage limits.
- This iteration responds to formative feedback and does not prove user satisfaction.
