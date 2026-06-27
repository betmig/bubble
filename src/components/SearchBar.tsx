import { useState, useEffect, useRef } from 'react';
import { searchTracks, type TrackSearchResult } from '../api/client';
import { Search, Loader2 } from 'lucide-react';

interface Props {
  onSelect: (track: TrackSearchResult) => void;
  placeholder?: string;
}

export function SearchBar({ onSelect, placeholder = 'Search for a song or artist…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await searchTracks(query);
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setError('Could not reach the API. Is the backend running?');
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(track: TrackSearchResult) {
    setQuery(`${track.name} — ${track.artist}`);
    setOpen(false);
    onSelect(track);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-3 bg-white border-2 border-rose-200 rounded-2xl px-4 py-3 shadow-md focus-within:border-rose-400 transition-colors">
        {loading ? (
          <Loader2 size={18} className="text-rose-400 animate-spin shrink-0" />
        ) : (
          <Search size={18} className="text-rose-400 shrink-0" />
        )}
        <input
          className="flex-1 bg-transparent outline-none text-stone-800 placeholder:text-stone-400 text-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500 px-1">{error}</p>
      )}

      {open && (
        <ul className="absolute z-50 mt-2 w-full bg-white border border-rose-100 rounded-xl shadow-lg overflow-hidden">
          {results.map(track => (
            <li key={track.id}>
              <button
                onMouseDown={() => handleSelect(track)}
                className="w-full text-left px-4 py-3 hover:bg-rose-50 transition-colors"
              >
                <p className="text-sm font-medium text-stone-800">{track.name}</p>
                <p className="text-xs text-stone-500">{track.artist}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
