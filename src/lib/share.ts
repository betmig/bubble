export const APP_VERSION = '2.2.0';

const VALID_METHODS = ['cosine', 'knn', 'hybrid'];
const VALID_PROFILES = ['equal', 'no_danceability', 'affect_emphasis', 'balanced'];
const VALID_DESTINATION_MODES = ['none', 'calm_positive'];
const VALID_VIEWS = ['listener', 'data_science'];

const INVALID_MSG = 'This share link is invalid or incomplete. Try creating a new recommendation.';

export interface ShareParams {
  seed: string;
  preset: string | null;
  method: string;
  profile: string;
  alpha: number;
  destinationMode: string;
  destinationWeight: number;
  mmr: boolean;
  mmrLambda: number;
  candidatePoolSize: number | null;
  k: number;
  view: string;
  v: string;
}

export interface ParsedShare {
  params: ShareParams;
  versionMismatch: boolean;
}

export type ParseResult = { valid: true; data: ParsedShare } | { valid: false; error: string };

export function buildShareUrl(params: ShareParams): string {
  const sp = new URLSearchParams();
  sp.set('seed', params.seed);
  if (params.preset) sp.set('preset', params.preset);
  sp.set('method', params.method);
  sp.set('profile', params.profile);
  sp.set('alpha', params.alpha.toFixed(2));
  sp.set('destination_mode', params.destinationMode);
  sp.set('destination_weight', params.destinationWeight.toFixed(2));
  sp.set('mmr', String(params.mmr));
  sp.set('mmr_lambda', params.mmrLambda.toFixed(2));
  if (params.candidatePoolSize != null) sp.set('candidate_pool_size', String(params.candidatePoolSize));
  sp.set('k', String(params.k));
  sp.set('view', params.view);
  sp.set('v', APP_VERSION);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bubble.app';
  return `${origin}/results?${sp.toString()}`;
}

function parseFloatInRange(str: string | null, min: number, max: number): number {
  if (str === null) return NaN;
  const v = parseFloat(str);
  return isNaN(v) || v < min || v > max ? NaN : v;
}

function parsePositiveInt(str: string | null, max = 10000): number {
  if (str === null) return NaN;
  const v = parseInt(str, 10);
  return isNaN(v) || v < 1 || v > max ? NaN : v;
}

export function parseShareParams(sp: URLSearchParams): ParseResult {
  const seed = sp.get('seed');
  if (!seed || seed.trim() === '') return { valid: false, error: INVALID_MSG };

  const method = sp.get('method');
  if (!method || !VALID_METHODS.includes(method)) return { valid: false, error: INVALID_MSG };

  const profile = sp.get('profile');
  if (!profile || !VALID_PROFILES.includes(profile)) return { valid: false, error: INVALID_MSG };

  const alpha = parseFloatInRange(sp.get('alpha'), 0, 1);
  if (isNaN(alpha)) return { valid: false, error: INVALID_MSG };

  const destinationMode = sp.get('destination_mode');
  if (!destinationMode || !VALID_DESTINATION_MODES.includes(destinationMode)) return { valid: false, error: INVALID_MSG };

  const destinationWeight = parseFloatInRange(sp.get('destination_weight'), 0, 1);
  if (isNaN(destinationWeight)) return { valid: false, error: INVALID_MSG };

  const mmrStr = sp.get('mmr');
  if (mmrStr !== 'true' && mmrStr !== 'false') return { valid: false, error: INVALID_MSG };
  const mmr = mmrStr === 'true';

  const mmrLambda = parseFloatInRange(sp.get('mmr_lambda'), 0, 1);
  if (isNaN(mmrLambda)) return { valid: false, error: INVALID_MSG };

  const poolStr = sp.get('candidate_pool_size');
  let candidatePoolSize: number | null = null;
  if (poolStr !== null) {
    const pool = parsePositiveInt(poolStr);
    if (isNaN(pool)) return { valid: false, error: INVALID_MSG };
    candidatePoolSize = pool;
  }

  const k = parsePositiveInt(sp.get('k'));
  if (isNaN(k)) return { valid: false, error: INVALID_MSG };

  const view = sp.get('view');
  if (!view || !VALID_VIEWS.includes(view)) return { valid: false, error: INVALID_MSG };

  const v = sp.get('v') ?? '';
  const versionMismatch = v !== '' && v !== APP_VERSION;
  const preset = sp.get('preset');

  return {
    valid: true,
    data: {
      params: { seed, preset, method, profile, alpha, destinationMode, destinationWeight, mmr, mmrLambda, candidatePoolSize, k, view, v },
      versionMismatch,
    },
  };
}
