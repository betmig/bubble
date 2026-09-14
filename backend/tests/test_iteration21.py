"""
Test suite for Bubble Iteration 2.1.

Covers:
  - Intelligent seed search (tiered ranking, fuzzy fallback, normalisation)
  - Balanced feature-weight profile validation
  - Candidate pool safeguard (similarity-first, seed excluded, size in metadata)
  - Iteration 2.1 comparison configurations
  - API validation for candidate_pool_size
"""

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.recommender import (
    BubbleRecommender,
    FEATURE_WEIGHT_PROFILES,
    _normalise_text,
)
from app.evaluation import (
    evaluate_batch,
    compare_configurations,
    ITERATION21_CONFIGS,
    compare_iteration21,
)
from app.main import app

from tests.conftest import make_synthetic_recommender


# -- Fixtures -------------------------------------------------------------------

@pytest.fixture
def rec():
    return make_synthetic_recommender(n_tracks=60)


@pytest.fixture
def client():
    return TestClient(app)


# -- Search tests ---------------------------------------------------------------

class TestSearchNormalisation:
    """Test the _normalise_text helper."""

    def test_none_becomes_empty(self):
        assert _normalise_text(None) == ""

    def test_nan_string_becomes_empty(self):
        assert _normalise_text("nan") == ""

    def test_lowercases(self):
        assert _normalise_text("Hello World") == "hello world"

    def test_accent_folding(self):
        assert _normalise_text("café") == "cafe"
        assert _normalise_text("Björk") == "bjork"

    def test_punctuation_replaced(self):
        assert _normalise_text("song! (remix)") == "song remix"

    def test_whitespace_collapse(self):
        assert _normalise_text("  too   many  spaces  ") == "too many spaces"

    def test_non_string_input(self):
        assert _normalise_text(42) == "42"


