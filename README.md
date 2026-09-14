# Bubble

> Relationship-context music discovery engine.
> *Find songs for your people.*

Bubble is a **CM3005 Data Science** project. Enter a song you associate with someone you care about and Bubble recommends tracks with a similar emotional fingerprint — anchored in Russell's valence-arousal model.

**Iteration 2** adds configurable weighted cosine similarity, destination mode (soft calm-positive preference), MMR reranking for diversity, and batch evaluation across 100 seeds.

---

## Architecture

```
bubble/
├── backend/               # Python FastAPI — data science pipeline
│   ├── app/
│   │   ├── main.py        # FastAPI entry point + REST endpoints
│   │   ├── recommender.py # Feature engineering + recommendation methods + MMR
│   │   ├── models.py      # Pydantic request/response schemas
│   │   └── evaluation.py  # Precision@K, diversity, batch evaluation, coverage
│   ├── tests/             # pytest test suite (synthetic fixtures)
│   ├── data/              # Place spotify_tracks.csv here
│   ├── notebooks/         # Jupyter EDA + model development
│   ├── requirements.txt
│   └── Dockerfile
├── src/                   # React + Vite + TS + Tailwind frontend
├── nginx/
│   ├── nginx.conf         # Reverse proxy (prod)
│   └── frontend.conf      # SPA serving config
├── Dockerfile.frontend    # Multi-stage React build
├── docker-compose.yml     # Production (VPS)
└── docker-compose.dev.yml # Local development
```

---

## Dataset

Download a Spotify tracks CSV from Kaggle and place it at:

```
backend/data/spotify_tracks.csv
```

Required columns:
```
track_id, track_name, artist_name, genre,
valence, energy, danceability, acousticness,
instrumentalness, speechiness, liveness, tempo, loudness
```

---

## Local development

```bash
# Start both services with hot-reload
docker compose -f docker-compose.dev.yml up --build

# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# API docs:    http://localhost:8000/docs
```

### Running tests

```bash
cd backend
python -m pytest tests/ -v
```

Tests use a synthetic dataset fixture — no Kaggle download required.

---

## Data science pipeline

The recommendation engine lives in `backend/app/recommender.py`.

### Features

Nine Spotify audio features, all normalised to [0, 1] via `MinMaxScaler`:
`valence`, `energy`, `danceability`, `acousticness`, `instrumentalness`,
`speechiness`, `liveness`, `tempo`, `loudness`.

### Intimacy score

```
intimacy = valence_n * (1 - energy_n) * acousticness_n * (1 - speechiness_n)
```

A heuristic warmth proxy. Not a ground-truth emotional label.

### Quadrant mapping (Russell's circumplex)

Uses **fixed 0.5 thresholds** on normalised valence and energy, consistent
across backend and notebook. Quadrants are **heuristic candidate regions**,
not proven emotional labels:

| | High energy | Low energy |
|---|---|---|
| **High valence** | Q1 High-arousal positive | Q4 Calm-positive destination region |
| **Low valence** | Q2 High-arousal negative | Q3 Low-arousal negative |

### Feature-weight profiles (Iteration 2)

| Profile | Description |
|---|---|
| `equal` | All weights 1.0 — iteration-1 baseline |
| `no_danceability` | Danceability weight 0.0, all others 1.0 — ablation |
| `affect_emphasis` | Valence 2.0, energy 2.0, acousticness 1.5, speechiness 1.5, danceability 0.5, instrumentalness 0.5, tempo 0.5, loudness 0.5, liveness 0.3 |

Weighted cosine multiplies both seed and candidate vectors by sqrt(weight)
before computing cosine similarity.

### Recommendation methods

| Method | Description |
|---|---|
| `cosine` | Weighted cosine similarity on normalised feature vectors |
| `knn` | scikit-learn `NearestNeighbors(metric='cosine')` |
| `hybrid` | `alpha * weighted_cosine + (1-alpha) * intimacy_norm` |

### Destination mode (Iteration 2)

Replaces the deprecated `emotional_filter` hard candidate restriction.

| Mode | Description |
|---|---|
| `none` | Pure seed-based ranking (default) |
| `calm_positive` | Soft scoring bonus for high-valence, low-energy tracks |

Destination score = `valence_norm * (1 - energy_norm)`, blended with the
primary score using `destination_weight` (default 0.3).

### MMR reranking (Iteration 2)

Maximum Marginal Relevance reranking for diversity:

```
MMR(candidate) = lambda * relevance - (1 - lambda) * max_sim(candidate, selected)
```

- `apply_mmr`: boolean, default false
- `mmr_lambda`: float in [0, 1], default 0.75 (1.0 = no diversity penalty)
- Candidate pool: max(50, top_k * 5)

---

## Evaluation metrics

| Metric | Description |
|---|---|
| Precision@K | Fraction of top-K sharing the seed's genre (offline proxy, not ground-truth) |
| Intra-list diversity | Average pairwise cosine distance within list (all 9 features) |
| Catalogue coverage | Unique recommended tracks across many seeds / total catalogue |
| Single-list coverage | Unique tracks in one list / total catalogue (renamed from iteration-1 'coverage') |

### Batch evaluation

```bash
# Single configuration
curl -X POST http://localhost:8000/evaluate/batch \
  -H "Content-Type: application/json" \
  -d '{"n_seeds": 100, "k": 10, "method": "hybrid", "feature_weight_profile": "affect_emphasis"}'

# Compare all four required configurations
curl -X POST http://localhost:8000/evaluate/compare \
  -H "Content-Type: application/json" \
  -d '{"n_seeds": 100, "k": 10}'
```

---

## API reference

Full interactive docs at `http://localhost:8000/docs`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/tracks/search?q=` | Fuzzy track search |
| GET | `/tracks/{id}/features` | Audio features + quadrant |
| POST | `/recommend` | Get recommendations (with weight profiles, destination mode, MMR) |
| GET | `/evaluate?seed_id=&k=` | Single-seed evaluation metrics |
| POST | `/evaluate/batch` | Batch evaluation for one configuration |
| POST | `/evaluate/compare` | Compare four required configurations |

### POST /recommend parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `seed_track_id` | string | required | Seed track ID |
| `top_k` | int | 10 | Number of results (1-50) |
| `method` | string | "cosine" | "cosine", "knn", or "hybrid" |
| `alpha` | float | 0.7 | Hybrid blend weight [0, 1] |
| `feature_weight_profile` | string | "equal" | "equal", "no_danceability", or "affect_emphasis" |
| `custom_weights` | dict | null | Override weights (validated) |
| `destination_mode` | string | "none" | "none" or "calm_positive" |
| `destination_weight` | float | 0.3 | Destination blend weight [0, 1] |
| `apply_mmr` | bool | false | Enable MMR diversity reranking |
| `mmr_lambda` | float | 0.75 | MMR relevance/diversity trade-off [0, 1] |
| `emotional_filter` | string | null | **Deprecated** — use destination_mode |

---

## Iteration 2

See `CHANGELOG_ITERATION2.md` for a full summary of changes, test results,
and evaluation output locations.
