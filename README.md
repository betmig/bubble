# Bubble

> Relationship-context music discovery engine.
> *Find songs for your people.*

Bubble is a **CM3005 Data Science** project. Enter a song you associate with someone you care about and Bubble recommends tracks with a similar emotional fingerprint — anchored in Russell's valence-arousal model.

**Iteration 2.1** adds similarity-first relevance tuning, a balanced hybrid preset, RapidFuzz-backed intelligent search, and dual UI modes (Data Science + Listener), responding to formative feedback from a small exploratory study.

---

## Architecture

```
bubble/
├── backend/               # Python FastAPI — data science pipeline
│   ├── app/
│   │   ├── main.py        # FastAPI entry point + REST endpoints
│   │   ├── recommender.py # Feature engineering + recommendation methods + MMR + search
│   │   ├── models.py      # Pydantic request/response schemas
│   │   └── evaluation.py  # Precision@K, diversity, batch evaluation, coverage
│   ├── tests/             # pytest test suite (synthetic fixtures)
│   ├── data/              # Place spotify_tracks.csv here
│   ├── notebooks/         # Jupyter EDA + model development
│   ├── requirements.txt
│   └── Dockerfile
├── src/                   # React + Vite + TS + Tailwind frontend
│   ├── context/           # RecommendationContext — shared state + localStorage
│   ├── api/               # API client
│   ├── components/        # SearchBar, TrackCard, EmotionMap, FeatureRadar, Navbar
│   └── pages/             # Home, Results, Evaluation, About
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

### Running batch evaluation

```bash
# Single configuration
curl -X POST http://localhost:8000/evaluate/batch \
  -H "Content-Type: application/json" \
  -d '{"n_seeds": 100, "k": 10, "method": "hybrid", "feature_weight_profile": "balanced", "alpha": 0.85}'

# Compare all required configurations
curl -X POST http://localhost:8000/evaluate/compare \
  -H "Content-Type: application/json" \
  -d '{"n_seeds": 100, "k": 10}'
