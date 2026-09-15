import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecommendationProvider } from '../context/RecommendationContext';
import { ResultsPage } from '../pages/ResultsPage';
import * as client from '../api/client';
import { buildShareUrl, APP_VERSION, type ShareParams } from '../lib/share';

const mockRecommendResponse = {
  seed_track: {
    id: 'track123',
    name: 'Test Song',
    artist: 'Test Artist',
    features: {
      valence: 0.8, energy: 0.3, danceability: 0.5, acousticness: 0.7,
      instrumentalness: 0.1, speechiness: 0.05, liveness: 0.1, tempo: 120, loudness: -10,
      intimacy_score: 0.6, quadrant: 'Q4',
    },
  },
  recommendations: [
    { rank: 1, track_id: 'r1', track_name: 'Rec 1', artist_name: 'Artist 1', similarity_score: 0.9, intimacy_score: 0.5, valence: 0.7, energy: 0.3, danceability: 0.4, acousticness: 0.6, instrumentalness: 0.1, speechiness: 0.05, liveness: 0.1, tempo: 110, loudness: -12, quadrant: 'Q4', genre: 'pop' },
  ],
  method_used: 'hybrid',
  metadata: {
    method: 'hybrid',
    alpha: 0.90,
    feature_weight_profile: 'balanced',
    feature_weights: {},
    destination_mode: 'none',
    destination_weight: 0.30,
    apply_mmr: false,
    mmr_lambda: 0.90,
    candidate_pool_size: 100,
  },
  evaluation: {
    precision_at_k: 0.5,
    single_list_coverage: 0.01,
    intra_list_diversity: 0.3,
  },
};

const mockFeatures = {
  valence: 0.8, energy: 0.3, danceability: 0.5, acousticness: 0.7,
  instrumentalness: 0.1, speechiness: 0.05, liveness: 0.1, tempo: 120, loudness: -10,
  intimacy_score: 0.6, quadrant: 'Q4',
};

function renderResultsPageAt(path: string, mode?: 'data-science' | 'listener') {
  if (mode) localStorage.setItem('bubble-ui-mode', mode);
  return render(
    <RecommendationProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/results/:trackId?" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </RecommendationProvider>
  );
}

describe('ResultsPage share link loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('makes exactly one API request for a valid share link', async () => {
    const recSpy = vi.spyOn(client, 'getRecommendations').mockResolvedValue(mockRecommendResponse as any);
    vi.spyOn(client, 'getTrackFeatures').mockResolvedValue(mockFeatures as any);

    const validParams: ShareParams = {
      seed: 'track123', preset: 'close', method: 'hybrid', profile: 'balanced',
      alpha: 0.90, destinationMode: 'none', destinationWeight: 0.30,
      mmr: false, mmrLambda: 0.90, candidatePoolSize: 100, k: 10,
      view: 'listener', v: APP_VERSION,
    };
    const shareUrl = buildShareUrl(validParams);
    const path = `/results/track123?${shareUrl.split('?')[1]}`;

    renderResultsPageAt(path, 'data-science');

    await waitFor(() => expect(recSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Test Song')).toBeInTheDocument());
  });

  it('shows error for invalid share params without making API request', async () => {
    const recSpy = vi.spyOn(client, 'getRecommendations').mockResolvedValue(mockRecommendResponse as any);
    vi.spyOn(client, 'getTrackFeatures').mockResolvedValue(mockFeatures as any);

    renderResultsPageAt('/results/track123?seed=track123&method=invalid&profile=balanced&alpha=0.90&destination_mode=none&destination_weight=0.30&mmr=false&mmr_lambda=0.90&k=10&view=listener&v=2.2.0', 'listener');

    await waitFor(() => {
      expect(screen.getByText(/invalid or incomplete/i)).toBeInTheDocument();
    });
    expect(recSpy).not.toHaveBeenCalled();
  });

  it('shows version mismatch note for old version links', async () => {
    vi.spyOn(client, 'getRecommendations').mockResolvedValue(mockRecommendResponse as any);
    vi.spyOn(client, 'getTrackFeatures').mockResolvedValue(mockFeatures as any);

    const validParams: ShareParams = {
      seed: 'track123', preset: 'close', method: 'hybrid', profile: 'balanced',
      alpha: 0.90, destinationMode: 'none', destinationWeight: 0.30,
      mmr: false, mmrLambda: 0.90, candidatePoolSize: 100, k: 10,
      view: 'data_science', v: APP_VERSION,
    };
    const shareUrl = buildShareUrl(validParams);
    // Override version to simulate an old link
    const sp = new URLSearchParams(shareUrl.split('?')[1]);
    sp.set('v', '1.0.0');
    const path = `/results/track123?${sp.toString()}`;

    renderResultsPageAt(path, 'data-science');

    // Wait for recommendation to load first
    await waitFor(() => {
      expect(screen.getByText('Test Song')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Version mismatch note should appear
    expect(screen.getByText(/earlier version/i)).toBeInTheDocument();
  });

  it('shows seed unavailable message when track features fail', async () => {
    vi.spyOn(client, 'getTrackFeatures').mockRejectedValue(new Error('not found'));
    vi.spyOn(client, 'getRecommendations').mockResolvedValue(mockRecommendResponse as any);

    renderResultsPageAt('/results/badtrack');

    await waitFor(() => {
      expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    });
  });

  it('works normally without URL parameters', async () => {
    const recSpy = vi.spyOn(client, 'getRecommendations').mockResolvedValue(mockRecommendResponse as any);
    vi.spyOn(client, 'getTrackFeatures').mockResolvedValue(mockFeatures as any);

    renderResultsPageAt('/results/track123', 'data-science');

    await waitFor(() => expect(screen.getByText('Seed track')).toBeInTheDocument());
    // No recommendation should have been auto-triggered
    expect(recSpy).not.toHaveBeenCalled();
  });
});
