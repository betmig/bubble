import { Link, useLocation } from 'react-router-dom';
import { Music2, FlaskConical, Ear } from 'lucide-react';
import { useRecommendation } from '../context/RecommendationContext';

const NAV = [
  { to: '/', label: 'Discover' },
  { to: '/evaluation', label: 'Evaluate' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const { mode, setMode } = useRecommendation();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-rose-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-rose-600 tracking-tight shrink-0">
          <Music2 size={20} />
          <span className="text-lg">Bubble</span>
        </Link>

        {/* Mode toggle */}
        <div
          role="radiogroup"
          aria-label="Interface mode"
          className="flex items-center bg-stone-100 rounded-full p-0.5 shrink-0"
        >
          <button
            role="radio"
            aria-checked={mode === 'data-science'}
            onClick={() => setMode('data-science')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
              mode === 'data-science'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <FlaskConical size={12} />
            <span className="hidden sm:inline">Data Science</span>
          </button>
          <button
            role="radio"
            aria-checked={mode === 'listener'}
            onClick={() => setMode('listener')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
              mode === 'listener'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Ear size={12} />
            <span className="hidden sm:inline">Listener</span>
          </button>
        </div>

        <nav className="flex items-center gap-1 ml-auto">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                pathname === to
                  ? 'bg-rose-100 text-rose-700 font-medium'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