```

For Iteration 2.1 comparison configs, use `compare_iteration21()` in `evaluation.py`.

---

## Dual Interface Modes (Iteration 2.1)

Bubble supports two UI modes, toggleable from the navbar. The selected mode persists across navigation and browser refresh.

### Data Science mode (default)

The full advanced interface for exploring recommendation algorithms:

- Method choice (cosine, KNN, hybrid)
- Alpha slider for hybrid blending
- Feature-weight profiles (equal, no_danceability, affect_emphasis, balanced)
- Destination mode (none, calm-positive)
- MMR diversity reranking with lambda control
- Evaluation metrics (Precision@K, intra-list diversity, coverage)
- Emotion map (Russell's valence-arousal plane)
- Candidate pool size in metadata

### Listener mode

A simple, friendly interface for users with no data-science background:

1. Search for a song by title, artist, or both
2. Select one seed song
3. Choose a preference:
   - **Stay close to this song** — finds tracks that sound very similar (cosine, equal weights, no MMR)
   - **A little more variety** — some new discoveries while staying related (balanced hybrid, alpha=0.85, MMR on with lambda=0.90)
   - **Calm and warm suggestions** — gentle, warm tracks with a tender feel (balanced hybrid, alpha=0.85, calm-positive destination mode)
4. Click "Find songs for me"

No technical parameters, metrics, or mathematical terminology are shown in Listener mode. The exact backend configuration is stored internally and included in response metadata for reproducibility.

### Preserving results across mode switches

Switching between modes does not clear the selected seed, recommendation list, or metadata. No new backend request is triggered by switching modes. The same recommendations are rendered with different levels of detail. The latest session is persisted in localStorage and restored on refresh.

---

## Intelligent Seed Search (Iteration 2.1)

The search system accepts artist names, song titles, or both combined — in any order. It handles typos, accents, punctuation, and case variations.

Examples of supported queries:
- `Artist name` — finds all tracks by that artist
- `Song title` — finds tracks with that title
- `Artist name Song title` — combined query, order-independent
- `Song title Artist name` — reversed combined query
- `Sogn title` — typo tolerance via RapidFuzz fuzzy matching
- `Café` — accent folding (matches "Cafe")
- `song-1!` — punctuation/case insensitive

Search uses a 7-tier deterministic ranking system (exact matches always rank above fuzzy matches), with RapidFuzz `WRatio` as the fuzzy fallback (cutoff score: 70).

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

### Feature-weight profiles

| Profile | Description |
|---|---|
| `equal` | All weights 1.0 — iteration-1 baseline |
| `no_danceability` | Danceability weight 0.0, all others 1.0 — ablation |
| `affect_emphasis` | Valence 2.0, energy 2.0, acousticness 1.5, speechiness 1.5, others lower |
| `balanced` | Mild affect emphasis — valence 1.3, energy 1.3, acousticness 1.2, others moderate (Iteration 2.1) |

Weighted cosine multiplies both seed and candidate vectors by sqrt(weight)
before computing cosine similarity.

### Recommendation methods

| Method | Description |
|---|---|
| `cosine` | Weighted cosine similarity on normalised feature vectors |
| `knn` | scikit-learn `NearestNeighbors(metric='cosine')` |
| `hybrid` | `alpha * weighted_cosine + (1-alpha) * intimacy_norm` |

### Candidate pool safeguard (Iteration 2.1)

Before applying hybrid scoring or MMR, a large candidate pool is retrieved based on content similarity only (no genre hard-filter). This ensures recommendations stay closer to the seed.

- Default pool size: `max(100, top_k * 10)`
- Configurable via `candidate_pool_size` parameter
- Pool size included in response metadata
- Seed track always excluded

### Destination mode

Replaces the deprecated `emotional_filter` hard candidate restriction.

| Mode | Description |
|---|---|
| `none` | Pure seed-based ranking (default) |
| `calm_positive` | Soft scoring bonus for high-valence, low-energy tracks |

### MMR reranking

Maximum Marginal Relevance reranking for diversity:

```
MMR(candidate) = lambda * relevance - (1 - lambda) * max_sim(candidate, selected)
```

- `apply_mmr`: boolean, default false
- `mmr_lambda`: float in [0, 1], default 0.75 (1.0 = no diversity penalty)
- Conservative values (0.85, 0.90) recommended for balanced preset

---

## Evaluation metrics

| Metric | Description |
|---|---|
| Precision@K | Fraction of top-K sharing the seed's genre (offline proxy, not ground-truth) |
| Intra-list diversity | Average pairwise cosine distance within list (all 9 features) |
| Catalogue coverage | Unique recommended tracks across many seeds / total catalogue |
| Single-list coverage | Unique tracks in one list / total catalogue |

---

## API reference

Full interactive docs at `http://localhost:8000/docs`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/tracks/search?q=` | Intelligent track search (tiered + fuzzy) |
| GET | `/tracks/{id}/features` | Audio features + quadrant |
| POST | `/recommend` | Get recommendations (with profiles, destination, MMR, candidate pool) |
| GET | `/evaluate?seed_id=&k=` | Single-seed evaluation metrics |
| POST | `/evaluate/batch` | Batch evaluation for one configuration |
| POST | `/evaluate/compare` | Compare required configurations |

### POST /recommend parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `seed_track_id` | string | required | Seed track ID |
| `top_k` | int | 10 | Number of results (1-50) |
| `method` | string | "cosine" | "cosine", "knn", or "hybrid" |
| `alpha` | float | 0.7 | Hybrid blend weight [0, 1] |
| `feature_weight_profile` | string | "equal" | "equal", "no_danceability", "affect_emphasis", or "balanced" |
| `custom_weights` | dict | null | Override weights (validated) |
| `destination_mode` | string | "none" | "none" or "calm_positive" |
| `destination_weight` | float | 0.3 | Destination blend weight [0, 1] |
| `apply_mmr` | bool | false | Enable MMR diversity reranking |
| `mmr_lambda` | float | 0.75 | MMR relevance/diversity trade-off [0, 1] |
| `candidate_pool_size` | int | null | Similarity-first pool size (default: max(100, top_k*10)) |
| `emotional_filter` | string | null | **Deprecated** — use destination_mode |

---

## Iteration history

- See `CHANGELOG_ITERATION2.md` for Iteration 2 details.
- See `CHANGELOG_ITERATION2_1.md` for Iteration 2.1 details.

Iteration 2.1 responds to formative feedback from a small exploratory study. It does not claim statistical significance or that user satisfaction has been proven.
