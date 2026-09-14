import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getRecommendations,
  getTrackFeatures,
  type RecommendResponse,
  type RecommendMethod,
  type FeatureWeightProfile,
  type DestinationMode,
  type AudioFeatures,
} from '../api/client';
import { FeatureRadar } from '../components/FeatureRadar';
import { EmotionMap } from '../components/EmotionMap';
import { TrackCard } from '../components/TrackCard';
import { QUADRANT_BG, QUADRANT_LABELS } from '../lib/constants';
import { Loader2, AlertCircle, LayoutGrid, MapPin, ArrowLeft, SlidersHorizontal } from 'lucide-react';

const TOP_K_OPTIONS = [5, 10, 20];
const PROFILES: FeatureWeightProfile[] = ['equal', 'no_danceability', 'affect_emphasis'];

export function ResultsPage() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();

  const [features, setFeatures] = useState<AudioFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresError, setFeaturesError] = useState('');

  const [method, setMethod] = useState<RecommendMethod>('hybrid');
  const [alpha, setAlpha] = useState(0.7);
  const [topK, setTopK] = useState(10);
  const [profile, setProfile] = useState<FeatureWeightProfile>('affect_emphasis');
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('none');
  const [applyMmr, setApplyMmr] = useState(false);
  const [mmrLambda, setMmrLambda] = useState(0.75);

  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState('');

  const [tab, setTab] = useState<'cards' | 'map'>('cards');

  useEffect(() => {
    if (!trackId) return;
    setFeaturesLoading(true);
    setFeaturesError('');
    getTrackFeatures(trackId)
      .then(setFeatures)
      .catch(() => setFeaturesError('Failed to load track features. Is the backend running?'))
      .finally(() => setFeaturesLoading(false));
  }, [trackId]);

  async function handleGetRecommendations() {
    if (!trackId) return;
    setRecLoading(true);
    setRecError('');
    try {
      const data = await getRecommendations({
        seed_track_id: trackId,
        top_k: topK,
        method,
        alpha,
        feature_weight_profile: profile,
        destination_mode: destinationMode,
        apply_mmr: applyMmr,
        mmr_lambda: mmrLambda,
      });
      setResult(data);
    } catch {
      setRecError('Failed to get recommendations. Is the backend running?');
    } finally {
      setRecLoading(false);
    }
  }

  if (featuresLoading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 className="animate-spin text-rose-400" size={32} />
      </div>
    );
  }

  if (featuresError) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center gap-3 px-4">
        <AlertCircle className="text-red-400" size={32} />
        <p className="text-stone-600 text-sm text-center">{featuresError}</p>
        <button onClick={() => navigate('/')} className="text-sm text-rose-600 underline">Back to search</button>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-rose-50/40 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-5 transition-colors"
        >
          <ArrowLeft size={15} /> Back to search
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">

          {/* Left panel */}
          <aside className="space-y-4">
            {/* Seed track card */}
            {features && (
              <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">Seed track</p>
                <h2 className="text-base font-semibold text-stone-800 mb-0.5 truncate">
                  {result?.seed_track.name ?? `Track ${trackId}`}
                </h2>
                <p className="text-sm text-stone-500 mb-1 truncate">{result?.seed_track.artist}</p>

                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-3 ${QUADRANT_BG[features.quadrant] ?? 'bg-stone-100 text-stone-600'}`}>
                  {features.quadrant} · {QUADRANT_LABELS[features.quadrant]}
                </span>

                <FeatureRadar features={features} />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    ['Intimacy', features.intimacy_score],
                    ['Valence', features.valence],
                    ['Energy', features.energy],
                    ['Acoustic', features.acousticness],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="text-center p-2 bg-rose-50 rounded-xl">
                      <p className="text-xs text-stone-500">{label}</p>
                      <p className="text-sm font-bold text-rose-700">{(val * 100).toFixed(0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                <SlidersHorizontal size={15} /> Controls
              </div>

              {/* Method */}
              <div>
                <p className="text-xs text-stone-500 mb-1.5">Method</p>
                <div className="flex gap-2">
                  {(['cosine', 'knn', 'hybrid'] as RecommendMethod[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        method === m
                          ? 'bg-rose-500 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {m === 'cosine' ? 'Cosine' : m === 'knn' ? 'KNN' : 'Hybrid'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alpha slider (hybrid only) */}
              {method === 'hybrid' && (
                <div>
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>Similarity</span>
                    <span className="font-medium text-stone-700">alpha = {alpha.toFixed(2)}</span>
                    <span>Intimacy</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={alpha}
                    onChange={e => setAlpha(parseFloat(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>
              )}

              {/* Feature weight profile */}
              <div>
                <p className="text-xs text-stone-500 mb-1.5">Feature weights</p>
                <div className="flex gap-1.5">
                  {PROFILES.map(p => (
                    <button
                      key={p}
                      onClick={() => setProfile(p)}
                      className={`flex-1 py-1.5 text-[10px] rounded-lg font-medium transition-colors leading-tight ${
                        profile === p
                          ? 'bg-rose-500 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {p === 'equal' ? 'Equal' : p === 'no_danceability' ? 'No Dance' : 'Affect'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Top-K */}
              <div>
                <p className="text-xs text-stone-500 mb-1.5">Results</p>
                <div className="flex gap-2">
                  {TOP_K_OPTIONS.map(k => (
                    <button
                      key={k}
                      onClick={() => setTopK(k)}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        topK === k
                          ? 'bg-rose-500 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Destination mode */}
              <div>
                <p className="text-xs text-stone-500 mb-1.5">Destination mode</p>
                <div className="flex gap-2">
                  {(['none', 'calm_positive'] as DestinationMode[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDestinationMode(d)}
                      className={`flex-1 py-1.5 text-[10px] rounded-lg font-medium transition-colors leading-tight ${
                        destinationMode === d
                          ? 'bg-rose-500 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {d === 'none' ? 'None' : 'Calm-positive'}
                    </button>
                  ))}
                </div>
              </div>

              {/* MMR toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setApplyMmr(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${applyMmr ? 'bg-rose-500' : 'bg-stone-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${applyMmr ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-stone-600">Diversity reranking (MMR)</span>
              </label>

              {/* MMR lambda slider */}
              {applyMmr && (
                <div>
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>Relevance</span>
                    <span className="font-medium text-stone-700">lambda = {mmrLambda.toFixed(2)}</span>
                    <span>Diversity</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={mmrLambda}
                    onChange={e => setMmrLambda(parseFloat(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>
              )}

              <button
                onClick={handleGetRecommendations}
                disabled={recLoading}
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {recLoading ? <><Loader2 size={15} className="animate-spin" /> Getting recommendations…</> : 'Get recommendations'}
              </button>
            </div>
          </aside>

          {/* Right panel */}
          <section>
            {recError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
                <AlertCircle size={16} /> {recError}
              </div>
            )}

            {!result && !recLoading && (
              <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                <p className="text-sm">Configure the controls and hit "Get recommendations".</p>
              </div>
            )}

            {result && (
              <>
                {/* Eval strip */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <StatPill label="Method" value={result.method_used} />
                  <StatPill label="Profile" value={result.metadata.feature_weight_profile} />
                  <StatPill label="Precision@K" value={`${(result.evaluation.precision_at_k * 100).toFixed(0)}%`} />
                  <StatPill label="Diversity" value={(result.evaluation.intra_list_diversity).toFixed(3)} />
                  <StatPill label="Tracks" value={`${result.recommendations.length}`} />
                  {result.metadata.apply_mmr && (
                    <StatPill label="MMR" value={`lambda=${result.metadata.mmr_lambda}`} />
                  )}
                  {result.metadata.destination_mode !== 'none' && (
                    <StatPill label="Destination" value={result.metadata.destination_mode} />
                  )}
                </div>

                {/* Tab switcher */}
                <div className="flex gap-2 mb-4">
                  <TabBtn active={tab === 'cards'} onClick={() => setTab('cards')}>
                    <LayoutGrid size={14} /> Cards
                  </TabBtn>
                  <TabBtn active={tab === 'map'} onClick={() => setTab('map')}>
                    <MapPin size={14} /> Emotion map
                  </TabBtn>
                </div>

                {tab === 'cards' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {result.recommendations.map(track => (
                      <TrackCard key={track.track_id} track={track} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm">
                    <EmotionMap seed={result.seed_track} recommendations={result.recommendations} />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-rose-100 rounded-xl px-3 py-1.5 text-xs shadow-sm">
      <span className="text-stone-400">{label}: </span>
      <span className="font-semibold text-stone-700">{value}</span>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
        active ? 'bg-rose-100 text-rose-700' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  );
}
