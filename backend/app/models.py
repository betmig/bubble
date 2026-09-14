from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RecommendMethod(str, Enum):
    cosine = "cosine"
    knn = "knn"
    hybrid = "hybrid"


class FeatureWeightProfile(str, Enum):
    equal = "equal"
    no_danceability = "no_danceability"
    affect_emphasis = "affect_emphasis"


class DestinationMode(str, Enum):
    none = "none"
    calm_positive = "calm_positive"


class RecommendRequest(BaseModel):
    seed_track_id: str
    top_k: int = Field(default=10, ge=1, le=50)
    method: RecommendMethod = RecommendMethod.cosine
    alpha: float = Field(default=0.7, ge=0.0, le=1.0)
    feature_weight_profile: FeatureWeightProfile = FeatureWeightProfile.equal
    custom_weights: Optional[dict[str, float]] = None
    destination_mode: DestinationMode = DestinationMode.none
    destination_weight: float = Field(default=0.3, ge=0.0, le=1.0)
    apply_mmr: bool = False
    mmr_lambda: float = Field(default=0.75, ge=0.0, le=1.0)
    # Deprecated — prefer destination_mode
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
    instrumentalness: float
    speechiness: float
    liveness: float
    tempo: float
    loudness: float
    quadrant: str
    genre: str


class RecommendationMetadata(BaseModel):
    method: str
    alpha: float
    feature_weight_profile: str
    feature_weights: dict[str, float]
    destination_mode: str
    destination_weight: float
    apply_mmr: bool
    mmr_lambda: float


class EvaluationOut(BaseModel):
    precision_at_k: float
    single_list_coverage: float
    intra_list_diversity: float


class RecommendResponse(BaseModel):
    seed_track: SeedTrackOut
    recommendations: list[RecommendedTrackOut]
    method_used: str
    metadata: RecommendationMetadata
    evaluation: EvaluationOut


class TrackSearchResult(BaseModel):
    id: str
    name: str
    artist: str


class EvaluationResponse(BaseModel):
    precision_at_k: float
    single_list_coverage: float
    catalogue_coverage: float
    intra_list_diversity: float
    seed_track_id: str
    k: int


class HealthResponse(BaseModel):
    status: str
    tracks_loaded: int


# -- Batch evaluation models ---------------------------------------------------

class BatchEvaluateRequest(BaseModel):
    n_seeds: int = Field(default=100, ge=1, le=10000)
    k: int = Field(default=10, ge=1, le=50)
    random_state: int = Field(default=42)
    method: RecommendMethod = RecommendMethod.cosine
    alpha: float = Field(default=0.7, ge=0.0, le=1.0)
    feature_weight_profile: FeatureWeightProfile = FeatureWeightProfile.equal
    destination_mode: DestinationMode = DestinationMode.none
    destination_weight: float = Field(default=0.3, ge=0.0, le=1.0)
    apply_mmr: bool = False
    mmr_lambda: float = Field(default=0.75, ge=0.0, le=1.0)


class BatchEvaluateResponse(BaseModel):
    config_name: str
    method: str
    alpha: float
    feature_weight_profile: str
    destination_mode: str
    destination_weight: float
    apply_mmr: bool
    mmr_lambda: float
    k: int
    n_seeds_evaluated: int
    precision_at_k_mean: float
    precision_at_k_std: float
    intra_list_diversity_mean: float
    intra_list_diversity_std: float
    catalogue_coverage: float


class BatchCompareRequest(BaseModel):
    n_seeds: int = Field(default=100, ge=1, le=10000)
    k: int = Field(default=10, ge=1, le=50)
    random_state: int = Field(default=42)


class BatchCompareRow(BaseModel):
    config_name: str
    method: str
    alpha: float
    feature_weight_profile: str
    destination_mode: str
    destination_weight: float
    apply_mmr: bool
    mmr_lambda: float
    k: int
    n_seeds_evaluated: int
    precision_at_k_mean: float
    precision_at_k_std: float
    intra_list_diversity_mean: float
    intra_list_diversity_std: float
    catalogue_coverage: float


class BatchCompareResponse(BaseModel):
    results: list[BatchCompareRow]
