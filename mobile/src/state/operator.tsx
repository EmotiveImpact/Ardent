import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { ardent, daySummary } from '@/data/client';
import type { DaySummary, Operator, OperatorMode } from '@/data/types';

interface OperatorState {
  me?: Operator;
  summary?: DaySummary;
  mode: OperatorMode;
  setMode: (mode: OperatorMode) => void;
  /** Re-read the day's numbers after something changed them. */
  refresh: () => void;
}

const Ctx = createContext<OperatorState | null>(null);

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Operator>();
  const [summary, setSummary] = useState<DaySummary>();
  const [mode, setLocalMode] = useState<OperatorMode>('on_site');

  useEffect(() => {
    ardent.operators.me().then((o) => {
      setMe(o);
      // Dispatch marks a late operator 'delayed'; on the phone they are still en route.
      setLocalMode(o.state === 'delayed' ? 'en_route' : o.state);
      daySummary(o).then(setSummary);
    });
  }, []);

  // Optimistic: the screen moves straight away, Core catches up behind it.
  const setMode = useCallback(
    (next: OperatorMode) => {
      setLocalMode(next);
      if (me) ardent.operators.setState(me.id, next).then(setMe).catch(() => {});
    },
    [me],
  );

  const refresh = useCallback(() => {
    if (me) daySummary(me).then(setSummary);
  }, [me]);

  return <Ctx.Provider value={{ me, summary, mode, setMode, refresh }}>{children}</Ctx.Provider>;
}

export function useOperator() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOperator must be used inside OperatorProvider');
  return v;
}
