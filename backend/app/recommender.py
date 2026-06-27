"""
Core recommendation pipeline for Bubble.

Pipeline stages:
  1. Load and validate the Spotify CSV dataset.
  2. Feature selection and MinMax normalisation.
  3. Compute custom intimacy_score per track.
  4. Assign Russell quadrant (valence × energy plane).
  5. Expose three recommendation methods:
       A) Cosine similarity baseline
       B) KNN via scikit-learn NearestNeighbors
       C) Hybrid (cosine + intimacy blend)
"""

import os
import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

FEATURE_COLS = [
    "valence",
    "energy",
    "danceability",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
    "tempo",
    "loudness",
]

REQUIRED_COLS = FEATURE_COLS + ["track_id", "track_name", "artist_name"]

DATASET_PATH = os.getenv("DATASET_PATH", "data/spotify_tracks.csv")


# ── Data loading & preprocessing ──────────────────────────────────────────────

class BubbleRecommender:
    """Holds the preprocessed dataset and exposes recommendation methods."""

    def __init__(self) -> None:
        self.df: pd.DataFrame = pd.DataFrame()
        self.feature_matrix: np.ndarray = np.empty((0, len(FEATURE_COLS)))
        self._knn: Optional[NearestNeighbors] = None
        self._loaded = False

    # ── Loading ───────────────────────────────────────────────────────────────

    def load(self, path: str = DATASET_PATH) -> None:
        """Load CSV, validate columns, normalise features, compute derived columns."""
        logger.info("Loading dataset from %s", path)
        raw = pd.read_csv(path)

        # Normalise Kaggle column names to internal schema
        raw = raw.rename(columns={
            "artists": "artist_name",
            "track_genre": "genre",
        })
        if "track_id" not in raw.columns and "Unnamed: 0" in raw.columns:
            raw = raw.rename(columns={"Unnamed: 0": "track_id"})

        # Tolerate missing optional columns but require core ones
        missing = [c for c in REQUIRED_COLS if c not in raw.columns]
        if missing:
            raise ValueError(f"Dataset missing required columns: {missing}")

        df = raw.copy()
        df = df.dropna(subset=REQUIRED_COLS)
        df = df.drop_duplicates(subset=["track_id"])
        df = df.reset_index(drop=True)

        # Fill optional columns
        if "genre" not in df.columns:
            df["genre"] = "unknown"
        if "popularity" not in df.columns:
            df["popularity"] = 0

        # Normalise feature columns to [0, 1]
        scaler = MinMaxScaler()
        normed = scaler.fit_transform(df[FEATURE_COLS].values.astype(float))
        for i, col in enumerate(FEATURE_COLS):
            df[f"{col}_norm"] = normed[:, i]

        # Intimacy score: warmth proxy using normalised values
        # Formula: valence_n × (1 − energy_n) × acousticness_n × (1 − speechiness_n)
        df["intimacy_score"] = (
            df["valence_norm"]
            * (1 - df["energy_norm"])
            * df["acousticness_norm"]
            * (1 - df["speechiness_norm"])
        )

        # Assign Russell quadrant
        df["quadrant"] = df.apply(
            lambda r: assign_quadrant(r["valence_norm"], r["energy_norm"]), axis=1
        )

        self.df = df
        self.feature_matrix = normed
        self._knn = None  # reset on reload
        self._loaded = True
        logger.info("Dataset loaded: %d tracks", len(df))

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            raise RuntimeError("Recommender not loaded. Call load() first.")

    # ── Public helpers ────────────────────────────────────────────────────────

    @property
    def track_count(self) -> int:
        return len(self.df)

    def get_track_by_id(self, track_id: str) -> Optional[pd.Series]:
        rows = self.df[self.df["track_id"] == track_id]
        return rows.iloc[0] if not rows.empty else None

    def search_tracks(self, query: str, limit: int = 10) -> list[dict]:
        """Case-insensitive substring search over track_name + artist_name."""
        self._ensure_loaded()
        q = query.lower()
        mask = (
            self.df["track_name"].str.lower().str.contains(q, na=False)
            | self.df["artist_name"].str.lower().str.contains(q, na=False)
        )
        matches = self.df[mask].head(limit)
        return [
            {"id": row["track_id"], "name": row["track_name"], "artist": row["artist_name"]}
            for _, row in matches.iterrows()
        ]

    # ── Recommendation entry point ────────────────────────────────────────────

    def recommend(
        self,
        seed_track_id: str,
        top_k: int = 10,
        method: str = "cosine",
        alpha: float = 0.7,
        emotional_filter: Optional[str] = None,
    ) -> list[dict]:
        """
        Return top_k recommendations for seed_track_id.

        Parameters
        ----------
        seed_track_id : str
        top_k         : int   – number of results to return
        method        : str   – "cosine" | "knn" | "hybrid"
        alpha         : float – hybrid weight (1=pure cosine, 0=pure intimacy)
        emotional_filter : str|None – if "Q4", restrict candidates to Q4 tracks
        """
        self._ensure_loaded()

        seed_row = self.get_track_by_id(seed_track_id)
        if seed_row is None:
            raise ValueError(f"Track ID not found: {seed_track_id}")

        seed_idx = self.df.index[self.df["track_id"] == seed_track_id][0]
        seed_vec = self.feature_matrix[seed_idx].reshape(1, -1)

        # Candidate pool
        candidates = self.df.copy()
        candidate_matrix = self.feature_matrix.copy()

        if emotional_filter:
            mask = candidates["quadrant"] == emotional_filter
            candidates = candidates[mask].reset_index(drop=True)
            candidate_matrix = self.feature_matrix[self.df["quadrant"] == emotional_filter]

        # Remove seed from candidates
        no_seed = candidates["track_id"] != seed_track_id
        candidates = candidates[no_seed].reset_index(drop=True)
        candidate_matrix = candidate_matrix[no_seed.values if emotional_filter is None else np.array(no_seed)]

        if len(candidates) == 0:
            return []

        if method == "cosine":
            scores = _cosine_scores(seed_vec, candidate_matrix)
        elif method == "knn":
            scores = _knn_scores(seed_vec, candidate_matrix)
        elif method == "hybrid":
            scores = _hybrid_scores(seed_vec, candidate_matrix, candidates["intimacy_score"].values, alpha)
        else:
            raise ValueError(f"Unknown method: {method}")

        top_indices = np.argsort(scores)[::-1][:top_k]

        results = []
        for rank, idx in enumerate(top_indices, start=1):
            row = candidates.iloc[idx]
            results.append({
                "rank": rank,
                "track_id": row["track_id"],
                "track_name": row["track_name"],
                "artist_name": row["artist_name"],
                "similarity_score": float(scores[idx]),
                "intimacy_score": float(row["intimacy_score"]),
                "valence": float(row["valence_norm"]),
                "energy": float(row["energy_norm"]),
                "danceability": float(row["danceability_norm"]),
                "acousticness": float(row["acousticness_norm"]),
                "quadrant": row["quadrant"],
                "genre": str(row.get("genre", "unknown")),
            })
        return results


