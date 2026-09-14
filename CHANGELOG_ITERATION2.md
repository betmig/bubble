# CHANGELOG — Iteration 2

## Problem Observed

Iteration 1 had six identified limitations:

1. All nine similarity features weighted equally, despite uncertain validity of danceability.
2. Cosine and KNN returned very similar, low-diversity recommendation lists.
3. The Q4 emotional_filter restricted the candidate pool before scoring, making non-Q4 seed recommendations counterintuitive.
4. Coverage was calculated for a single recommendation list, not across many seeds — misleadingly labelled "catalogue coverage."
5. Russell's Circumplex Model and Spotify valence/energy were treated as ground-truth emotional labels rather than a heuristic framework.
6. The notebook used dataset medians for quadrant thresholds while the backend used fixed 0.5 — inconsistent.

## Change Implemented

### A. Standardised affect labels
- Fixed 0.5 thresholds on normalised valence and energy used everywhere (backend + notebook).
- Quadrant labels updated: Q4 described as "calm-positive destination region" / "candidate region," not "Tender/Warm."
- Comments and docstrings clarified that valence/energy do not perfectly determine emotional experience.

### B. Configurable weighted cosine similarity
- Three named profiles: `equal` (all 1.0), `no_danceability` (danceability=0), `affect_emphasis` (valence 2.0, energy 2.0, acousticness 1.5, speechiness 1.5, danceability 0.5, instrumentalness 0.5, tempo 0.5, loudness 0.5, liveness 0.3).
- Weighted cosine implemented via sqrt(weight) multiplication of both seed and candidate vectors.
- Weight validation: known features, non-negative, at least one positive.
- Unweighted cosine preserved as baseline.

### C. Improved hybrid scoring
- Hybrid method now accepts feature_weight_profile for its content-similarity component.
- Alpha remains configurable in [0, 1].
- Response metadata includes selected profile, weights, alpha, and all configuration parameters.

### D. Destination mode (replaces emotional_filter)
- `destination_mode` parameter: "none" (default) or "calm_positive".
- calm_positive: continuous score = valence_norm * (1 - energy_norm), blended as soft bonus (not hard cutoff).
- `destination_weight` configurable (default 0.3).
- Seed always excluded; recommendations work from every quadrant.
- `emotional_filter` retained for backward compatibility (deprecated).

### E. MMR reranking
- `apply_mmr` boolean (default false).
- `mmr_lambda` in [0, 1] (default 0.75; 1.0 = no diversity penalty).
- Candidate pool: max(50, top_k * 5).
- Candidate-candidate similarity uses same weighted feature representation as selected profile.
- MMR settings returned in response metadata.

### F. Corrected and extended evaluation
- Precision@K labelled as genre-match proxy, not ground-truth relevance.
- Intra-list diversity now uses all 9 features (not just 4).
- `single_list_coverage` renamed from misleading "coverage."
- `catalogue_coverage` computed across many seeds.
- `evaluate_batch`: 100+ seeds, random_state=42, mean/std for Precision@K and diversity.
- `compare_configurations`: four required configs, outputs DataFrame + CSV.

### G. API and schemas
- POST /recommend updated with all new parameters.
- POST /evaluate/batch: batch evaluation for one configuration.
- POST /evaluate/compare: compare four required configurations.
- All inputs validated with HTTP 422 for invalid values.
- Existing endpoints maintained.

### H. Tests
- 37 pytest tests covering all requirements, using synthetic fixtures.
- All tests pass.

## Files Changed

| File | Change |
|---|---|
| `backend/app/recommender.py` | Weighted cosine, weight profiles, validation, destination mode, MMR, metadata, standardised quadrant labels |
| `backend/app/evaluation.py` | Batch evaluation, catalogue coverage, 9-feature diversity, comparison utility, renamed single_list_coverage |
| `backend/app/models.py` | New Pydantic models for iteration-2 parameters, batch evaluation, comparison |
| `backend/app/main.py` | Updated /recommend, added /evaluate/batch and /evaluate/compare |
| `backend/tests/conftest.py` | Synthetic dataset fixture for deterministic tests |
| `backend/tests/test_iteration2.py` | 37 tests covering all iteration-2 requirements |
| `backend/notebooks/01_eda_and_model.ipynb` | Fixed quadrant thresholds to 0.5, added Iteration 2 section with batch experiments |
| `src/api/client.ts` | Updated types and function signatures for new API shape |
| `src/pages/ResultsPage.tsx` | Added weight profile, destination mode, MMR controls; updated API calls |
| `src/pages/EvaluationPage.tsx` | Updated to use single_list_coverage |
| `src/lib/constants.ts` | Updated quadrant labels to heuristic wording |
| `README.md` | Full iteration-2 documentation |

