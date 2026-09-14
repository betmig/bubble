"""
Offline evaluation metrics for Bubble (Iteration 2.1).

Metrics
-------
precision_at_k       : fraction of top-K recommendations sharing the seed's genre
                       (genre-match proxy, NOT ground-truth relevance)
intra_list_diversity : average pairwise cosine distance within a recommendation list
catalogue_coverage   : unique recommended tracks across many seeds / total catalogue
single_list_coverage : unique tracks in a single list / total catalogue

Batch evaluation
----------------
evaluate_batch       : runs multiple seeds through specified configurations and
                       aggregates mean/std for Precision@K and intra-list diversity,
                       plus catalogue coverage across all seeds.

Comparison utility
------------------
compare_configurations : evaluates configurations and returns a pandas DataFrame.
Iteration 2.1 adds comparison configs for relevance tuning.
"""

import os
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_distances

from .recommender import (
    BubbleRecommender,
    FEATURE_COLS,
    FEATURE_WEIGHT_PROFILES,
)


# -- Single-list metrics -------------------------------------------------------

def precision_at_k(
    recommendations: list[dict],
    seed_genre: str,
    k: int,
) -> float:
    """Fraction of the top-K recommended tracks whose genre matches the seed genre."""
    top = recommendations[:k]
    if not top:
        return 0.0
    hits = sum(1 for r in top if r.get("genre", "") == seed_genre)
    return hits / len(top)


def intra_list_diversity(
    recommendations: list[dict],
    feature_cols: list[str] | None = None,
) -> float:
    """Average pairwise cosine distance within the recommendation list."""
    if feature_cols is None:
        feature_cols = [
            "valence", "energy", "danceability", "acousticness",
            "instrumentalness", "speechiness", "liveness", "tempo", "loudness",
        ]

    if len(recommendations) < 2:
        return 0.0

    matrix = np.array([[r.get(col, 0.0) for col in feature_cols] for r in recommendations])
    dist_matrix = cosine_distances(matrix)

    n = len(recommendations)
    total = 0.0
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += dist_matrix[i, j]
            count += 1

    return float(total / count) if count > 0 else 0.0


def catalogue_coverage(
    all_recommended_ids: list[str],
    total_track_count: int,
) -> float:
    """Fraction of the catalogue that appeared in any recommendation list."""
    if total_track_count == 0:
        return 0.0
    unique = len(set(all_recommended_ids))
    return unique / total_track_count


def single_list_coverage(
    recommendations: list[dict],
    total_track_count: int,
) -> float:
    """Fraction of the catalogue covered by a single recommendation list."""
    if total_track_count == 0:
        return 0.0
    unique = len(set(r["track_id"] for r in recommendations))
    return unique / total_track_count


def evaluate_single(
    recommendations: list[dict],
    seed_genre: str,
    k: int,
    total_tracks: int,
) -> dict:
    """Run all single-list evaluation metrics for one recommendation list."""
    return {
        "precision_at_k": precision_at_k(recommendations, seed_genre, k),
        "single_list_coverage": single_list_coverage(recommendations, total_tracks),
        "intra_list_diversity": intra_list_diversity(recommendations),
    }


# -- Batch evaluation ----------------------------------------------------------

def evaluate_batch(
    rec: BubbleRecommender,
    seed_ids: list[str] | None = None,
    n_seeds: int = 100,
    k: int = 10,
    random_state: int = 42,
    method: str = "cosine",
    alpha: float = 0.7,
    feature_weight_profile: str = "equal",
    destination_mode: str = "none",
    destination_weight: float = 0.3,
    apply_mmr: bool = False,
    mmr_lambda: float = 0.75,
    candidate_pool_size: int | None = None,
    config_name: str = "",
) -> dict:
    """Evaluate a single configuration across multiple seeds."""
    rec._ensure_loaded()

    if seed_ids is None:
        rng = np.random.RandomState(random_state)
        all_ids = rec.df["track_id"].tolist()
        sample_size = min(n_seeds, len(all_ids))
        seed_ids = list(rng.choice(all_ids, size=sample_size, replace=False))

    precision_scores = []
    diversity_scores = []
    all_recommended_ids: list[str] = []

    for sid in seed_ids:
        result = rec.recommend(
            seed_track_id=sid,
            top_k=k,
            method=method,
            alpha=alpha,
            feature_weight_profile=feature_weight_profile,
            destination_mode=destination_mode,
            destination_weight=destination_weight,
            apply_mmr=apply_mmr,
            mmr_lambda=mmr_lambda,
            candidate_pool_size=candidate_pool_size,
        )
        recs = result["recommendations"]
        if not recs:
            continue

        seed_row = rec.get_track_by_id(sid)
        if seed_row is None:
            continue

        seed_genre = str(seed_row.get("genre", "unknown"))
        precision_scores.append(precision_at_k(recs, seed_genre, k))
        diversity_scores.append(intra_list_diversity(recs))
        all_recommended_ids.extend(r["track_id"] for r in recs)

    n_evaluated = len(precision_scores)

    return {
        "config_name": config_name,
        "method": method,
        "alpha": alpha,
        "feature_weight_profile": feature_weight_profile,
        "destination_mode": destination_mode,
        "destination_weight": destination_weight,
        "apply_mmr": apply_mmr,
        "mmr_lambda": mmr_lambda,
        "candidate_pool_size": candidate_pool_size,
        "k": k,
        "n_seeds_evaluated": n_evaluated,
        "precision_at_k_mean": float(np.mean(precision_scores)) if precision_scores else 0.0,
        "precision_at_k_std": float(np.std(precision_scores)) if precision_scores else 0.0,
        "intra_list_diversity_mean": float(np.mean(diversity_scores)) if diversity_scores else 0.0,
        "intra_list_diversity_std": float(np.std(diversity_scores)) if diversity_scores else 0.0,
        "catalogue_coverage": catalogue_coverage(all_recommended_ids, rec.track_count),
        "all_recommended_ids": all_recommended_ids,
    }


