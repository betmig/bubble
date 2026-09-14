import { Info, Music2, Heart, BarChart2, Layers } from 'lucide-react';

export function AboutPage() {
  return (
    <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-rose-50/40 to-white py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-8">

        <div className="flex items-center gap-3">
          <span className="text-3xl">🫧</span>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">About Bubble</h1>
            <p className="text-stone-500 text-sm"></p>
          </div>
        </div>

        <Section icon={<Info size={18} className="text-rose-500" />} title="What is Bubble?">
          <p>
            Testing.
            Bubble is a relationship-context music discovery engine. You enter a song you associate with someone
            you care about, and Bubble surfaces tracks with the same warm, tender emotional fingerprint —
            the kind of music you'd share with someone special.
          </p>
          <p className="mt-2">
            Under the hood, Bubble uses Spotify audio features and content-based filtering. There are no accounts,
            no listening history, and no black-box algorithms — just transparent, explainable mathematics.
          </p>
        </Section>

        <Section icon={<BarChart2 size={18} className="text-amber-500" />} title="The valence–arousal model">
          <p>
            Russell's circumplex model maps emotional states onto two axes: <strong>valence</strong> (negative ↔
            positive) and <strong>arousal</strong> (calm ↔ energetic). Spotify's <em>valence</em> and
            <em> energy</em> features map closely onto this plane.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { q: 'Q1', label: 'High valence, high energy', desc: 'Happy / Excited', color: 'border-amber-200 bg-amber-50' },
              { q: 'Q2', label: 'Low valence, high energy', desc: 'Angry / Tense', color: 'border-red-200 bg-red-50' },
              { q: 'Q3', label: 'Low valence, low energy', desc: 'Sad / Melancholic', color: 'border-indigo-200 bg-indigo-50' },
              { q: 'Q4', label: 'High valence, low energy', desc: 'Tender / Warm ✦', color: 'border-rose-300 bg-rose-50 ring-1 ring-rose-300' },
            ].map(({ q, label, desc, color }) => (
              <div key={q} className={`p-3 rounded-xl border text-xs ${color}`}>
                <p className="font-bold text-stone-700">{q} — {desc}</p>
                <p className="text-stone-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-stone-500">
            Bubble's focus is <strong>Q4</strong>: the warm, calm quadrant where intimate songs cluster.
          </p>
        </Section>

        <Section icon={<Music2 size={18} className="text-teal-500" />} title="Spotify audio features">
          <div className="space-y-2">
            {[
              ['valence', 'Musical positiveness (0 = sad, 1 = happy)'],
              ['energy', 'Intensity and activity (0 = calm, 1 = energetic)'],
              ['danceability', 'Suitability for dancing based on rhythm stability'],
              ['acousticness', 'Confidence measure of whether the track is acoustic'],
              ['instrumentalness', 'Probability the track has no vocals'],
              ['speechiness', 'Presence of spoken words'],
              ['liveness', 'Presence of a live audience in the recording'],
              ['tempo', 'Estimated beats per minute (BPM)'],
              ['loudness', 'Overall loudness in decibels'],
            ].map(([name, desc]) => (
              <div key={name} className="flex gap-2">
                <code className="shrink-0 text-xs bg-stone-100 text-rose-700 px-1.5 py-0.5 rounded font-mono">{name}</code>
                <span className="text-xs text-stone-600">{desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={<Heart size={18} className="text-rose-500" />} title="The intimacy score">
          <p className="text-sm text-stone-600">
            Every track is assigned a custom <strong>intimacy score</strong> that combines four features into a
            single measure of warmth:
          </p>
          <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl font-mono text-sm text-rose-800 text-center">
            intimacy = valence × (1 − energy) × acousticness × (1 − speechiness)
          </div>
          <p className="text-sm text-stone-600">
            A high intimacy score indicates a positive, calm, acoustic track with minimal spoken word — the
            hallmarks of a tender song you'd share with someone close.
          </p>
        </Section>

        <Section icon={<Layers size={18} className="text-stone-500" />} title="Why content-based?">
          <p>
            Bubble is a <strong>content-based</strong> recommender: it only uses audio features, never user
            listening history. This solves the cold-start problem — recommendations work equally well for
            any track regardless of popularity or play count.
          </p>
          <p className="mt-2">
            Three methods are available:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-stone-600 list-disc list-inside">
            <li><strong>Cosine similarity</strong> — baseline, sorts by feature-space proximity</li>
            <li><strong>KNN</strong> — scikit-learn NearestNeighbors with cosine metric</li>
            <li><strong>Hybrid</strong> — weighted blend of cosine similarity and intimacy score (α controls the balance)</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      </div>
      <div className="text-sm text-stone-600 leading-relaxed">{children}</div>
    </div>
  );
}