class TestSearch:

    def test_empty_query_returns_empty(self, rec):
        assert rec.search_tracks("") == []
        assert rec.search_tracks("   ") == []

    def test_artist_query(self, rec):
        results = rec.search_tracks("Artist 0", limit=10)
        assert len(results) > 0
        for r in results:
            assert "Artist 0" in r["artist"] or "artist 0" in r["artist"].lower()

    def test_title_query(self, rec):
        results = rec.search_tracks("Song 1", limit=10)
        assert len(results) > 0
        assert any("Song 1" in r["name"] for r in results)

    def test_combined_query(self, rec):
        results = rec.search_tracks("Song 1 Artist 1", limit=10)
        assert len(results) > 0
        # The exact track "Song 1" by "Artist 1" should be top
        assert results[0]["name"] == "Song 1"

    def test_reversed_combined_query(self, rec):
        results = rec.search_tracks("Artist 1 Song 1", limit=10)
        assert len(results) > 0
        assert results[0]["name"] == "Song 1"

    def test_typo_tolerance(self, rec):
        # "Sogn 1" is close to "Song 1" — fuzzy fallback should find it
        results = rec.search_tracks("Sogn 1", limit=10)
        assert len(results) > 0
        assert any("Song 1" in r["name"] for r in results)

    def test_case_insensitive(self, rec):
        results_lower = rec.search_tracks("song 1", limit=5)
        results_upper = rec.search_tracks("SONG 1", limit=5)
        results_mixed = rec.search_tracks("SoNg 1", limit=5)
        ids_lower = [r["id"] for r in results_lower]
        ids_upper = [r["id"] for r in results_upper]
        ids_mixed = [r["id"] for r in results_mixed]
        assert ids_lower == ids_upper == ids_mixed

    def test_punctuation_and_spaces(self, rec):
        results_normal = rec.search_tracks("Song 1", limit=5)
        results_punct = rec.search_tracks("Song-1!", limit=5)
        ids_normal = [r["id"] for r in results_normal]
        ids_punct = [r["id"] for r in results_punct]
        # Should overlap significantly
        assert len(set(ids_normal) & set(ids_punct)) > 0

    def test_accent_folding_search(self):
        """Search with accented characters should match non-accented data."""
        rec = BubbleRecommender()
        df = pd.DataFrame({
            "track_id": ["t1", "t2"],
            "track_name": ["Café Bleu", "Nightcall"],
            "artist_name": ["Björk", "Kavinsky"],
            "genre": ["electronic", "electronic"],
            "popularity": [80, 90],
            "valence_norm": [0.6, 0.4],
            "energy_norm": [0.3, 0.7],
            "danceability_norm": [0.5, 0.6],
            "acousticness_norm": [0.4, 0.2],
            "instrumentalness_norm": [0.3, 0.8],
            "speechiness_norm": [0.1, 0.05],
            "liveness_norm": [0.1, 0.2],
            "tempo_norm": [0.4, 0.6],
            "loudness_norm": [0.5, 0.7],
            "intimacy_score": [0.1, 0.05],
            "quadrant": ["Q4", "Q1"],
        })
        feature_matrix = np.array([
            [0.6, 0.3, 0.5, 0.4, 0.3, 0.1, 0.1, 0.4, 0.5],
            [0.4, 0.7, 0.6, 0.2, 0.8, 0.05, 0.2, 0.6, 0.7],
        ])
        rec.load_from_df(df, feature_matrix)

        # Search without accent should find accented title
        results = rec.search_tracks("cafe bleu", limit=5)
        assert len(results) > 0
        assert results[0]["id"] == "t1"

        # Search with accent should also work
        results_accent = rec.search_tracks("Björk", limit=5)
        assert len(results) > 0

    def test_exact_match_ranks_above_fuzzy(self, rec):
        """An exact match should rank higher than a fuzzy-only match."""
        results = rec.search_tracks("Song 1", limit=15)
        # Song 1 should be in results and rank high
        song1 = [r for r in results if r["name"] == "Song 1"]
        assert len(song1) > 0
        # It should have a better (lower) match_type than fuzzy-only matches
        assert song1[0]["match_type"] <= 1

    def test_unrelated_low_score_excluded(self, rec):
        """Gibberish query should not return results (or very few)."""
        results = rec.search_tracks("xyzzyqwerty nonsense", limit=15)
        # Should return empty or very few results
        assert len(results) <= 2

    def test_result_limit(self, rec):
        results = rec.search_tracks("Song", limit=5)
        assert len(results) <= 5

    def test_no_duplicate_ids(self, rec):
        results = rec.search_tracks("Song", limit=15)
        ids = [r["id"] for r in results]
        assert len(ids) == len(set(ids))

    def test_deterministic_ordering(self, rec):
        r1 = rec.search_tracks("Song", limit=10)
        r2 = rec.search_tracks("Song", limit=10)
        assert [r["id"] for r in r1] == [r["id"] for r in r2]

    def test_search_fields_precomputed(self, rec):
        """Search fields should be present after load."""
        assert "trackname_search" in rec.df.columns
        assert "artistname_search" in rec.df.columns
        assert "combined_search" in rec.df.columns

    def test_match_type_and_score_in_results(self, rec):
        results = rec.search_tracks("Song 1", limit=5)
        for r in results:
            assert "match_type" in r
            assert "search_score" in r


# -- Balanced profile tests -----------------------------------------------------

class TestBalancedProfile:

    def test_balanced_profile_exists(self):
        assert "balanced" in FEATURE_WEIGHT_PROFILES

    def test_balanced_profile_weights_positive(self):
        weights = FEATURE_WEIGHT_PROFILES["balanced"]
        for col, w in weights.items():
            assert w > 0, f"Weight for {col} should be positive"

    def test_balanced_profile_higher_alpha_than_affect(self):
        """Balanced profile should have milder emphasis than affect_emphasis."""
        balanced = FEATURE_WEIGHT_PROFILES["balanced"]
        affect = FEATURE_WEIGHT_PROFILES["affect_emphasis"]
        # Balanced valence weight should be less than affect valence weight
        assert balanced["valence"] < affect["valence"]
        assert balanced["energy"] < affect["energy"]

    def test_balanced_profile_in_valid_profiles(self):
        from app.recommender import VALID_PROFILES
        assert "balanced" in VALID_PROFILES

    def test_balanced_recommendation_works(self, rec):
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(
            seed_track_id=seed_id, top_k=10,
            method="hybrid", alpha=0.85,
            feature_weight_profile="balanced",
        )
        assert len(result["recommendations"]) > 0
        assert result["metadata"]["feature_weight_profile"] == "balanced"


# -- Candidate pool safeguard tests ---------------------------------------------