## Tests Run

```
python -m pytest backend/tests/ -v

============================= test session starts ==============================
platform linux -- Python 3.13.5, pytest-9.1.1
collected 37 items

backend/tests/test_iteration2.py::TestQuadrantBoundaries ............. PASSED
backend/tests/test_iteration2.py::TestWeightValidation .............. PASSED
backend/tests/test_iteration2.py::TestWeightedCosineEquivalence ..... PASSED
backend/tests/test_iteration2.py::TestSeedExclusionAndDuplicates .... PASSED
backend/tests/test_iteration2.py::TestMMR ........................... PASSED
backend/tests/test_iteration2.py::TestBatchEvaluation ............... PASSED
backend/tests/test_iteration2.py::TestAPIValidation ................. PASSED

======================== 37 passed, 2 warnings in 5.31s ========================
```

## Evaluation Result Location

- **CSV**: `backend/notebooks/iteration2_batch_results.csv` (generated when the notebook batch evaluation cell is run with the full dataset)
- **Chart**: `backend/notebooks/iteration2_comparison_chart.png` (generated by the notebook)
- **Notebook section**: "Iteration 2" in `backend/notebooks/01_eda_and_model.ipynb`
- **API**: `POST /evaluate/compare` returns the four-configuration comparison as JSON

### Four required configurations

1. `iteration1_baseline`: equal weights, cosine, no destination, MMR off
2. `ablation_no_danceability`: no_danceability profile, cosine, MMR off
3. `hybrid_affect_emphasis`: affect_emphasis, alpha=0.7, MMR off
4. `hybrid_affect_emphasis_mmr`: affect_emphasis, alpha=0.7, MMR on (lambda=0.75)

Each row in the CSV includes all configuration parameters, n_seeds_evaluated, mean/std for Precision@K and intra-list diversity, and catalogue coverage.

## Iteration 1 vs Iteration 2 Comparison

| Aspect | Iteration 1 | Iteration 2 |
|---|---|---|
| Feature weights | All equal (1.0) | Three named profiles + custom weights |
| Quadrant thresholds | Backend 0.5, notebook medians | Fixed 0.5 everywhere |
| Q4 filter | Hard candidate restriction | Soft destination_mode bonus |
| Diversity | None | MMR reranking (configurable lambda) |
| Coverage | Single-list, mislabelled | Catalogue coverage across 100 seeds |
| Intra-list diversity | 4 features | All 9 features |
| Batch evaluation | 5 seeds, 3 methods | 100 seeds, 4 configurations with mean/std |
| Affect labels | "Tender/Warm", "Happy/Excited" | "Calm-positive destination region", heuristic |
| Tests | None | 37 pytest tests with synthetic fixtures |
| API endpoints | 5 | 7 (added /evaluate/batch, /evaluate/compare) |

## Known Limitations

- Genre matching is a crude offline proxy for relevance — it cannot capture intra-genre variation or cross-genre similarity.
- Feature weights are hand-designed experimental profiles, not learned from user preference data.
- Russell's circumplex is a heuristic framework; valence and energy do not perfectly capture emotional experience.
- No user study has been conducted. All results are offline metrics only.
- MMR diversity improvement is not guaranteed for every individual seed (tested with skip/explain for edge cases on small synthetic data).

## Next Step

**Consent-based participant relevance study.** Recruit participants who consent to providing relevance ratings for recommended tracks. Use these ratings (not genre matching) as the ground-truth signal to evaluate whether iteration-2 changes improve perceived recommendation quality.

No user-study findings, ratings, or claims of improved subjective relevance are reported here. Only measured offline results are presented.
