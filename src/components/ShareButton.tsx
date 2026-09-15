import { useState, useCallback } from 'react';
import { Share2, Check, AlertCircle } from 'lucide-react';

interface ShareButtonProps {
  buildUrl: () => string;
  label: string;
}

export function ShareButton({ buildUrl, label }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleShare = useCallback(async () => {
    const url = buildUrl();
    setStatus('idle');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Bubble', url });
        setStatus('success');
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus('success');
        return;
      } catch {
        // clipboard failed
      }
    }

    setStatus('error');
  }, [buildUrl]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleShare}
        className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
      >
        {status === 'success' ? <Check size={12} /> : status === 'error' ? <AlertCircle size={12} /> : <Share2 size={12} />}
        {label}
      </button>
      {status === 'success' && (
        <p className="text-xs text-stone-500" role="status">Link copied</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-stone-500" role="status">Could not copy link. Please copy the address from your browser.</p>
      )}
    </div>
  );
}
