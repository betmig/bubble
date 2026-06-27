import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export interface TrackSearchResult {
  id: string;
  name: string;
  artist: string;
}

export interface AudioFeatures {
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  tempo: number;
  loudness: number;
  intimacy_score: number;
  quadrant: string;
}

export interface RecommendedTrack {
  rank: number;
  track_id: string;
  track_name: string;
  artist_name: string;
  similarity_score: number;
  intimacy_score: number;
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  quadrant: string;
  genre: string;
}

export interface SeedTrack {
  id: string;
  name: string;
  artist: string;
  features: AudioFeatures;
}

export interface RecommendResponse {
  seed_track: SeedTrack;
  recommendations: RecommendedTrack[];
  method_used: string;
  evaluation: {
    precision_at_k: number;
    intra_list_diversity: number;
  };
}

export interface EvaluationResult {
  precision_at_k: number;
  coverage: number;
  intra_list_diversity: number;
  seed_track_id: string;
  k: number;
}

export type RecommendMethod = 'cosine' | 'knn' | 'hybrid';

export async function searchTracks(q: string): Promise<TrackSearchResult[]> {
  const { data } = await api.get<TrackSearchResult[]>('/tracks/search', { params: { q } });
  return data;
}

export async function getTrackFeatures(trackId: string): Promise<AudioFeatures> {
  const { data } = await api.get<AudioFeatures>(`/tracks/${trackId}/features`);
  return data;
}

export async function getRecommendations(params: {
  seed_track_id: string;
  top_k: number;
  method: RecommendMethod;
  alpha?: number;
  emotional_filter?: string;
}): Promise<RecommendResponse> {
  const { data } = await api.post<RecommendResponse>('/recommend', params);
  return data;
}

export async function getEvaluation(seedId: string, k: number): Promise<EvaluationResult> {
  const { data } = await api.get<EvaluationResult>('/evaluate', { params: { seed_id: seedId, k } });
  return data;
}

export async function getHealth(): Promise<{ status: string; tracks_loaded: number }> {
  const { data } = await api.get('/health');
  return data;
}