class TestCandidatePool:

    def test_candidate_pool_size_in_metadata(self, rec):
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(seed_track_id=seed_id, top_k=10)
        assert "candidate_pool_size" in result["metadata"]

    def test_candidate_pool_default_value(self, rec):
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(seed_track_id=seed_id, top_k=10)
        # Default is max(100, top_k * 10) = 100; metadata stores the configured
        # size (actual pool may be smaller if catalogue is smaller)
        assert result["metadata"]["candidate_pool_size"] == 100

    def test_candidate_pool_custom_size(self, rec):
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(
            seed_track_id=seed_id, top_k=5,
            candidate_pool_size=30,
        )
        assert result["metadata"]["candidate_pool_size"] == 30

    def test_candidate_pool_excludes_seed(self, rec):
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(
            seed_track_id=seed_id, top_k=10,
            candidate_pool_size=50,
        )
        ids = [r["track_id"] for r in result["recommendations"]]
        assert seed_id not in ids

    def test_candidate_pool_no_genre_filter(self, rec):
        """Candidate pool should not hard-filter by genre."""
        seed_id = rec.df.iloc[0]["track_id"]
        seed_genre = rec.df.iloc[0]["genre"]
        result = rec.recommend(
            seed_track_id=seed_id, top_k=10,
            candidate_pool_size=50,
        )
        genres = set(r["genre"] for r in result["recommendations"])
        # Should contain genres other than the seed's
        assert len(genres) > 1 or len(rec.df["genre"].unique()) == 1

    def test_cosine_default_destination_none(self, rec):
        """Default destination_mode should be 'none'."""
        seed_id = rec.df.iloc[0]["track_id"]
        result = rec.recommend(seed_track_id=seed_id, top_k=10)
        assert result["metadata"]["destination_mode"] == "none"


# -- Iteration 2.1 batch evaluation tests ---------------------------------------

class TestIteration21BatchEval:

    def test_iteration21_configs_exist(self):
        assert len(ITERATION21_CONFIGS) >= 7

    def test_iteration21_configs_include_baseline(self):
        names = [c["config_name"] for c in ITERATION21_CONFIGS]
        assert "iter21_baseline" in names
        assert "iter21_hybrid_affect_mmr" in names

    def test_iteration21_configs_include_alpha_tests(self):
        names = [c["config_name"] for c in ITERATION21_CONFIGS]
        assert "iter21_balanced_a080_no_mmr" in names
        assert "iter21_balanced_a085_no_mmr" in names
        assert "iter21_balanced_a090_no_mmr" in names

    def test_iteration21_configs_include_mmr_lambda_tests(self):
        names = [c["config_name"] for c in ITERATION21_CONFIGS]
        assert "iter21_balanced_a085_mmr_l085" in names
        assert "iter21_balanced_a085_mmr_l090" in names

    def test_compare_iteration21_returns_rows(self, rec):
        df = compare_iteration21(rec, n_seeds=10, k=5, random_state=42)
        assert len(df) == len(ITERATION21_CONFIGS)

    def test_compare_iteration21_reproducible(self, rec):
        df1 = compare_iteration21(rec, n_seeds=10, k=5, random_state=42)
        df2 = compare_iteration21(rec, n_seeds=10, k=5, random_state=42)
        assert df1["precision_at_k_mean"].tolist() == df2["precision_at_k_mean"].tolist()

    def test_batch_eval_includes_candidate_pool_size(self, rec):
        result = evaluate_batch(
            rec, n_seeds=10, k=5, random_state=42,
            method="hybrid", alpha=0.85,
            feature_weight_profile="balanced",
            config_name="test_pool",
        )
        assert "candidate_pool_size" in result

    def test_compare_configs_include_candidate_pool_size(self, rec):
        df = compare_iteration21(rec, n_seeds=10, k=5, random_state=42)
        assert "candidate_pool_size" in df.columns


# -- API validation for candidate_pool_size -------------------------------------

class TestAPIValidation21:

    def test_candidate_pool_too_small_rejected(self, client):
        response = client.post("/recommend", json={
            "seed_track_id": "track_001",
            "candidate_pool_size": 5,
        })
        assert response.status_code == 422

    def test_candidate_pool_too_large_rejected(self, client):
        response = client.post("/recommend", json={
            "seed_track_id": "track_001",
            "candidate_pool_size": 100001,
        })
        assert response.status_code == 422

    def test_balanced_profile_accepted(self, client):
        """Balanced profile should be valid (not rejected as unknown)."""
        response = client.post("/recommend", json={
            "seed_track_id": "track_001",
            "feature_weight_profile": "balanced",
        })
        # 503 (dataset not loaded) is fine — we just want to confirm it's not 422
        assert response.status_code != 422
