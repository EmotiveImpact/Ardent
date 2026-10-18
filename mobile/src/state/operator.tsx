import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { ardent } from '@/data/client';
import type { DaySummary, Operator, OperatorMode } from '@/data/types';

interface OperatorState {
  operator?: Operator;
  summary?: DaySummary;
  mode: OperatorMode;
  setMode: (mode: OperatorMode) => void;
}

const Ctx = createContext<OperatorState | null>(null);

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<Operator>();
  const [summary, setSummary] = useState<DaySummary>();
  const [mode, setLocalMode] = useState<OperatorMode>('on_site');

  useEffect(() => {
    ardent.getOperator().then((o) => {
      setOperator(o);
      setLocalMode(o.mode);
    });
    ardent.getDaySummary().then(setSummary);
  }, []);

  // Optimistic: the screen moves straight away, Core catches up behind it.
  const setMode = useCallback((next: OperatorMode) => {
    setLocalMode(next);
    ardent.setMode(next).then(setOperator).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ operator, summary, mode, setMode }}>{children}</Ctx.Provider>;
}

export function useOperator() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOperator must be used inside OperatorProvider');
  return v;
}
