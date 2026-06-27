import type { RecommendedTrack, SeedTrack } from '../api/client';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { QUADRANT_COLORS } from '../lib/constants';

interface Props {
  seed: SeedTrack;
  recommendations: RecommendedTrack[];
}

interface TooltipPayload {
  name: string;
  artist: string;
  valence: number;
  energy: number;
  intimacy_score: number;
  isSeed?: boolean;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TooltipPayload }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-rose-100 rounded-xl p-3 shadow-lg text-xs max-w-[180px]">
      <p className="font-semibold text-stone-800 truncate">{d.name}</p>
      <p className="text-stone-500 truncate">{d.artist}</p>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-stone-600">Valence: <span className="font-medium">{(d.valence * 100).toFixed(0)}</span></p>
        <p className="text-stone-600">Energy: <span className="font-medium">{(d.energy * 100).toFixed(0)}</span></p>
        <p className="text-stone-600">Intimacy: <span className="font-medium text-rose-600">{(d.intimacy_score * 100).toFixed(0)}</span></p>
      </div>
    </div>
  );
}

export function EmotionMap({ seed, recommendations }: Props) {
  const seedPoint = {
    valence: seed.features.valence,
    energy: seed.features.energy,
    name: seed.name,
    artist: seed.artist,
    intimacy_score: seed.features.intimacy_score,
    isSeed: true,
  };

  const recPoints = recommendations.map(r => ({
    valence: r.valence,
    energy: r.energy,
    name: r.track_name,
    artist: r.artist_name,
    intimacy_score: r.intimacy_score,
    quadrant: r.quadrant,
    isSeed: false,
  }));

  return (
    <div className="relative">
      {/* Quadrant labels */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ padding: '36px 16px 32px 48px' }}>
        <div className="relative w-full h-full">
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-amber-500 font-medium tracking-wide">HAPPY / EXCITED</span>
          <span className="absolute top-1 right-0 text-[10px] text-red-400 font-medium tracking-wide">ANGRY / TENSE</span>
          <span className="absolute bottom-1 left-0 text-[10px] text-indigo-400 font-medium tracking-wide">SAD / MELANCHOLIC</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-rose-500 font-medium tracking-wide">TENDER / WARM ✦</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 36, right: 20, bottom: 32, left: 48 }}>
          <CartesianGrid stroke="#fde8e8" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="valence"
            domain={[0, 1]}
            name="Valence"
            label={{ value: 'Valence  (Sad → Happy)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#9f6b5c' }}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="energy"
            domain={[0, 1]}
            name="Energy"
            label={{ value: 'Energy', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#9f6b5c' }}
            tick={{ fontSize: 10 }}
          />
          <ReferenceLine x={0.5} stroke="#fda4af" strokeDasharray="4 4" />
          <ReferenceLine y={0.5} stroke="#fda4af" strokeDasharray="4 4" />
          <Tooltip content={<CustomTooltip />} />

          {/* Recommendations */}
          <Scatter data={recPoints} name="Recommendations">
            {recPoints.map((p, i) => (
              <Cell key={i} fill={QUADRANT_COLORS[p.quadrant] ?? '#94a3b8'} fillOpacity={0.8} />
            ))}
          </Scatter>

          {/* Seed */}
          <Scatter data={[seedPoint]} name="Seed" shape="star">
            {[seedPoint].map((_, i) => (
              <Cell key={i} fill="#f43f5e" r={10} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-3 justify-center mt-2">
        <div className="flex items-center gap-1.5 text-xs text-stone-600">
          <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span> Seed track
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-600">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span> Q1 Happy
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-600">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span> Q2 Tense
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-600">
          <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block"></span> Q3 Sad
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-600">
          <span className="w-3 h-3 rounded-full bg-pink-400 inline-block"></span> Q4 Tender
        </div>
      </div>
    </div>
  );
}
