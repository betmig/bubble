"""
Synthetic fixture for deterministic unit tests.

Creates a small DataFrame with known audio features so tests do not require
the full Kaggle dataset.  The fixture has tracks in each quadrant and enough
variety to exercise all recommendation methods.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

from app.recommender import (
    FEATURE_COLS,
    assign_quadrant,
    BubbleRecommender,
)


def make_synthetic_recommender(n_tracks: int = 60) -> BubbleRecommender:
    """
    Build a BubbleRecommender loaded with a synthetic dataset.

    The dataset has n_tracks rows with deterministic feature values that span
    all four quadrants and produce varied recommendations.
    """
    rng = np.random.RandomState(123)
    n = n_tracks

    # Generate raw features with varied ranges
    data = {}
    for col in FEATURE_COLS:
        # Different distributions per feature to create variety
        base = rng.uniform(0, 1, size=n)
        if col == "tempo":
            base = rng.uniform(60, 180, size=n)
        elif col == "loudness":
            base = rng.uniform(-40, 0, size=n)
        elif col == "liveness":
            base = rng.uniform(0, 0.8, size=n)
        elif col == "speechiness":
            base = rng.uniform(0, 0.6, size=n)
        elif col == "instrumentalness":
            base = rng.uniform(0, 0.9, size=n)
        data[col] = base

    df = pd.DataFrame(data)

    # Identifiers
    df["track_id"] = [f"track_{i:03d}" for i in range(n)]
    df["track_name"] = [f"Song {i}" for i in range(n)]
    df["artist_name"] = [f"Artist {i % 5}" for i in range(n)]
    df["genre"] = [f"genre_{i % 6}" for i in range(n)]
    df["popularity"] = rng.randint(0, 100, size=n)

    # Normalise features to [0, 1]
    scaler = MinMaxScaler()
    normed = scaler.fit_transform(df[FEATURE_COLS].values.astype(float))
    for i, col in enumerate(FEATURE_COLS):
        df[f"{col}_norm"] = normed[:, i]

    # Intimacy score
    df["intimacy_score"] = (
        df["valence_norm"]
        * (1 - df["energy_norm"])
        * df["acousticness_norm"]
        * (1 - df["speechiness_norm"])
    )

    # Quadrant
    df["quadrant"] = df.apply(
        lambda r: assign_quadrant(r["valence_norm"], r["energy_norm"]), axis=1
    )

    rec = BubbleRecommender()
    rec.load_from_df(df, normed)
    return rec
