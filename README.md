# Bubble 🫧

> Relationship-context music discovery engine.  
> *Find songs for your people.*

Bubble is a **CM3005 Data Science** project. Enter a song you associate with someone you care about and Bubble recommends tracks with the same warm, tender emotional fingerprint — anchored in Russell's valence–arousal model.

---

## Architecture

```
bubble/
├── backend/               # Python FastAPI — data science pipeline
│   ├── app/
│   │   ├── main.py        # FastAPI entry point + REST endpoints
│   │   ├── recommender.py # Feature engineering + 3 recommendation methods
│   │   ├── models.py      # Pydantic request/response schemas
│   │   └── evaluation.py  # Precision@K, Coverage, Diversity metrics
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

```
                    ┌─────────────────────────────────┐
                    │           Nginx (port 80)        │
                    │  /api/* → FastAPI  /  → React   │
                    └─────────┬──────────────┬────────┘
                              │              │
                    ┌─────────▼──────┐  ┌───▼────────────┐
                    │ FastAPI :8000  │  │ React (nginx)  │
                    │ recommender.py │  │ Vite build     │
                    │ pandas + sklearn│  └────────────────┘
                    └────────────────┘
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

---

## VPS deployment

```bash
# 1. Clone the repo on your VPS
git clone <your-repo> /docker/bubble
cd /docker/bubble

# 2. Add the dataset
cp /path/to/spotify_tracks.csv backend/data/

# 3. Build and start
docker compose up -d --build

# 4. (Nginx Proxy Manager) Point your domain to port 80
#    Enable SSL via Let's Encrypt
```

---

## Data science pipeline

The recommendation engine lives in `backend/app/recommender.py`.

### Features

Nine Spotify audio features, all normalised to [0, 1] via `MinMaxScaler`:
`valence`, `energy`, `danceability`, `acousticness`, `instrumentalness`,
`speechiness`, `liveness`, `tempo`, `loudness`.

### Intimacy score

```
intimacy = valence_n × (1 − energy_n) × acousticness_n × (1 − speechiness_n)
```

Captures the warm, calm, acoustic, non-verbal character of a tender song.

### Quadrant mapping (Russell's circumplex)

| | High energy | Low energy |
|---|---|---|
| **High valence** | Q1 Happy / Excited | **Q4 Tender / Warm** ← Bubble's focus |
| **Low valence** | Q2 Angry / Tense | Q3 Sad / Melancholic |

### Recommendation methods

| Method | Description |
|---|---|
| `cosine` | Cosine similarity on normalised feature vectors |
| `knn` | scikit-learn `NearestNeighbors(metric='cosine')` |
| `hybrid` | `α × cosine + (1−α) × intimacy_norm` |

---

## Evaluation metrics

| Metric | Description |
|---|---|
| Precision@K | Fraction of top-K sharing the seed's genre |
| Coverage | Unique recommended tracks ÷ total catalogue |
| Intra-list diversity | Average pairwise cosine distance within list |

Run via `GET /evaluate?seed_id=<id>&k=10` or through the Evaluation page in the UI.

---

## Jupyter notebook

EDA, feature analysis, method comparison, and evaluation:

```
backend/notebooks/01_eda_and_model.ipynb
```

Start Jupyter:

```bash
cd backend
pip install -r requirements.txt
jupyter notebook
```

---

## API reference

Full interactive docs available at `http://localhost:8000/docs` when the backend is running.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/tracks/search?q=` | Fuzzy track search |
| GET | `/tracks/{id}/features` | Audio features + quadrant |
| POST | `/recommend` | Get recommendations |
| GET | `/evaluate?seed_id=&k=` | Evaluation metrics |
