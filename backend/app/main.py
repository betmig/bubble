"""
Bubble FastAPI application.

Endpoints
---------
GET  /health                       – liveness + dataset info
GET  /tracks/search?q=             – fuzzy track search
GET  /tracks/{track_id}/features   – audio features + quadrant + intimacy
POST /recommend                    – main recommendation endpoint
GET  /evaluate?seed_id=&k=         – offline evaluation metrics
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .evaluation import evaluate_single
from .models import (
    AudioFeaturesOut,
    EvaluationResponse,
    HealthResponse,
    RecommendRequest,
    RecommendResponse,
    RecommendedTrackOut,
    SeedTrackOut,
    TrackSearchResult,
)
from .recommender import DATASET_PATH, recommender

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
    description="Relationship-context music discovery engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health():
    return HealthResponse(status="ok", tracks_loaded=recommender.track_count)


# ── Track search ───────────────────────────────────────────────────────────────

@app.get("/tracks/search", response_model=list[TrackSearchResult], tags=["tracks"])
def search_tracks(q: str = Query(..., min_length=1)):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")
    results = recommender.search_tracks(q, limit=15)
    return [TrackSearchResult(**r) for r in results]


# ── Track features ─────────────────────────────────────────────────────────────

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


# ── Recommend ──────────────────────────────────────────────────────────────────

@app.post("/recommend", response_model=RecommendResponse, tags=["recommend"])
def recommend(req: RecommendRequest):
    if not recommender._loaded:
        raise HTTPException(503, "Dataset not loaded")

    seed_row = recommender.get_track_by_id(req.seed_track_id)
    if seed_row is None:
        raise HTTPException(404, f"Track {req.seed_track_id!r} not found")

    try:
        recs = recommender.recommend(
            seed_track_id=req.seed_track_id,
            top_k=req.top_k,
            method=req.method.value,
            alpha=req.alpha,
            emotional_filter=req.emotional_filter,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

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
        evaluation=eval_metrics,
    )


# ── Evaluate ───────────────────────────────────────────────────────────────────

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

    recs = recommender.recommend(seed_track_id=seed_id, top_k=k, method="hybrid")
    seed_genre = str(seed_row.get("genre", "unknown"))
    metrics = evaluate_single(recs, seed_genre, k, recommender.track_count)

    return EvaluationResponse(
        precision_at_k=metrics["precision_at_k"],
        coverage=metrics["coverage"],
        intra_list_diversity=metrics["intra_list_diversity"],
        seed_track_id=seed_id,
        k=k,
    )
