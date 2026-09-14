"""
Core recommendation pipeline for Bubble (Iteration 2).

Pipeline stages:
  1. Load and validate the Spotify CSV dataset.
  2. Feature selection and MinMax normalisation.
  3. Compute custom intimacy_score per track.
  4. Assign Russell quadrant (valence x energy plane) using fixed 0.5 thresholds.
  5. Expose recommendation methods:
       A) Weighted cosine similarity (with configurable feature-weight profiles)
       B) KNN via scikit-learn NearestNeighbors
       C) Hybrid (weighted cosine + intimacy blend)
  6. Optional destination-mode soft scoring (calm-positive preference).
  7. Optional MMR (Maximum Marginal Relevance) reranking for diversity.

Affect labels (Q1-Q4) are heuristic categories derived from Spotify valence and
energy.  They are a feature-engineering framework, NOT ground-truth emotional
labels.  Valence and energy do not perfectly determine human emotional experience.
Q4 is described as a "calm-positive destination region" / "candidate region",
not a proven intimacy or emotion label.
"""

import logging
import os
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

# -- Constants -----------------------------------------------------------------

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

# -- Feature-weight profiles ---------------------------------------------------

# Default: all weights 1.0 — reproduces iteration-1 unweighted cosine as baseline.
DEFAULT_WEIGHTS: dict[str, float] = {col: 1.0 for col in FEATURE_COLS}

FEATURE_WEIGHT_PROFILES: dict[str, dict[str, float]] = {
    # Profile 1: all weights equal — iteration-1 baseline.
    "equal": {col: 1.0 for col in FEATURE_COLS},
    # Profile 2: danceability removed (weight 0) — tests whether danceability
    # contributes to relationship-context relevance.
    "no_danceability": {**{col: 1.0 for col in FEATURE_COLS}, "danceability": 0.0},
    # Profile 3: affect emphasis — higher weights for valence and energy (the
    # two features most tied to Russell's circumplex), moderate weights for
    # acousticness and speechiness (instrumental/organic character), and lower
    # weights for less theoretically justified features.
    "affect_emphasis": {
        "valence": 2.0,
        "energy": 2.0,
        "danceability": 0.5,
        "acousticness": 1.5,
        "instrumentalness": 0.5,
        "speechiness": 1.5,
        "liveness": 0.3,
        "tempo": 0.5,
        "loudness": 0.5,
    },
}

VALID_PROFILES = list(FEATURE_WEIGHT_PROFILES.keys())

# Destination-mode defaults
DESTINATION_WEIGHT_DEFAULT = 0.3

# MMR defaults
MMR_LAMBDA_DEFAULT = 0.75


# -- Data loading & preprocessing ---------------------------------------------