# ── Recommendation methods ────────────────────────────────────────────────────

def _cosine_scores(seed_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Method A: plain cosine similarity."""
    sims = cosine_similarity(seed_vec, matrix)[0]
    return sims


def _knn_scores(seed_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Method B: KNN with cosine metric; returns 1 - distance as score."""
    k = min(len(matrix), 51)
    nbrs = NearestNeighbors(n_neighbors=k, metric="cosine", algorithm="brute")
    nbrs.fit(matrix)
    distances, indices = nbrs.kneighbors(seed_vec)

    scores = np.zeros(len(matrix))
    for dist, idx in zip(distances[0], indices[0]):
        scores[idx] = 1.0 - dist
    return scores


def _hybrid_scores(
    seed_vec: np.ndarray,
    matrix: np.ndarray,
    intimacy: np.ndarray,
    alpha: float,
) -> np.ndarray:
    """Method C: alpha * cosine + (1 - alpha) * normalised intimacy."""
    cos = cosine_similarity(seed_vec, matrix)[0]

    intimacy_min, intimacy_max = intimacy.min(), intimacy.max()
    if intimacy_max > intimacy_min:
        intimacy_norm = (intimacy - intimacy_min) / (intimacy_max - intimacy_min)
    else:
        intimacy_norm = np.zeros_like(intimacy)

    return alpha * cos + (1.0 - alpha) * intimacy_norm


# ── Quadrant helper ────────────────────────────────────────────────────────────

def assign_quadrant(valence: float, energy: float) -> str:
    """
    Map (valence, energy) to a Russell circumplex quadrant.

    Assumes values are normalised to [0, 1] where 0.5 is the midpoint.

    Q1: high valence, high energy   — Happy / Excited
    Q2: low valence,  high energy   — Angry / Tense
    Q3: low valence,  low energy    — Sad / Melancholic
    Q4: high valence, low energy    — Tender / Warm / Intimate
    """
    high_v = valence >= 0.5
    high_e = energy >= 0.5

    if high_v and high_e:
        return "Q1"
    if not high_v and high_e:
        return "Q2"
    if not high_v and not high_e:
        return "Q3"
    return "Q4"


# ── Singleton ─────────────────────────────────────────────────────────────────

recommender = BubbleRecommender()
