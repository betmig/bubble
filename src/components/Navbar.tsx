import { Link, useLocation } from 'react-router-dom';
import { Music2 } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Discover' },
  { to: '/evaluation', label: 'Evaluate' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-rose-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-rose-600 tracking-tight">
          <Music2 size={20} />
          <span className="text-lg">Bubble</span>
        </Link>
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
