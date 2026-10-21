// On standby for job requests: a freelancer says they're free, for how long
// and how far they'll go. The office only offers them work while it's on.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Cap, Plain, Segmented } from '@/components/ardent';
import { clock } from '@/kit/format';
import * as act from '@/sync/actions';
import { field } from '@/sync/field';
import { useField, useNow } from '@/sync/hooks';
import { demoRequest } from '@/sync/requests';
import { color, font, toneColor } from '@/theme/tokens';

type For = 'off' | '2h' | '4h' | 'day';
const FOR: { key: For; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: '2h', label: '2 hrs' },
  { key: '4h', label: '4 hrs' },
  { key: 'day', label: 'Till 8pm' },
];
const MILES = [
  { key: '5', label: '5 mi' },
  { key: '10', label: '10 mi' },
  { key: '20', label: '20 mi' },
] as const;

/** 8pm UK time today, or two hours on if it's already later than that. */
function eveningUntil(now: number) {
  const ukHour = Number(new Date(now).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }));
  const ukMin = Number(new Date(now).toLocaleString('en-GB', { minute: '2-digit', timeZone: 'Europe/London' }));
  const mins = (20 - ukHour) * 60 - ukMin;
  return now + (mins > 30 ? mins : 120) * 60_000;
}

export function StandbyCard() {
  const { state, day } = useField();
  const now = useNow(true, 30_000);
  const [miles, setMiles] = useState<string>(String(day?.operator.standby?.radius ?? 10));
  const [chose, setChose] = useState<For>();
  const [tried, setTried] = useState<string>();
  const [trying, setTrying] = useState(false);
  if (!day) return null;
  const sb = day.operator.standby;
  const on = !!sb && Date.parse(sb.until) > now;

  const pick = (k: For) => {
    setChose(k);
    if (k === 'off') return void act.setStandby(null);
    const until = k === 'day' ? eveningUntil(now) : now + (k === '2h' ? 2 : 4) * 3_600_000;
    const at = day.operator.location;
    void act.setStandby({ until: new Date(until).toISOString(), radius: Number(miles), ...(at ? { base: { lat: at.lat, lng: at.lng } } : {}) });
  };
  const changeMiles = (m: string) => {
    setMiles(m);
    if (on) void act.setStandby({ until: sb!.until, radius: Number(m) });
  };
  const tryIt = async () => {
    setTrying(true);
    setTried(await demoRequest().catch((e) => (e as Error).message));
    setTrying(false);
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.top}>
        <Cap>Standby</Cap>
        <Cap tint={on ? toneColor.ok : color.fgFaint}>{on ? `On till ${clock(sb!.until)}` : 'Off'}</Cap>
      </View>
      <Text style={styles.body}>{on ? `The office can send you job requests within ${sb!.radius} miles. Each one shows for 45 seconds: hold to take it.` : 'Go on standby and the office can send you job requests near you.'}</Text>
      <Segmented label="Standby for" options={FOR} value={on ? (chose === 'off' ? undefined : chose) : 'off'} onChange={pick} />
      <Segmented label="How far you'll go" options={MILES as unknown as { key: string; label: string }[]} value={miles} onChange={changeMiles} />
      {state.mode === 'demo' && (
        <>
          <Plain title={trying ? 'Sending' : 'Try it: send me a job request'} icon="signal" onPress={() => void tryIt()} disabled={trying} />
          {tried && <Text style={[styles.body, { color: color.warn }]}>Not offered to you: {tried}.</Text>}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
});
