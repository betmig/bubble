"""
Offline evaluation metrics for Bubble.

Metrics
-------
precision_at_k      : fraction of top-K recommendations sharing the seed's genre
coverage            : unique recommended tracks / total tracks (across many seeds)
intra_list_diversity: average pairwise cosine distance within a recommendation list
"""

import numpy as np
from sklearn.metrics.pairwise import cosine_distances


def precision_at_k(
    recommendations: list[dict],
    seed_genre: str,
    k: int,
) -> float:
    """
    Fraction of the top-K recommended tracks whose genre matches the seed genre.

    Parameters
    ----------
    recommendations : list of recommendation dicts (must contain 'genre')
    seed_genre      : genre label of the seed track
    k               : cutoff

    Returns
    -------
    float in [0, 1]
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

    Higher values indicate a more diverse set of recommendations.

    Parameters
    ----------
    recommendations : list of recommendation dicts with numeric audio features
    feature_cols    : column names to use for the diversity calculation;
                      defaults to valence, energy, danceability, acousticness

    Returns
    -------
    float in [0, 1], or 0.0 if fewer than 2 recommendations
    """
    if feature_cols is None:
        feature_cols = ["valence", "energy", "danceability", "acousticness"]

    if len(recommendations) < 2:
        return 0.0

    matrix = np.array([[r.get(col, 0.0) for col in feature_cols] for r in recommendations])
    dist_matrix = cosine_distances(matrix)

    # Average upper triangle (exclude diagonal)
    n = len(recommendations)
    total = 0.0
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += dist_matrix[i, j]
            count += 1

    return float(total / count) if count > 0 else 0.0


def coverage(
    all_recommended_ids: list[str],
    total_track_count: int,
) -> float:
    """
    Fraction of the catalogue that appeared in any recommendation list.

    Parameters
    ----------
    all_recommended_ids : flat list of track_ids from multiple recommendation calls
    total_track_count   : total number of tracks in the dataset

    Returns
    -------
    float in [0, 1]
    """
    if total_track_count == 0:
        return 0.0
    unique = len(set(all_recommended_ids))
    return unique / total_track_count


def evaluate_single(
    recommendations: list[dict],
    seed_genre: str,
    k: int,
    total_tracks: int,
) -> dict:
    """
    Run all evaluation metrics for a single recommendation list.

    Returns a dict suitable for JSON serialisation.
    """
    rec_ids = [r["track_id"] for r in recommendations]
    return {
        "precision_at_k": precision_at_k(recommendations, seed_genre, k),
        "coverage": coverage(rec_ids, total_tracks),
        "intra_list_diversity": intra_list_diversity(recommendations),
    }
