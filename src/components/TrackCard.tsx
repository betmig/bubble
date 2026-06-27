import type { RecommendedTrack } from '../api/client';
import { QUADRANT_BG, QUADRANT_LABELS } from '../lib/constants';
import { Heart, Zap } from 'lucide-react';

interface Props {
  track: RecommendedTrack;
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function TrackCard({ track }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-800 truncate">{track.track_name}</p>
          <p className="text-xs text-stone-500 truncate">{track.artist_name}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-stone-400">#{track.rank}</span>
      </div>

      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-3 ${QUADRANT_BG[track.quadrant] ?? 'bg-stone-100 text-stone-600'}`}>
        {track.quadrant} · {QUADRANT_LABELS[track.quadrant] ?? track.quadrant}
      </span>

      <div className="flex gap-2 mb-3">
        <span className="flex items-center gap-1 text-xs bg-rose-50 text-rose-700 px-2 py-1 rounded-lg font-medium">
          <Heart size={11} /> {(track.similarity_score * 100).toFixed(0)}%
        </span>
        <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg font-medium">
          <Zap size={11} /> {(track.intimacy_score * 100).toFixed(0)}%
        </span>
        {track.genre && (
          <span className="text-xs bg-stone-100 text-stone-500 px-2 py-1 rounded-lg font-medium truncate max-w-[80px]">
            {track.genre}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-400 w-12 shrink-0">Valence</span>
          <MiniBar value={track.valence} color="bg-rose-400" />
          <span className="text-[10px] text-stone-400 w-6 text-right">{(track.valence * 100).toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-400 w-12 shrink-0">Energy</span>
          <MiniBar value={track.energy} color="bg-amber-400" />
          <span className="text-[10px] text-stone-400 w-6 text-right">{(track.energy * 100).toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-400 w-12 shrink-0">Acoustic</span>
          <MiniBar value={track.acousticness} color="bg-emerald-400" />
          <span className="text-[10px] text-stone-400 w-6 text-right">{(track.acousticness * 100).toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