# -- Configuration comparison --------------------------------------------------

REQUIRED_CONFIGS = [
    {
        "config_name": "iteration1_baseline",
        "method": "cosine",
        "alpha": 0.7,
        "feature_weight_profile": "equal",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    {
        "config_name": "ablation_no_danceability",
        "method": "cosine",
        "alpha": 0.7,
        "feature_weight_profile": "no_danceability",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    {
        "config_name": "hybrid_affect_emphasis",
        "method": "hybrid",
        "alpha": 0.7,
        "feature_weight_profile": "affect_emphasis",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    {
        "config_name": "hybrid_affect_emphasis_mmr",
        "method": "hybrid",
        "alpha": 0.7,
        "feature_weight_profile": "affect_emphasis",
        "destination_mode": "none",
        "apply_mmr": True,
        "mmr_lambda": 0.75,
    },
]

# Iteration 2.1 comparison configurations for relevance tuning
ITERATION21_CONFIGS = [
    # A. Iteration-1 baseline
    {
        "config_name": "iter21_baseline",
        "method": "cosine",
        "alpha": 0.7,
        "feature_weight_profile": "equal",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    # B. Current iteration-2 hybrid + MMR
    {
        "config_name": "iter21_hybrid_affect_mmr",
        "method": "hybrid",
        "alpha": 0.70,
        "feature_weight_profile": "affect_emphasis",
        "destination_mode": "none",
        "apply_mmr": True,
        "mmr_lambda": 0.75,
    },
    # C. Balanced hybrid without MMR — alpha tests
    {
        "config_name": "iter21_balanced_a080_no_mmr",
        "method": "hybrid",
        "alpha": 0.80,
        "feature_weight_profile": "balanced",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    {
        "config_name": "iter21_balanced_a085_no_mmr",
        "method": "hybrid",
        "alpha": 0.85,
        "feature_weight_profile": "balanced",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    {
        "config_name": "iter21_balanced_a090_no_mmr",
        "method": "hybrid",
        "alpha": 0.90,
        "feature_weight_profile": "balanced",
        "destination_mode": "none",
        "apply_mmr": False,
        "mmr_lambda": 0.75,
    },
    # D. Balanced hybrid with conservative MMR — lambda tests (best alpha assumed 0.85)
    {
        "config_name": "iter21_balanced_a085_mmr_l085",
        "method": "hybrid",
        "alpha": 0.85,
        "feature_weight_profile": "balanced",
        "destination_mode": "none",
        "apply_mmr": True,
        "mmr_lambda": 0.85,
    },
    {
        "config_name": "iter21_balanced_a085_mmr_l090",
        "method": "hybrid",
        "alpha": 0.85,
        "feature_weight_profile": "balanced",
        "destination_mode": "none",
        "apply_mmr": True,
        "mmr_lambda": 0.90,
    },
]


def compare_configurations(
    rec: BubbleRecommender,
    seed_ids: list[str] | None = None,
    n_seeds: int = 100,
    k: int = 10,
    random_state: int = 42,
    output_csv: str | None = None,
    configs: list[dict] | None = None,
) -> pd.DataFrame:
    """Run batch evaluation for configurations and return a comparison DataFrame."""
    if configs is None:
        configs = REQUIRED_CONFIGS

    if seed_ids is None:
        rng = np.random.RandomState(random_state)
        all_ids = rec.df["track_id"].tolist()
        sample_size = min(n_seeds, len(all_ids))
        seed_ids = list(rng.choice(all_ids, size=sample_size, replace=False))

    results = []
    for cfg in configs:
        batch_result = evaluate_batch(
            rec,
            seed_ids=seed_ids,
            k=k,
            random_state=random_state,
            **cfg,
        )
        row = {key: val for key, val in batch_result.items() if key != "all_recommended_ids"}
        results.append(row)

    df = pd.DataFrame(results)

    if output_csv:
        os.makedirs(os.path.dirname(output_csv) or ".", exist_ok=True)
        df.to_csv(output_csv, index=False)
        print(f"Batch results exported to {output_csv}")

    return df


def compare_iteration21(
    rec: BubbleRecommender,
    seed_ids: list[str] | None = None,
    n_seeds: int = 100,
    k: int = 10,
    random_state: int = 42,
    output_csv: str | None = None,
) -> pd.DataFrame:
    """Run the Iteration 2.1 comparison configurations."""
    return compare_configurations(
        rec,
        seed_ids=seed_ids,
        n_seeds=n_seeds,
        k=k,
        random_state=random_state,
        output_csv=output_csv,
        configs=ITERATION21_CONFIGS,
    )