class BubbleRecommender:
    """Holds the preprocessed dataset and exposes recommendation methods."""

    def __init__(self) -> None:
        self.df: pd.DataFrame = pd.DataFrame()
        self.feature_matrix: np.ndarray = np.empty((0, len(FEATURE_COLS)))
        self._knn: Optional[NearestNeighbors] = None
        self._loaded = False

    # -- Loading ----------------------------------------------------------------

    def load(self, path: str = DATASET_PATH) -> None:
        """Load CSV, validate columns, normalise features, compute derived columns."""
        logger.info("Loading dataset from %s", path)
        raw = pd.read_csv(path)

        raw = raw.rename(columns={
            "artists": "artist_name",
            "track_genre": "genre",
        })
        if "track_id" not in raw.columns and "Unnamed: 0" in raw.columns:
            raw = raw.rename(columns={"Unnamed: 0": "track_id"})

        missing = [c for c in REQUIRED_COLS if c not in raw.columns]
        if missing:
            raise ValueError(f"Dataset missing required columns: {missing}")

        df = raw.copy()
        df = df.dropna(subset=REQUIRED_COLS)
        df = df.drop_duplicates(subset=["track_id"])
        df = df.reset_index(drop=True)

        if "genre" not in df.columns:
            df["genre"] = "unknown"
        if "popularity" not in df.columns:
            df["popularity"] = 0

        # Normalise feature columns to [0, 1]
        scaler = MinMaxScaler()
        normed = scaler.fit_transform(df[FEATURE_COLS].values.astype(float))
        for i, col in enumerate(FEATURE_COLS):
            df[f"{col}_norm"] = normed[:, i]

        # Intimacy score: warmth proxy using normalised values.
        # This is a heuristic content feature, not a ground-truth emotional label.
        df["intimacy_score"] = (
            df["valence_norm"]
            * (1 - df["energy_norm"])
            * df["acousticness_norm"]
            * (1 - df["speechiness_norm"])
        )

        # Assign Russell quadrant using fixed 0.5 thresholds on normalised
        # valence and energy.  These thresholds are consistent across the
        # backend and the notebook.
        df["quadrant"] = df.apply(
            lambda r: assign_quadrant(r["valence_norm"], r["energy_norm"]), axis=1
        )

        self.df = df
        self.feature_matrix = normed
        self._knn = None
        self._loaded = True
        logger.info("Dataset loaded: %d tracks", len(df))

    def load_from_df(self, df: pd.DataFrame, feature_matrix: np.ndarray) -> None:
        """Load from an already-preprocessed DataFrame and matrix (for tests)."""
        self.df = df.reset_index(drop=True)
        self.feature_matrix = np.asarray(feature_matrix, dtype=float)
        self._knn = None
        self._loaded = True

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            raise RuntimeError("Recommender not loaded. Call load() first.")

    # -- Public helpers ---------------------------------------------------------

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

    # -- Recommendation entry point ---------------------------------------------

    def recommend(
        self,
        seed_track_id: str,
        top_k: int = 10,
        method: str = "cosine",
        alpha: float = 0.7,
        feature_weight_profile: str = "equal",
        custom_weights: Optional[dict[str, float]] = None,
        destination_mode: str = "none",
        destination_weight: float = DESTINATION_WEIGHT_DEFAULT,
        apply_mmr: bool = False,
        mmr_lambda: float = MMR_LAMBDA_DEFAULT,
        emotional_filter: Optional[str] = None,  # deprecated, kept for backward compat
    ) -> dict:
        """
        Return top_k recommendations for seed_track_id.

        Parameters
        ----------
        seed_track_id : str
        top_k : int
        method : str -- "cosine" | "knn" | "hybrid"
        alpha : float in [0, 1] -- hybrid blend weight (1=pure cosine, 0=pure intimacy)
        feature_weight_profile : str -- one of "equal", "no_danceability", "affect_emphasis"
        custom_weights : dict | None -- override weights; validated against FEATURE_COLS
        destination_mode : str -- "none" | "calm_positive"
            "none": pure seed-based ranking.
            "calm_positive": soft scoring bonus for high-valence, low-energy tracks.
            Replaces the deprecated emotional_filter hard candidate restriction.
        destination_weight : float in [0, 1] -- blend weight for destination score
        apply_mmr : bool -- if True, rerank candidates with MMR for diversity
        mmr_lambda : float in [0, 1] -- 1.0 = no diversity penalty
        emotional_filter : str | None -- DEPRECATED. Hard Q-filter on candidate pool.
            Retained for backward compatibility; prefer destination_mode.

        Returns
        -------
        dict with keys:
            "recommendations" : list[dict]
            "metadata" : dict (profile, alpha, destination_mode, mmr settings, method)
        """
        self._ensure_loaded()

        seed_row = self.get_track_by_id(seed_track_id)
        if seed_row is None:
            raise ValueError(f"Track ID not found: {seed_track_id}")

        # Resolve and validate feature weights
        weights = _resolve_weights(feature_weight_profile, custom_weights)

        seed_idx = self.df.index[self.df["track_id"] == seed_track_id][0]
        seed_vec = self.feature_matrix[seed_idx].reshape(1, -1)

        # Candidate pool (optionally restricted by deprecated emotional_filter)
        candidates = self.df.copy()
        candidate_mask = np.ones(len(self.df), dtype=bool)

        if emotional_filter:
            mask = (candidates["quadrant"] == emotional_filter).values
            candidate_mask &= mask

        # Always exclude seed
        candidate_mask &= (self.df["track_id"] != seed_track_id).values

        candidates = self.df[candidate_mask].reset_index(drop=True)
        candidate_matrix = self.feature_matrix[candidate_mask]

        if len(candidates) == 0:
            return {"recommendations": [], "metadata": _build_metadata(
                method, alpha, feature_weight_profile, weights,
                destination_mode, destination_weight, apply_mmr, mmr_lambda,
            )}

        # Compute primary relevance scores
        if method == "cosine":
            scores = _weighted_cosine_scores(seed_vec, candidate_matrix, weights)
        elif method == "knn":
            scores = _knn_scores(seed_vec, candidate_matrix)
        elif method == "hybrid":
            scores = _hybrid_scores(
                seed_vec, candidate_matrix,
                candidates["intimacy_score"].values, alpha, weights,
            )
        else:
            raise ValueError(f"Unknown method: {method}")

        # Apply destination-mode soft bonus
        if destination_mode == "calm_positive":
            dest_scores = _destination_scores(
                candidates["valence_norm"].values,
                candidates["energy_norm"].values,
            )
            # Normalise destination scores to [0, 1] before blending
            d_min, d_max = dest_scores.min(), dest_scores.max()
            if d_max > d_min:
                dest_norm = (dest_scores - d_min) / (d_max - d_min)
            else:
                dest_norm = np.zeros_like(dest_scores)
            scores = (1.0 - destination_weight) * scores + destination_weight * dest_norm

        # MMR reranking or simple top-k
        if apply_mmr:
            top_indices = _mmr_rerank(
                scores, candidate_matrix, weights, top_k, mmr_lambda,
            )
        else:
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
                "instrumentalness": float(row["instrumentalness_norm"]),
                "speechiness": float(row["speechiness_norm"]),
                "liveness": float(row["liveness_norm"]),
                "tempo": float(row["tempo_norm"]),
                "loudness": float(row["loudness_norm"]),
                "quadrant": row["quadrant"],
                "genre": str(row.get("genre", "unknown")),
            })

        metadata = _build_metadata(
            method, alpha, feature_weight_profile, weights,
            destination_mode, destination_weight, apply_mmr, mmr_lambda,
        )

        return {"recommendations": results, "metadata": metadata}


