/**
 * Where the van is, for the office's emergency callouts. Only while the
 * engineer is on shift, only if they said yes, and only while Field is open:
 * a reading every few minutes or few hundred metres, whichever comes first.
 * Off shift nothing is read, and the engine forgets the last reading.
 */
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { shareLocation } from './actions';
import { useField } from './hooks';

const EVERY_MS = 3 * 60 * 1000;
const EVERY_METRES = 300;

export function useVanLocation() {
  const { state, day } = useField();
  const on = state.phase === 'signed_in' && state.shareLocation === true && !!day && day.operator.state !== 'off_shift';

  useEffect(() => {
    if (!on) return;
    let stop: (() => void) | undefined;
    let live = true;
    const send = (p: Location.LocationObject) =>
      void shareLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? undefined, at: new Date(p.timestamp).toISOString() }).catch(() => undefined);
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted || !live) return;
      const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: EVERY_MS, distanceInterval: EVERY_METRES }, send);
      if (live) stop = () => sub.remove();
      else sub.remove();
    })().catch(() => undefined);
    return () => {
      live = false;
      stop?.();
    };
  }, [on]);
}
