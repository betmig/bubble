import { describe, it, expect } from 'vitest';
import { buildShareUrl, parseShareParams, APP_VERSION, type ShareParams } from '../lib/share';

const validParams: ShareParams = {
  seed: 'track123',
  preset: 'close',
  method: 'hybrid',
  profile: 'balanced',
  alpha: 0.90,
  destinationMode: 'none',
  destinationWeight: 0.30,
  mmr: false,
  mmrLambda: 0.90,
  candidatePoolSize: 100,
  k: 10,
  view: 'listener',
  v: APP_VERSION,
};

function shareUrlToParams(url: string): URLSearchParams {
  const qIndex = url.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
}

function overrideParam(url: string, key: string, value: string): URLSearchParams {
  const sp = shareUrlToParams(url);
  sp.set(key, value);
  return sp;
}

describe('buildShareUrl', () => {
  it('contains seed and all settings', () => {
    const url = buildShareUrl(validParams);
    expect(url).toContain('seed=track123');
    expect(url).toContain('preset=close');
    expect(url).toContain('method=hybrid');
    expect(url).toContain('profile=balanced');
    expect(url).toContain('alpha=0.90');
    expect(url).toContain('destination_mode=none');
    expect(url).toContain('destination_weight=0.30');
    expect(url).toContain('mmr=false');
    expect(url).toContain('mmr_lambda=0.90');
    expect(url).toContain('candidate_pool_size=100');
    expect(url).toContain('k=10');
    expect(url).toContain('view=listener');
    expect(url).toContain(`v=${APP_VERSION}`);
  });

  it('does not include titles, artists, or personal data', () => {
    const url = buildShareUrl(validParams);
    expect(url).not.toContain('title');
    expect(url).not.toContain('artist');
    expect(url).not.toContain('name');
    expect(url).not.toContain('email');
    expect(url).not.toContain('localStorage');
  });

  it('uses window.location.origin as the base', () => {
    const url = buildShareUrl(validParams);
    expect(url.startsWith(window.location.origin)).toBe(true);
    expect(url).toContain('/results?');
  });

  it('omits candidate_pool_size when null', () => {
    const url = buildShareUrl({ ...validParams, candidatePoolSize: null });
    expect(url).not.toContain('candidate_pool_size');
  });
});

describe('parseShareParams', () => {
  it('parses a valid URL', () => {
    const sp = shareUrlToParams(buildShareUrl(validParams));
    const result = parseShareParams(sp);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.params.seed).toBe('track123');
      expect(result.data.params.method).toBe('hybrid');
      expect(result.data.params.alpha).toBe(0.90);
      expect(result.data.params.k).toBe(10);
      expect(result.data.versionMismatch).toBe(false);
    }
  });

  it('returns invalid for missing seed', () => {
    const sp = new URLSearchParams({ method: 'hybrid', profile: 'balanced' });
    const result = parseShareParams(sp);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('invalid');
    }
  });

  it('returns invalid for invalid method', () => {
    const sp = overrideParam(buildShareUrl(validParams), 'method', 'invalid');
    const result = parseShareParams(sp);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for out-of-range alpha', () => {
    const sp = overrideParam(buildShareUrl(validParams), 'alpha', '1.5');
    const result = parseShareParams(sp);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for non-integer k', () => {
    const sp = overrideParam(buildShareUrl(validParams), 'k', 'abc');
    const result = parseShareParams(sp);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for invalid view mode', () => {
    const sp = overrideParam(buildShareUrl(validParams), 'view', 'admin');
    const result = parseShareParams(sp);
    expect(result.valid).toBe(false);
  });

  it('detects version mismatch', () => {
    const sp = overrideParam(buildShareUrl(validParams), 'v', '1.0.0');
    const result = parseShareParams(sp);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.versionMismatch).toBe(true);
    }
  });

  it('round-trips: build then parse yields same values', () => {
    const sp = shareUrlToParams(buildShareUrl(validParams));
    const result = parseShareParams(sp);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const p = result.data.params;
      expect(p.seed).toBe(validParams.seed);
      expect(p.method).toBe(validParams.method);
      expect(p.profile).toBe(validParams.profile);
      expect(p.alpha).toBeCloseTo(validParams.alpha);
      expect(p.destinationMode).toBe(validParams.destinationMode);
      expect(p.destinationWeight).toBeCloseTo(validParams.destinationWeight);
      expect(p.mmr).toBe(validParams.mmr);
      expect(p.mmrLambda).toBeCloseTo(validParams.mmrLambda);
      expect(p.candidatePoolSize).toBe(validParams.candidatePoolSize);
      expect(p.k).toBe(validParams.k);
      expect(p.view).toBe(validParams.view);
    }
  });
});
