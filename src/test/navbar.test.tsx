import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecommendationProvider } from '../context/RecommendationContext';
import { Navbar } from '../components/Navbar';

function renderNavbarAt(path: string, mode: 'data-science' | 'listener') {
  localStorage.setItem('bubble-ui-mode', mode);
  return render(
    <RecommendationProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Navbar />} />
        </Routes>
      </MemoryRouter>
    </RecommendationProvider>
  );
}

describe('Navbar evaluation visibility', () => {
  it('shows Diagnostics nav in Data Science mode', () => {
    renderNavbarAt('/', 'data-science');
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('hides Diagnostics nav in Listener mode', () => {
    renderNavbarAt('/', 'listener');
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });
});
