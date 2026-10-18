import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { ardent } from '@/data/client';
import type { DaySummary, Engineer, EngineerState, OperatorMode } from '@/data/types';

interface OperatorState {
  me?: Engineer;
  summary?: DaySummary;
  mode: OperatorMode;
  setMode: (mode: OperatorMode) => void;
}

const Ctx = createContext<OperatorState | null>(null);

// Starting mode from what Core says the engineer is doing right now.
const FROM_STATE: Record<EngineerState, OperatorMode> = {
  on_site: 'on_site',
  en_route: 'en_route',
  delayed: 'en_route',
  available: 'on_call',
  off: 'off_shift',
};

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Engineer>();
  const [summary, setSummary] = useState<DaySummary>();
  const [mode, setMode] = useState<OperatorMode>('on_site');

  useEffect(() => {
    ardent.getMe().then((e) => {
      setMe(e);
      setMode(FROM_STATE[e.state]);
    });
    ardent.getDaySummary().then(setSummary);
  }, []);

  return <Ctx.Provider value={{ me, summary, mode, setMode }}>{children}</Ctx.Provider>;
}

export function useOperator() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOperator must be used inside OperatorProvider');
  return v;
}
