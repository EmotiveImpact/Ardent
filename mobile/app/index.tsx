import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { ukDay } from '@/kit/format';
import { useField } from '@/sync/hooks';
import { color } from '@/theme/tokens';

/**
 * Where the app opens: sign-in if nobody is signed in, the mode picker for the
 * first launch of the day, otherwise straight to today. Someone mid-job goes
 * straight back to it.
 */
export default function Index() {
  const { state, day } = useField();
  if (state.phase === 'starting') return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (state.phase === 'signed_out') return <Redirect href="/sign-in" />;
  const midJob = day && (day.operator.state === 'en_route' || day.operator.state === 'on_site');
  if (!midJob && state.startedOn !== ukDay(new Date().toISOString())) return <Redirect href="/start" />;
  return <Redirect href="/today" />;
}