# -- Weight validation ---------------------------------------------------------

def _resolve_weights(
    profile: str,
    custom_weights: Optional[dict[str, float]],
) -> dict[str, float]:
    """Resolve and validate feature weights from a profile or custom dict."""
    if custom_weights is not None:
        weights = custom_weights
    elif profile in FEATURE_WEIGHT_PROFILES:
        weights = FEATURE_WEIGHT_PROFILES[profile]
    else:
        raise ValueError(
            f"Unknown feature_weight_profile: {profile!r}. "
            f"Valid options: {VALID_PROFILES}"
        )

    validate_weights(weights)
    return weights


def validate_weights(weights: dict[str, float]) -> None:
    """Validate a feature-weight dictionary.

    Raises ValueError if:
      - Any key is not a known feature name.
      - Any value is not a non-negative number.
      - All values are zero (no positive weight).
    """
    if not isinstance(weights, dict):
        raise ValueError("Feature weights must be a dictionary.")

    for key, val in weights.items():
        if key not in FEATURE_COLS:
            raise ValueError(
                f"Unknown feature name in weights: {key!r}. "
                f"Valid features: {FEATURE_COLS}"
            )
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            raise ValueError(
                f"Weight for {key!r} must be a number, got {type(val).__name__}."
            )
        if val < 0:
            raise ValueError(f"Weight for {key!r} must be non-negative, got {val}.")
        if not np.isfinite(val):
            raise ValueError(f"Weight for {key!r} must be finite, got {val}.")

    if not any(v > 0 for v in weights.values()):
        raise ValueError("At least one feature weight must be positive.")


def _weight_sqrt_vector(weights: dict[str, float]) -> np.ndarray:
    """Return sqrt(weight) for each feature in FEATURE_COLS order."""
    return np.array([np.sqrt(weights.get(col, 0.0)) for col in FEATURE_COLS])


# -- Recommendation methods ----------------------------------------------------

def _weighted_cosine_scores(
    seed_vec: np.ndarray,
    matrix: np.ndarray,
    weights: dict[str, float],
) -> np.ndarray:
    """Weighted cosine similarity.

    Multiplies both the seed and every candidate vector by sqrt(weight) before
    computing cosine similarity.  This preserves the intended weighted
    dot-product geometry: features with higher weights contribute more to the
    similarity score.
    """
    w = _weight_sqrt_vector(weights)
    return cosine_similarity(seed_vec * w, matrix * w)[0]


