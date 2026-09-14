"""
Offline evaluation metrics for Bubble (Iteration 2).

Metrics
-------
precision_at_k       : fraction of top-K recommendations sharing the seed's genre
                       (genre-match proxy, NOT ground-truth relevance)
intra_list_diversity : average pairwise cosine distance within a recommendation list,
                       using the complete weighted feature set
catalogue_coverage   : unique recommended tracks across many seeds / total catalogue
single_list_coverage : unique tracks in a single list / total catalogue (renamed to
                       avoid misleading "catalogue coverage" interpretation)

Batch evaluation
----------------
evaluate_batch       : runs multiple seeds through specified configurations and
                       aggregates mean/std for Precision@K and intra-list diversity,
                       plus catalogue coverage across all seeds.

Comparison utility
------------------
compare_configurations : evaluates four required configurations and returns a
                         pandas DataFrame + CSV export.
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
    """
    Fraction of the top-K recommended tracks whose genre matches the seed genre.

    This is a genre-match PROXY for offline evaluation, not ground-truth
    relevance.  User ratings are needed for final relevance validation.
    """
    top = recommendations[:k]
    if not top:
        return 0.0
    hits = sum(1 for r in top if r.get("genre", "") == seed_genre)
    return hits / len(top)


def intra_list_diversity(
    recommendations: list[dict],
    feature_cols: list[str] | None = None,
) -> float:
    """
    Average pairwise cosine distance within the recommendation list.

    Uses the complete weighted feature set by default (all nine normalised
    audio features) rather than only valence, energy, danceability, and
    acousticness as in iteration 1.

    Parameters
    ----------
    recommendations : list of recommendation dicts with numeric audio features
    feature_cols    : feature keys to use; defaults to all nine features

    Returns
    -------
    float in [0, 1], or 0.0 if fewer than 2 recommendations
    """
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
    """
    Fraction of the catalogue that appeared in any recommendation list across
    multiple seeds.

    Parameters
    ----------
    all_recommended_ids : flat list of track_ids from multiple recommendation calls
    total_track_count   : total number of tracks in the dataset
    """
    if total_track_count == 0:
        return 0.0
    unique = len(set(all_recommended_ids))
    return unique / total_track_count


def single_list_coverage(
    recommendations: list[dict],
    total_track_count: int,
) -> float:
    """
    Fraction of the catalogue covered by a single recommendation list.

    Renamed from iteration-1 'coverage' to avoid misleading interpretation.
    Catalogue coverage should be computed across many seeds, not one list.
    """
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
    """
    Run all single-list evaluation metrics for one recommendation list.
    """
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
    config_name: str = "",
) -> dict:
    """
    Evaluate a single configuration across multiple seeds.

    Parameters
    ----------
    rec : BubbleRecommender instance (must be loaded)
    seed_ids : deterministic list of seed track IDs, or None to sample
    n_seeds : number of seeds to sample if seed_ids is None
    k : top_k for recommendations
    random_state : reproducible random sampling seed
    config_name : label for this configuration in output

    Returns
    -------
    dict with:
      - config parameters
      - mean and std of precision_at_k
      - mean and std of intra_list_diversity
      - catalogue_coverage (across all seeds)
      - n_seeds_evaluated
      - all_recommended_ids
    """
    rec._ensure_loaded()

    # Resolve seed IDs
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


def compare_configurations(
    rec: BubbleRecommender,
    seed_ids: list[str] | None = None,
    n_seeds: int = 100,
    k: int = 10,
    random_state: int = 42,
    output_csv: str | None = None,
    configs: list[dict] | None = None,
) -> pd.DataFrame:
    """
    Run batch evaluation for the four required configurations and return a
    comparison DataFrame.

    Configurations:
      1. iteration1_baseline: equal weights, cosine, no destination, MMR off
      2. ablation_no_danceability: no_danceability profile, cosine, MMR off
      3. hybrid_affect_emphasis: affect_emphasis, alpha=0.7, MMR off
      4. hybrid_affect_emphasis_mmr: affect_emphasis, alpha=0.7, MMR on (lambda=0.75)

    Each row in the output DataFrame includes all configuration parameters.
    """
    if configs is None:
        configs = REQUIRED_CONFIGS

    # Use the same seed_ids for all configurations for fair comparison
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
        # Don't include the large id list in the DataFrame
        row = {key: val for key, val in batch_result.items() if key != "all_recommended_ids"}
        results.append(row)

    df = pd.DataFrame(results)

    if output_csv:
        os.makedirs(os.path.dirname(output_csv) or ".", exist_ok=True)
        df.to_csv(output_csv, index=False)
        print(f"Batch results exported to {output_csv}")

    return df
