"""
Bubble FastAPI application (Iteration 2.1).

Endpoints
---------
GET  /health                       – liveness + dataset info
GET  /tracks/search?q=             – intelligent track search (tiered + fuzzy)
GET  /tracks/{track_id}/features   – audio features + quadrant + intimacy
POST /recommend                    – main recommendation endpoint
GET  /evaluate?seed_id=&k=         – offline evaluation metrics for a single seed
POST /evaluate/batch               – batch evaluation for one configuration
POST /evaluate/compare             – compare required configurations
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .evaluation import (
    evaluate_batch,
    evaluate_single,
    compare_configurations,
    catalogue_coverage,
    precision_at_k,
    intra_list_diversity,
)
from .models import (
    AudioFeaturesOut,
    BatchCompareRequest,
    BatchCompareResponse,
    BatchCompareRow,
    BatchEvaluateRequest,
    BatchEvaluateResponse,
    EvaluationOut,
    EvaluationResponse,
    HealthResponse,
    RecommendRequest,
    RecommendResponse,
    RecommendedTrackOut,
    RecommendationMetadata,
    SeedTrackOut,
    TrackSearchResult,
)
from .recommender import DATASET_PATH, recommender, validate_weights

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    path = os.getenv("DATASET_PATH", DATASET_PATH)
    try:
        recommender.load(path)
        logger.info("Recommender ready with %d tracks", recommender.track_count)
    except Exception as exc:
        logger.warning("Could not load dataset: %s — running in stub mode", exc)
    yield


app = FastAPI(
    title="Bubble API",
    description=(
        "Relationship-context music discovery engine.\n\n"
        "Iteration 2.1 adds similarity-first candidate pool safeguard, balanced "
        "hybrid preset, RapidFuzz-backed intelligent search, and dual UI mode "
        "support.\n\n"
        "Affect labels (Q1-Q4) are heuristic candidate regions derived from "
        "Spotify valence and energy, not ground-truth emotional labels."
    ),
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Health ---------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health():
    return HealthResponse(status="ok", tracks_loaded=recommender.track_count)


# -- Track search --------------------------------------------------------------

@app.get("/tracks/search", response_model=list[TrackSearchResult], tags=["tracks"])
def search_tracks(q: str = Query(..., min_length=1)):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")
    results = recommender.search_tracks(q, limit=15)
    return [TrackSearchResult(**r) for r in results]


# -- Track features -------------------------------------------------------------

@app.get("/tracks/{track_id}/features", response_model=AudioFeaturesOut, tags=["tracks"])
def get_track_features(track_id: str):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")
    row = recommender.get_track_by_id(track_id)
    if row is None:
        raise HTTPException(404, f"Track {track_id!r} not found")
    return AudioFeaturesOut(
        valence=float(row["valence_norm"]),
        energy=float(row["energy_norm"]),
        danceability=float(row["danceability_norm"]),
        acousticness=float(row["acousticness_norm"]),
        instrumentalness=float(row["instrumentalness_norm"]),
        speechiness=float(row["speechiness_norm"]),
        liveness=float(row["liveness_norm"]),
        tempo=float(row["tempo_norm"]),
        loudness=float(row["loudness_norm"]),
        intimacy_score=float(row["intimacy_score"]),
        quadrant=str(row["quadrant"]),
    )


# -- Recommend ------------------------------------------------------------------

@app.post("/recommend", response_model=RecommendResponse, tags=["recommend"])
def recommend(req: RecommendRequest):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")

    seed_row = recommender.get_track_by_id(req.seed_track_id)
    if seed_row is None:
        raise HTTPException(404, f"Track {req.seed_track_id!r} not found")

    if req.custom_weights is not None:
        try:
            validate_weights(req.custom_weights)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    try:
        result = recommender.recommend(
            seed_track_id=req.seed_track_id,
            top_k=req.top_k,
            method=req.method.value,
            alpha=req.alpha,
            feature_weight_profile=req.feature_weight_profile.value,
            custom_weights=req.custom_weights,
            destination_mode=req.destination_mode.value,
            destination_weight=req.destination_weight,
            apply_mmr=req.apply_mmr,
            mmr_lambda=req.mmr_lambda,
            candidate_pool_size=req.candidate_pool_size,
            emotional_filter=req.emotional_filter,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    recs = result["recommendations"]
    metadata = result["metadata"]

    seed_features = get_track_features(req.seed_track_id)
    seed_out = SeedTrackOut(
        id=seed_row["track_id"],
        name=seed_row["track_name"],
        artist=seed_row["artist_name"],
        features=seed_features,
    )

    seed_genre = str(seed_row.get("genre", "unknown"))
    eval_metrics = evaluate_single(recs, seed_genre, req.top_k, recommender.track_count)

    return RecommendResponse(
        seed_track=seed_out,
        recommendations=[RecommendedTrackOut(**r) for r in recs],
        method_used=req.method.value,
        metadata=RecommendationMetadata(**metadata),
        evaluation=EvaluationOut(**eval_metrics),
    )


# -- Evaluate (single seed) -----------------------------------------------------

@app.get("/evaluate", response_model=EvaluationResponse, tags=["evaluate"])
def evaluate(
    seed_id: str = Query(...),
    k: int = Query(default=10, ge=1, le=50),
):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")

    seed_row = recommender.get_track_by_id(seed_id)
    if seed_row is None:
        raise HTTPException(404, f"Track {seed_id!r} not found")

    recs = recommender.recommend(
        seed_track_id=seed_id, top_k=k, method="hybrid",
        alpha=0.90, feature_weight_profile="balanced",
    )
    rec_list = recs["recommendations"]
    seed_genre = str(seed_row.get("genre", "unknown"))
    metrics = evaluate_single(rec_list, seed_genre, k, recommender.track_count)

    return EvaluationResponse(
        precision_at_k=metrics["precision_at_k"],
        single_list_coverage=metrics["single_list_coverage"],
        catalogue_coverage=0.0,
        intra_list_diversity=metrics["intra_list_diversity"],
        seed_track_id=seed_id,
        k=k,
    )


# -- Batch evaluate (single configuration) --------------------------------------

@app.post("/evaluate/batch", response_model=BatchEvaluateResponse, tags=["evaluate"])
def evaluate_batch_endpoint(req: BatchEvaluateRequest):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")

    result = evaluate_batch(
        recommender,
        n_seeds=req.n_seeds,
        k=req.k,
        random_state=req.random_state,
        method=req.method.value,
        alpha=req.alpha,
        feature_weight_profile=req.feature_weight_profile.value,
        destination_mode=req.destination_mode.value,
        destination_weight=req.destination_weight,
        apply_mmr=req.apply_mmr,
        mmr_lambda=req.mmr_lambda,
        candidate_pool_size=req.candidate_pool_size,
    )

    return BatchEvaluateResponse(
        config_name=result["config_name"],
        method=result["method"],
        alpha=result["alpha"],
        feature_weight_profile=result["feature_weight_profile"],
        destination_mode=result["destination_mode"],
        destination_weight=result["destination_weight"],
        apply_mmr=result["apply_mmr"],
        mmr_lambda=result["mmr_lambda"],
        candidate_pool_size=result.get("candidate_pool_size"),
        k=result["k"],
        n_seeds_evaluated=result["n_seeds_evaluated"],
        precision_at_k_mean=result["precision_at_k_mean"],
        precision_at_k_std=result["precision_at_k_std"],
        intra_list_diversity_mean=result["intra_list_diversity_mean"],
        intra_list_diversity_std=result["intra_list_diversity_std"],
        catalogue_coverage=result["catalogue_coverage"],
    )


# -- Batch compare (required configurations) -------------------------------

@app.post("/evaluate/compare", response_model=BatchCompareResponse, tags=["evaluate"])
def evaluate_compare_endpoint(req: BatchCompareRequest):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")

    df = compare_configurations(
        recommender,
        n_seeds=req.n_seeds,
        k=req.k,
        random_state=req.random_state,
    )

    rows = [BatchCompareRow(**row) for row in df.to_dict(orient="records")]
    return BatchCompareResponse(results=rows)
