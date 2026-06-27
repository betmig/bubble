# Bubble Backend — Data Science Documentation

## Overview

The backend is a **FastAPI** application that implements a content-based music
recommendation pipeline using Spotify audio features.

---

## Features used

| Feature | Description |
|---|---|
| `valence` | Musical positiveness (0 = sad, 1 = happy) |
| `energy` | Intensity and activity level |
| `danceability` | Suitability for dancing |
| `acousticness` | Confidence the track is acoustic |
| `instrumentalness` | Probability of no vocals |
| `speechiness` | Presence of spoken words |
| `liveness` | Presence of a live audience |
| `tempo` | Estimated BPM |
| `loudness` | Overall loudness in dB |

All features are normalised to [0, 1] using `MinMaxScaler`.

---

## Intimacy score

Each track receives a **custom intimacy score** that captures warmth:

```
intimacy_score = valence_norm × (1 − energy_norm) × acousticness_norm × (1 − speechiness_norm)
```

A high intimacy score means the track is positive, calm, acoustic, and
non-verbal — the hallmarks of a song you'd share with someone you care about.

---

## Quadrant mapping (Russell's circumplex)

Using normalised valence (x) and energy (y), with the midpoint at 0.5:

| Quadrant | Valence | Energy | Label |
|---|---|---|---|
| Q1 | high | high | Happy / Excited |
| Q2 | low  | high | Angry / Tense |
| Q3 | low  | low  | Sad / Melancholic |
| Q4 | high | low  | **Tender / Warm / Intimate** |

Bubble focuses on **Q4**.

---

## Recommendation methods

### Method A — Cosine similarity
Computes pairwise cosine similarity between the seed track's feature vector
and every candidate. Sorted descending. Simple and fast.

### Method B — KNN (scikit-learn)
Uses `NearestNeighbors(metric='cosine')`. Returns the K nearest neighbours.
Equivalent to cosine similarity but via scikit-learn's infrastructure —
easy to swap for FAISS later.

### Method C — Hybrid
```
final_score = α × cosine_similarity + (1 − α) × intimacy_score_norm
```
`α = 1` is pure cosine; `α = 0` ranks purely by intimacy. The default
`α = 0.7` blends both signals, slightly favouring warmth.

---

## Evaluation metrics

| Metric | Description |
|---|---|
| Precision@K | Fraction of top-K results sharing the seed's genre |
| Coverage | Unique recommended tracks ÷ total tracks (across queries) |
| Intra-list diversity | Avg pairwise cosine distance within a list (↑ = more diverse) |

Run evaluation via `GET /evaluate?seed_id=<id>&k=10`.

---

## Running locally

```bash
# Install dependencies
pip install -r requirements.txt

# Place dataset at:
# backend/data/spotify_tracks.csv

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

---

## Dataset

Place the Kaggle Spotify tracks CSV at `backend/data/spotify_tracks.csv`.

Required columns:
```
track_id, track_name, artist_name, genre,
valence, energy, danceability, acousticness,
instrumentalness, speechiness, liveness, tempo, loudness
```

---

## Notebook

See `notebooks/01_eda_and_model.ipynb` for EDA, model development, and
evaluation across multiple seed tracks.
