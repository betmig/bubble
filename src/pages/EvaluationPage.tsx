import { useState } from 'react';
import { getEvaluation, type TrackSearchResult, type EvaluationResult } from '../api/client';
import { SearchBar } from '../components/SearchBar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, AlertCircle, FlaskConical } from 'lucide-react';

export function EvaluationPage() {
  const [seed, setSeed] = useState<TrackSearchResult | null>(null);
  const [k, setK] = useState(10);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleEvaluate() {
    if (!seed) return;
    setLoading(true);
    setError('');
    try {
      const data = await getEvaluation(seed.id, k);
      setResult(data);
    } catch {
      setError('Evaluation failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  const chartData = result
    ? [
        { metric: 'Precision@K', value: parseFloat((result.precision_at_k * 100).toFixed(1)) },
        { metric: 'Single-list coverage', value: parseFloat((result.single_list_coverage * 100).toFixed(1)) },
        { metric: 'Diversity', value: parseFloat((result.intra_list_diversity * 100).toFixed(1)) },
      ]
    : [];

  return (
    <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-rose-50/40 to-white py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={20} className="text-rose-500" />
          <h1 className="text-2xl font-bold text-stone-800">Single-seed diagnostic</h1>
        </div>
        <p className="text-stone-500 text-sm mb-8">
          Inspect proxy metrics for one seed. Use batch evaluation results in the notebook for formal model comparison.
        </p>

        <div className="bg-white rounded-2xl border border-rose-100 p-6 shadow-sm space-y-5 mb-6">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Seed track</label>
            <SearchBar onSelect={setSeed} placeholder="Search for a seed track…" />
            {seed && (
              <p className="mt-2 text-xs text-stone-500">
                Selected: <span className="font-medium text-stone-700">{seed.name}</span> — {seed.artist}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">K (top results to evaluate)</label>
            <div className="flex gap-2">
              {[5, 10, 20].map(val => (
                <button
                  key={val}
                  onClick={() => setK(val)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    k === val ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleEvaluate}
            disabled={!seed || loading}
            className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Inspecting…</> : 'Inspect this seed'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Precision@K"
                value={`${(result.precision_at_k * 100).toFixed(1)}%`}
                description="Fraction of top-K sharing the seed's genre"
              />
              <MetricCard
                label="Single-list coverage"
                value={`${(result.single_list_coverage * 100).toFixed(1)}%`}
                description="Tracks in this list / total catalogue"
              />
              <MetricCard
                label="Diversity"
                value={result.intra_list_diversity.toFixed(3)}
                description="Avg pairwise cosine distance within list"
              />
            </div>

            <div className="bg-white rounded-2xl border border-rose-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-stone-700 mb-4">Metric overview</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid stroke="#fde8e8" strokeDasharray="3 3" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #fecdd3', fontSize: 12 }}
                    formatter={(v) => [`${v}`, '']}
                  />
                  <Bar dataKey="value" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-stone-400 text-center mt-1">Values normalised to percentage scale for display</p>
              <p className="text-xs text-stone-400 text-center mt-3">
                Precision@K uses genre matching and is only a proxy for relevance. One seed does not represent overall model performance.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm text-center">
      <p className="text-xs text-stone-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-rose-600 mb-1">{value}</p>
      <p className="text-[10px] text-stone-400 leading-tight">{description}</p>
    </div>
  );
}
