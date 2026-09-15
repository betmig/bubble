import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareButton } from '../components/ShareButton';

describe('ShareButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.share when available', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true, writable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, configurable: true, writable: true });

    render(<ShareButton buildUrl={() => 'https://example.com/results?seed=123'} label="Share this discovery" />);
    fireEvent.click(screen.getByText('Share this discovery'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledOnce());
  });

  it('falls back to clipboard when Web Share API is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true, writable: true });

    render(<ShareButton buildUrl={() => 'https://example.com/results?seed=123'} label="Share this discovery" />);
    fireEvent.click(screen.getByText('Share this discovery'));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
  });

  it('shows error when both share and clipboard fail', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });

    render(<ShareButton buildUrl={() => 'https://example.com/results?seed=123'} label="Share this discovery" />);
    fireEvent.click(screen.getByText('Share this discovery'));
    await waitFor(() => expect(screen.getByText('Could not copy link. Please copy the address from your browser.')).toBeInTheDocument());
  });

  it('handles rejected share dialog gracefully', async () => {
    const shareSpy = vi.fn().mockRejectedValue(new DOMException('Abort'));
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true, writable: true });
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true, writable: true });

    render(<ShareButton buildUrl={() => 'https://example.com/results?seed=123'} label="Share this discovery" />);
    fireEvent.click(screen.getByText('Share this discovery'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledOnce());
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledOnce());
  });
});
