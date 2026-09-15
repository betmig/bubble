import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { RecommendResponse, TrackSearchResult } from '../api/client';

export type UIMode = 'data-science' | 'listener';
export type ListenerPreference = 'close' | 'variety' | 'calm';

interface RecommendationSession {
  seedTrack: TrackSearchResult | null;
  result: RecommendResponse | null;
  listenerPreference: ListenerPreference | null;
  loading: boolean;
  error: string;
}

interface RecommendationContextValue {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
  session: RecommendationSession;
  setSeedTrack: (track: TrackSearchResult | null) => void;
  setResult: (result: RecommendResponse | null) => void;
  setListenerPreference: (pref: ListenerPreference | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  clearSession: () => void;
}

const RecommendationContext = createContext<RecommendationContextValue | null>(null);

const MODE_STORAGE_KEY = 'bubble-ui-mode';
const SESSION_STORAGE_KEY = 'bubble-recommendation-session';

const DEFAULT_SESSION: RecommendationSession = {
  seedTrack: null,
  result: null,
  listenerPreference: null,
  loading: false,
  error: '',
};

function loadMode(): UIMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === 'data-science' || stored === 'listener') return stored;
  } catch {
    // localStorage not available or malformed — default
  }
  return 'data-science';
}

function loadSession(): RecommendationSession {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return DEFAULT_SESSION;
    const parsed = JSON.parse(stored);
    // Validate shape; clear if malformed/stale
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'seedTrack' in parsed &&
      'result' in parsed
    ) {
      return {
        seedTrack: parsed.seedTrack ?? null,
        result: parsed.result ?? null,
        listenerPreference: parsed.listenerPreference ?? null,
        loading: false,
        error: '',
      };
    }
  } catch {
    // Malformed — fall through to default
  }
  localStorage.removeItem(SESSION_STORAGE_KEY);
  return DEFAULT_SESSION;
}

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UIMode>(loadMode);
  const [session, setSession] = useState<RecommendationSession>(loadSession);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  useEffect(() => {
    try {
      if (session.result || session.seedTrack) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          seedTrack: session.seedTrack,
          result: session.result,
          listenerPreference: session.listenerPreference,
        }));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [session.seedTrack, session.result, session.listenerPreference]);

  const setMode = useCallback((m: UIMode) => setModeState(m), []);

  const updateSession = useCallback((patch: Partial<RecommendationSession>) => {
    setSession(prev => ({ ...prev, ...patch }));
  }, []);

  const setSeedTrack = useCallback((track: TrackSearchResult | null) => {
    updateSession({ seedTrack: track });
  }, [updateSession]);

  const setResult = useCallback((result: RecommendResponse | null) => {
    updateSession({ result });
  }, [updateSession]);

  const setListenerPreference = useCallback((pref: ListenerPreference | null) => {
    updateSession({ listenerPreference: pref });
  }, [updateSession]);

  const setLoading = useCallback((loading: boolean) => {
    updateSession({ loading });
  }, [updateSession]);

  const setError = useCallback((error: string) => {
    updateSession({ error });
  }, [updateSession]);

  const clearSession = useCallback(() => {
    setSession(DEFAULT_SESSION);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <RecommendationContext.Provider value={{
      mode, setMode,
      session, setSeedTrack, setResult, setListenerPreference,
      setLoading, setError, clearSession,
    }}>
      {children}
    </RecommendationContext.Provider>
  );
}

export function useRecommendation(): RecommendationContextValue {
  const ctx = useContext(RecommendationContext);
  if (!ctx) throw new Error('useRecommendation must be used within RecommendationProvider');
  return ctx;
}

export function getListenerPreset(preference: ListenerPreference) {
  switch (preference) {
    case 'close':
      return {
        method: 'hybrid' as const,
        alpha: 0.90,
        feature_weight_profile: 'balanced' as const,
        destination_mode: 'none' as const,
        apply_mmr: false,
        mmr_lambda: 0.90,
      };
    case 'variety':
      return {
        method: 'hybrid' as const,
        alpha: 0.85,
        feature_weight_profile: 'balanced' as const,
        destination_mode: 'none' as const,
        apply_mmr: false,
        mmr_lambda: 0.90,
      };
    case 'calm':
      return {
        method: 'hybrid' as const,
        alpha: 0.90,
        feature_weight_profile: 'balanced' as const,
        destination_mode: 'calm_positive' as const,
        destination_weight: 0.3,
        apply_mmr: false,
        mmr_lambda: 0.90,
      };
  }
}
