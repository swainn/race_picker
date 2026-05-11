import { useEffect, useRef, useState } from 'react';

export type WinnerPhase = 'hidden' | 'expanded' | 'minimized';

interface UseWinnerLifecycleArgs {
  show: boolean;
  autoMinimizeMs: number;
  onMinimize?: () => void;
}

interface WinnerLifecycle {
  phase: WinnerPhase;
  minimize: () => void;
  expand: () => void;
}

export function useWinnerLifecycle({
  show,
  autoMinimizeMs,
  onMinimize,
}: UseWinnerLifecycleArgs): WinnerLifecycle {
  const [phase, setPhase] = useState<WinnerPhase>('hidden');
  const onMinimizeRef = useRef(onMinimize);
  onMinimizeRef.current = onMinimize;

  const minimizedFiredRef = useRef(false);

  useEffect(() => {
    if (!show) {
      setPhase('hidden');
      minimizedFiredRef.current = false;
      return;
    }
    setPhase('expanded');
    minimizedFiredRef.current = false;
    const handle = window.setTimeout(() => {
      setPhase((current) => (current === 'expanded' ? 'minimized' : current));
    }, autoMinimizeMs);
    return () => window.clearTimeout(handle);
  }, [show, autoMinimizeMs]);

  useEffect(() => {
    if (phase === 'minimized' && !minimizedFiredRef.current) {
      minimizedFiredRef.current = true;
      onMinimizeRef.current?.();
    }
  }, [phase]);

  const minimize = () => {
    setPhase((current) => (current === 'expanded' ? 'minimized' : current));
  };

  const expand = () => {
    setPhase((current) => (current === 'minimized' ? 'expanded' : current));
  };

  return { phase, minimize, expand };
}
