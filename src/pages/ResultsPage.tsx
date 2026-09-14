import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getRecommendations,
  getTrackFeatures,
  type RecommendMethod,
  type FeatureWeightProfile,
  type DestinationMode,
  type AudioFeatures,
} from '../api/client';
import {
  useRecommendation,
  getListenerPreset,
  type ListenerPreference,
} from '../context/RecommendationContext';
import { FeatureRadar } from '../components/FeatureRadar';
import { EmotionMap } from '../components/EmotionMap';
import { TrackCard } from '../components/TrackCard';
import { QUADRANT_BG, QUADRANT_LABELS } from '../lib/constants';
import {
  Loader2, AlertCircle, LayoutGrid, MapPin, ArrowLeft,
  SlidersHorizontal, RotateCcw, Sparkles, Moon, Wind,
} from 'lucide-react';

const TOP_K_OPTIONS = [5, 10, 20];
const PROFILES: FeatureWeightProfile[] = ['equal', 'no_danceability', 'affect_emphasis', 'balanced'];

export function ResultsPage() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const { mode, session, setSeedTrack, setResult, setListenerPreference, setLoading, setError } = useRecommendation();

  const [features, setFeatures] = useState<AudioFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresError, setFeaturesError] = useState('');

  // Data Science mode controls
  const [method, setMethod] = useState<RecommendMethod>('hybrid');
  const [alpha, setAlpha] = useState(0.7);
  const [topK, setTopK] = useState(10);
  const [profile, setProfile] = useState<FeatureWeightProfile>('affect_emphasis');
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('none');
  const [applyMmr, setApplyMmr] = useState(false);
  const [mmrLambda, setMmrLambda] = useState(0.75);

  const [tab, setTab] = useState<'cards' | 'map'>('cards');
  const requestRef = useRef(0);

  // Sync seed track from URL
  useEffect(() => {
    if (!trackId) return;
    setFeaturesLoading(true);
    setFeaturesError('');
    getTrackFeatures(trackId)
      .then(f => {
        setFeatures(f);
        if (session.seedTrack?.id !== trackId) {
          // Try to restore from session, otherwise create a minimal stub
          setSeedTrack(session.seedTrack ?? { id: trackId, name: '', artist: '' });
        }
      })
      .catch(() => setFeaturesError('Failed to load track features. Is the backend running?'))
      .finally(() => setFeaturesLoading(false));
  }, [trackId]);

  async function handleGetRecommendationsDS() {
    if (!trackId) return;
    const reqId = ++requestRef.current;
    setLoading(true);
    setError('');
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
      if (reqId === requestRef.current) {
        setResult(data);
        setTab('cards');
      }
    } catch {
      if (reqId === requestRef.current) setError('Failed to get recommendations. Is the backend running?');
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  }

  async function handleGetRecommendationsListener(pref: ListenerPreference) {
    if (!trackId) return;
    const reqId = ++requestRef.current;
    setListenerPreference(pref);
    setLoading(true);
    setError('');
    try {
      const preset = getListenerPreset(pref);
      const data = await getRecommendations({
        seed_track_id: trackId,
        top_k: 10,
        ...preset,
      });
      if (reqId === requestRef.current) {
        setResult(data);
        setTab('cards');
      }
    } catch {
      if (reqId === requestRef.current) setError('Could not get recommendations. Please try again.');
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  }

  function handleTryAnother() {
    setResult(null);
    setListenerPreference(null);
    setError('');
    navigate('/');
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

  // -- Listener mode render -----------------------------------------------------

  if (mode === 'listener') {
    return (
      <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-rose-50/40 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <button
            onClick={handleTryAnother}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-5 transition-colors"
          >
            <ArrowLeft size={15} /> Try another song
          </button>

          {/* Seed song display */}
          {features && (
            <div className="bg-white rounded-2xl border border-rose-100 p-6 shadow-sm mb-6 text-center">
              <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">Your song</p>
              <h2 className="text-xl font-bold text-stone-800 mb-0.5">
                {session.result?.seed_track.name ?? session.seedTrack?.name ?? `Track ${trackId}`}
              </h2>
              <p className="text-sm text-stone-500">
                {session.result?.seed_track.artist ?? session.seedTrack?.artist}
              </p>
            </div>
          )}

          {/* Preference selector (only if no results yet) */}
          {!session.result && !session.loading && (
            <div className="bg-white rounded-2xl border border-rose-100 p-6 shadow-sm space-y-4">
              <p className="text-sm font-semibold text-stone-700 text-center">What kind of recommendations do you want?</p>
              <div className="space-y-3">
                <ListenerOption
                  icon={<Wind size={20} className="text-teal-500" />}
                  title="Stay close to this song"
                  desc="Recommendations that sound very similar"
                  onClick={() => handleGetRecommendationsListener('close')}
                />
                <ListenerOption
                  icon={<Sparkles size={20} className="text-amber-500" />}
                  title="A little more variety"
                  desc="Some new discoveries while staying related"
                  onClick={() => handleGetRecommendationsListener('variety')}
                />
                <ListenerOption
                  icon={<Moon size={20} className="text-rose-400" />}
                  title="Calm and warm suggestions"
                  desc="Gentle, warm tracks with a tender feel"
                  onClick={() => handleGetRecommendationsListener('calm')}
                />
              </div>
            </div>
          )}

          {/* Loading */}
          {session.loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="animate-spin text-rose-400" size={32} />
              <p className="mt-3 text-sm text-stone-500">Finding songs for you…</p>
            </div>
          )}

          {/* Error */}
          {session.error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
              <AlertCircle size={16} /> {session.error}
            </div>
          )}

          {/* Results */}
          {session.result && !session.loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-700">
                  {session.result.recommendations.length} recommendations
                </p>
                <button
                  onClick={handleTryAnother}
                  className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  <RotateCcw size={12} /> Try another song
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.result.recommendations.map((track: typeof session.result.recommendations[number]) => (
                  <ListenerTrackCard
                    key={track.track_id}
                    name={track.track_name}
                    artist={track.artist_name}
                    rank={track.rank}
                    preference={session.listenerPreference}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // -- Data Science mode render -------------------------------------------------

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
                  {session.result?.seed_track.name ?? session.seedTrack?.name ?? `Track ${trackId}`}
                </h2>
                <p className="text-sm text-stone-500 mb-1 truncate">{session.result?.seed_track.artist}</p>

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
                <div className="flex gap-1.5 flex-wrap">
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
                      {p === 'equal' ? 'Equal' : p === 'no_danceability' ? 'No Dance' : p === 'affect_emphasis' ? 'Affect' : 'Balanced'}
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
                onClick={handleGetRecommendationsDS}
                disabled={session.loading}
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {session.loading ? <><Loader2 size={15} className="animate-spin" /> Getting recommendations…</> : 'Get recommendations'}
              </button>
            </div>
          </aside>

          {/* Right panel */}
          <section>
            {session.error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
                <AlertCircle size={16} /> {session.error}
              </div>
            )}

            {!session.result && !session.loading && (
              <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                <p className="text-sm">Configure the controls and hit "Get recommendations".</p>
              </div>
            )}

            {session.result && (
              <>
                {/* Eval strip */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <StatPill label="Method" value={session.result.method_used} />
                  <StatPill label="Profile" value={session.result.metadata.feature_weight_profile} />
                  <StatPill label="Precision@K" value={`${(session.result.evaluation.precision_at_k * 100).toFixed(0)}%`} />
                  <StatPill label="Diversity" value={session.result.evaluation.intra_list_diversity.toFixed(3)} />
                  <StatPill label="Tracks" value={`${session.result.recommendations.length}`} />
                  {session.result.metadata.apply_mmr && (
                    <StatPill label="MMR" value={`lambda=${session.result.metadata.mmr_lambda}`} />
                  )}
                  {session.result.metadata.destination_mode !== 'none' && (
                    <StatPill label="Destination" value={session.result.metadata.destination_mode} />
                  )}
                  {session.result.metadata.candidate_pool_size != null && (
                    <StatPill label="Pool" value={`${session.result.metadata.candidate_pool_size}`} />
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
                    {session.result.recommendations.map((track: typeof session.result.recommendations[number]) => (
                      <TrackCard key={track.track_id} track={track} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm">
                    <EmotionMap seed={session.result.seed_track} recommendations={session.result.recommendations} />
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

function ListenerOption({
  icon, title, desc, onClick,
}: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl border border-stone-100 hover:border-rose-200 hover:bg-rose-50/50 transition-colors text-left"
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-stone-800">{title}</p>
        <p className="text-xs text-stone-500">{desc}</p>
      </div>
    </button>
  );
}

function ListenerTrackCard({
  name, artist, rank, preference,
}: { name: string; artist: string; rank: number; preference: ListenerPreference | null }) {
  const label =
    preference === 'close' ? 'Similar sound' :
    preference === 'variety' ? 'A little more variety' :
    preference === 'calm' ? 'Calm and warm pick' :
    '';

  return (
    <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-800 truncate">{name}</p>
          <p className="text-xs text-stone-500 truncate">{artist}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-stone-400">#{rank}</span>
      </div>
      {label && (
        <p className="text-xs text-rose-600 font-medium">{label}</p>
      )}
    </div>
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