def _cosine_scores(seed_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Unweighted cosine similarity (iteration-1 baseline)."""
    return cosine_similarity(seed_vec, matrix)[0]


def _knn_scores(seed_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """KNN with cosine metric; returns 1 - distance as score."""
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
    weights: Optional[dict[str, float]] = None,
) -> np.ndarray:
    """Hybrid: alpha * weighted_cosine + (1 - alpha) * normalised intimacy."""
    if weights is not None:
        cos = _weighted_cosine_scores(seed_vec, matrix, weights)
    else:
        cos = _cosine_scores(seed_vec, matrix)

    intimacy_min, intimacy_max = intimacy.min(), intimacy.max()
    if intimacy_max > intimacy_min:
        intimacy_norm = (intimacy - intimacy_min) / (intimacy_max - intimacy_min)
    else:
        intimacy_norm = np.zeros_like(intimacy)

    return alpha * cos + (1.0 - alpha) * intimacy_norm


def _destination_scores(
    valence_norm: np.ndarray,
    energy_norm: np.ndarray,
) -> np.ndarray:
    """Continuous calm-positive destination score.

    Rewards high valence and low energy continuously (no hard quadrant cutoff).
    Returns values in [0, 1]: valence * (1 - energy).
    """
    return valence_norm * (1.0 - energy_norm)


# -- MMR reranking -------------------------------------------------------------

def _mmr_rerank(
    relevance_scores: np.ndarray,
    candidate_matrix: np.ndarray,
    weights: dict[str, float],
    top_k: int,
    lam: float,
) -> list[int]:
    """
    Maximum Marginal Relevance reranking.

    Selects items greedily:
      MMR(c) = lambda * relevance(c) - (1 - lambda) * max_sim(c, selected)

    Candidate-candidate similarity uses the same weighted feature representation
    as the selected profile.

    Returns a list of indices into the candidate array.
    """
    pool_size = max(50, top_k * 5)
    pool_size = min(pool_size, len(relevance_scores))

    # Pre-select a larger candidate pool by relevance
    pool_indices = np.argsort(relevance_scores)[::-1][:pool_size]

    w = _weight_sqrt_vector(weights)
    weighted_matrix = candidate_matrix[pool_indices] * w

    # Normalise relevance to [0, 1] for comparable MMR scale
    rel = relevance_scores[pool_indices]
    r_min, r_max = rel.min(), rel.max()
    if r_max > r_min:
        rel_norm = (rel - r_min) / (r_max - r_min)
    else:
        rel_norm = np.zeros_like(rel)

    selected: list[int] = []
    remaining = list(range(len(pool_indices)))

    while len(selected) < top_k and remaining:
        best_idx = None
        best_score = -np.inf

        for cand in remaining:
            if not selected:
                max_sim = 0.0
            else:
                sims = cosine_similarity(
                    weighted_matrix[cand].reshape(1, -1),
                    weighted_matrix[selected],
                )[0]
                max_sim = float(np.max(sims))

            mmr_score = lam * rel_norm[cand] - (1.0 - lam) * max_sim
            if mmr_score > best_score:
                best_score = mmr_score
                best_idx = cand

        selected.append(best_idx)
        remaining.remove(best_idx)

    return [pool_indices[i] for i in selected]


# -- Metadata helper -----------------------------------------------------------

def _build_metadata(
    method: str,
    alpha: float,
    profile: str,
    weights: dict[str, float],
    destination_mode: str,
    destination_weight: float,
    apply_mmr: bool,
    mmr_lambda: float,
) -> dict:
    return {
        "method": method,
        "alpha": alpha,
        "feature_weight_profile": profile,
        "feature_weights": dict(weights),
        "destination_mode": destination_mode,
        "destination_weight": destination_weight,
        "apply_mmr": apply_mmr,
        "mmr_lambda": mmr_lambda,
    }


# -- Quadrant helper -----------------------------------------------------------

def assign_quadrant(valence: float, energy: float) -> str:
    """
    Map (valence, energy) to a Russell circumplex quadrant.

    Uses fixed 0.5 thresholds on normalised values.  These thresholds are
    consistent across the backend and the notebook.

    Quadrants are heuristic candidate regions, not proven emotional labels:
      Q1: high valence, high energy  -- high-arousal positive region
      Q2: low valence,  high energy  -- high-arousal negative region
      Q3: low valence,  low energy   -- low-arousal negative region
      Q4: high valence, low energy   -- calm-positive destination region
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


# -- Singleton -----------------------------------------------------------------

recommender = BubbleRecommender()
