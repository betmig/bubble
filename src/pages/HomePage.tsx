import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { useRecommendation } from '../context/RecommendationContext';
import type { TrackSearchResult } from '../api/client';
import { Sparkles, Heart, Waves, FlaskConical, Ear, Music2 } from 'lucide-react';

export function HomePage() {
  const navigate = useNavigate();
  const { mode, setSeedTrack } = useRecommendation();
  const [, setSelected] = useState<TrackSearchResult | null>(null);

  function handleSelect(track: TrackSearchResult) {
    setSelected(track);
    setSeedTrack(track);
    navigate(`/results/${track.id}`);
  }

  if (mode === 'listener') {
    return (
      <main className="min-h-[calc(100vh-56px)] flex flex-col">
        <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-b from-rose-50 via-amber-50/40 to-white">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-4xl">🫧</span>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-stone-900">Bubble</h1>
          </div>
          <p className="text-lg sm:text-xl text-stone-600 mb-2 text-center max-w-md">
            Pick a song you like and discover music with a similar feel.
          </p>
          <p className="text-sm text-stone-400 mb-10 text-center max-w-sm">
            Search for any song by title, artist, or both. Bubble will find tracks that sound similar.
          </p>

          <SearchBar onSelect={handleSelect} placeholder="Try a song title, artist, or both…" />

          <div className="mt-6 flex items-center gap-2 text-xs text-stone-400">
            <Ear size={14} />
            <span>Listener mode — simple music discovery</span>
          </div>
        </section>

        <section className="py-12 px-4 bg-white">
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-rose-100 bg-rose-50/50">
              <Music2 size={24} className="text-rose-500 mb-2" />
              <p className="font-semibold text-stone-800 text-sm mb-1">Search any song</p>
              <p className="text-xs text-stone-500">Type a title, artist name, or both. Typos are OK.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-amber-100 bg-amber-50/50">
              <Sparkles size={24} className="text-amber-500 mb-2" />
              <p className="font-semibold text-stone-800 text-sm mb-1">Discover similar tracks</p>
              <p className="text-xs text-stone-500">Get recommendations with a similar sound or mood.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-b from-rose-50 via-amber-50/40 to-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-4xl">🫧</span>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-stone-900">Bubble</h1>
        </div>
        <p className="text-lg sm:text-xl text-stone-600 mb-2 text-center max-w-md">
          Find songs for your people.
        </p>
        <p className="text-sm text-stone-400 mb-10 text-center max-w-sm">
          Enter a song you associate with someone, and Bubble surfaces tracks with the same warm, tender energy.
        </p>

        <SearchBar onSelect={handleSelect} placeholder="Search for a song or artist…" />

        <p className="mt-4 text-xs text-stone-400">
          Powered by Spotify audio features + Russell's valence–arousal model
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
          <FlaskConical size={12} />
          <span>Data Science mode — explore recommendation settings and evaluation metrics</span>
        </div>
      </section>

      {/* Feature pills */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          <FeaturePill icon={<Heart size={20} className="text-rose-500" />} title="Intimacy-aware">
            Scores every track on warmth using valence, energy, and acousticness.
          </FeaturePill>
          <FeaturePill icon={<Sparkles size={20} className="text-amber-500" />} title="Four methods">
            Choose Cosine, KNN, Hybrid, or Balanced with configurable alpha and profiles.
          </FeaturePill>
          <FeaturePill icon={<Waves size={20} className="text-teal-500" />} title="Emotion map">
            Visualise every recommendation on Russell's arousal–valence plane.
          </FeaturePill>
        </div>
      </section>

      {/* Quadrant explainer */}
      <section className="py-12 px-4 bg-rose-50/40 border-t border-rose-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-lg font-semibold text-stone-700 mb-6">Russell's Emotion Circumplex</h2>
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-center">
            {[
              { q: 'Q1', label: 'High-arousal positive', color: 'bg-amber-100 border-amber-200 text-amber-800' },
              { q: 'Q2', label: 'High-arousal negative', color: 'bg-red-100 border-red-200 text-red-800' },
              { q: 'Q3', label: 'Low-arousal negative', color: 'bg-indigo-100 border-indigo-200 text-indigo-800' },
              { q: 'Q4', label: 'Calm-positive region', color: 'bg-rose-100 border-rose-200 text-rose-800 ring-2 ring-rose-300' },
            ].map(({ q, label, color }) => (
              <div key={q} className={`p-3 rounded-xl border ${color}`}>
                <p className="font-bold text-sm">{q}</p>
                <p className="text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-stone-400 mt-4">
            Q4 — the calm-positive destination region — is where the most tender songs tend to cluster.
          </p>
        </div>
      </section>
    </main>
  );
}

function FeaturePill({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center p-5 rounded-2xl border border-stone-100 bg-stone-50">
      <div className="mb-2">{icon}</div>
      <p className="font-semibold text-stone-800 text-sm mb-1">{title}</p>
      <p className="text-xs text-stone-500">{children}</p>
    </div>
  );
}
