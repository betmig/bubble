from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RecommendMethod(str, Enum):
    cosine = "cosine"
    knn = "knn"
    hybrid = "hybrid"


class RecommendRequest(BaseModel):
    seed_track_id: str
    top_k: int = Field(default=10, ge=1, le=50)
    method: RecommendMethod = RecommendMethod.cosine
    alpha: float = Field(default=0.7, ge=0.0, le=1.0)
    emotional_filter: Optional[str] = None


class AudioFeaturesOut(BaseModel):
    valence: float
    energy: float
    danceability: float
    acousticness: float
    instrumentalness: float
    speechiness: float
    liveness: float
    tempo: float
    loudness: float
    intimacy_score: float
    quadrant: str


class SeedTrackOut(BaseModel):
    id: str
    name: str
    artist: str
    features: AudioFeaturesOut


class RecommendedTrackOut(BaseModel):
    rank: int
    track_id: str
    track_name: str
    artist_name: str
    similarity_score: float
    intimacy_score: float
    valence: float
    energy: float
    danceability: float
    acousticness: float
    quadrant: str
    genre: str


class EvaluationOut(BaseModel):
    precision_at_k: float
    intra_list_diversity: float


class RecommendResponse(BaseModel):
    seed_track: SeedTrackOut
    recommendations: list[RecommendedTrackOut]
    method_used: str
    evaluation: EvaluationOut


class TrackSearchResult(BaseModel):
    id: str
    name: str
    artist: str


class EvaluationResponse(BaseModel):
    precision_at_k: float
    coverage: float
    intra_list_diversity: float
    seed_track_id: str
    k: int


class HealthResponse(BaseModel):
    status: str
    tracks_loaded: int
