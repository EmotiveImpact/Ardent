import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Chip, Go, Line, OpTitle, Plain, Radio, Section, Segmented, Stat, Stepper, TopRow } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Icon } from '@/components/Icon';
import { Back, Dock, Input } from '@/components/ui';
import type { Job, JobReport, ReportLine, ReportPart, ReportSegment, ReportSource, ReportTick, ReportTopic } from '@/data/types';
import { clock } from '@/kit/format';
import { buildReport, cantSign, coveredSoFar, keepFixes, needed, pickedPart, promptsFor, TICKS, tradeWords } from '@/kit/report';
import * as act from '@/sync/actions';
import { useField } from '@/sync/hooks';
import { GAS_TRADES } from '@/sync/pull';
import { color, font, radius, space } from '@/theme/tokens';
import { useListen } from '@/voice/listen';

type Step = 'what' | 'talk' | 'check' | 'signed';

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(type).catch(() => {});
};

// A browser preview can't use a phone's recogniser, so holding plays what an engineer might say instead.
const SAMPLE: Partial<Record<Job['trade'], Partial<Record<ReportTopic, string>>>> = {
  electrical: {
    work: 'Swapped the old fuse board for a ten-way dual RCD unit. Added two thirty-two amp breakers for the kitchen and the shower circuit.',
    parts: 'Took the board and the breakers off the van, plus about two metres of two point five mil twin and earth.',
    tests: "Tested everything. Zs on the shower's nought point three eight, RCDs tripping at twenty-two and twenty-five milliseconds, insulation's over two hundred meg on all circuits.",
    left: "One thing, the bathroom light's got no earth at the fitting. I've left it as it was and told her.",
    next: 'She wants a quote for an extra socket in the garage.',
  },
  plumbing: {
    work: 'Leak under the kitchen sink. The cold feed isolation valve was weeping so I swapped it for a new fifteen mil isolating valve off the van.',
    tests: 'Turned the water back on, no leaks.',
    left: 'Nothing left to do.',
    next: 'Told her to keep an eye on the cupboard for a day or two.',
  },
  gas: {
    work: 'Serviced the boiler and cleaned the condensate trap.',
    tests: 'Working pressure twenty millibar, tightness test passed. CO2 nine point two percent, ratio nought point nought nought zero four.',
    left: 'Nothing left to do.',
    next: 'She wants us back to look at the radiators upstairs.',
  },
};
const BARS = 36;
/** The end of what they've said, so the newest words are always on screen. */
const tail = (text: string) => (text.length > 150 ? `…${text.slice(-150).replace(/^\S*\s/, '')}` : text);

/** Bars scroll in from the right as they talk: louder is taller. The newest few are dimmer. */
function Wave({ bars, live }: { bars: number[]; live: boolean }) {
  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((h, i) => (
        <View key={i} style={[styles.bar, { height: 6 + h * 46, opacity: live ? (i > BARS - 6 ? 0.45 : 1) : 0.35 }]} />
      ))}
    </View>
  );
}

const sampleFor = (trade: Job['trade']) => SAMPLE[trade] ?? SAMPLE[trade === 'heating' ? 'gas' : 'plumbing']!;
/** What a preview engineer says for one question, or something general when the trade has nothing for it. */
const sampleOn = (trade: Job['trade'], topic: ReportTopic) => sampleFor(trade)[topic] ?? 'Used a few bits off the van.';

/** The words a line or part came from, as said. */
const saidFor = (segments: ReportSegment[], from: ReportSource) => {
  const t = segments[from.segment]?.text ?? '';
  return { before: t.slice(0, from.start), it: t.slice(from.start, from.end), after: t.slice(from.end) };
};

export default function JobReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { day } = useField();
  const job = day?.jobs.find((j) => j.id === id);
  const mine = day && job ? day.reports.filter((r) => r.jobId === job.id && r.operatorId === day.operator.id) : [];
  const report: JobReport | undefined = mine.find((r) => r.status === 'draft') ?? mine.find((r) => r.status === 'signed');

  const [step, setStep] = useState<Step>(() => (report?.status === 'signed' ? 'signed' : report?.segments.length ? 'check' : report?.ticked ? 'talk' : 'what'));
  const [ticks, setTicks] = useState<ReportTick[]>(() => report?.ticked ?? []);
  const [picking, setPicking] = useState(false);
  const [other, setOther] = useState('');
  /** Which ticked question they're on. */
  const [qi, setQi] = useState(0);
  const words = useMemo(() => (day && job ? tradeWords({ trade: job.trade, priceList: day.priceList, van: day.stock }) : []), [day?.priceList, day?.stock, job?.trade]);
  const ear = useListen(words);
  const preview = Platform.OS === 'web' && ear.hearing !== 'listening';
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState<string>();
  const [editing, setEditing] = useState<{ segment: number; text: string }>();
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);

  // Preview playback: the next sample sentence appears a word at a time while held.
  const [demo, setDemo] = useState('');
  const demoTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(demoTimer.current), []);

  // The waveform and the clock while they talk.
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [elapsed, setElapsed] = useState(0);
  const level = useRef(0);
  level.current = demo ? 0.2 + Math.random() * 0.8 : ear.level;
  const heldSince = useRef(0);

  const pulse = useSharedValue(1);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));
  const listening = ear.hearing === 'listening' || !!demo;
  useEffect(() => {
    if (listening) pulse.value = withRepeat(withTiming(1.5, { duration: 1100 }), -1, false);
    else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [listening, pulse]);
  useEffect(() => {
    if (!listening) return;
    heldSince.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => {
      setBars((b) => [...b.slice(1), Math.max(0.08, level.current)]);
      setElapsed(Math.floor((Date.now() - heldSince.current) / 1000));
    }, 90);
    return () => clearInterval(t);
  }, [listening]);

  if (!day || !job) return <View style={styles.root} />;
  const segments = report?.segments ?? [];
  const allPrompts = promptsFor(job.trade);
  // Once they've ticked what happened, only what the ticks need is asked for.
  const prompts = report?.ticked ? allPrompts.filter((p) => needed(report.ticked!).includes(p.topic)) : allPrompts;
  const title = (t: string) => allPrompts.find((p) => p.topic === t)!.title;
  const input = (segs: ReportSegment[]) => ({ segments: segs, trade: job.trade, priceList: day.priceList, van: day.stock });
  const live = demo || ear.live;
  const covered = coveredSoFar(input(live ? [...segments, { text: live, at: new Date().toISOString() }] : segments));
  // Once they've ticked, each ticked thing is its own question, one at a time.
  const asking = report?.ticked ? needed(report.ticked) : undefined;
  const asked = asking?.[Math.min(qi, asking.length - 1)];
  const askedPrompt = asked ? allPrompts.find((p) => p.topic === asked)! : undefined;
  const answer = asked ? segments.filter((g) => g.topic === asked).at(-1) : segments.at(-1);
  const samples = Object.values(sampleFor(job.trade));
  const nextSample = asked ? sampleOn(job.trade, asked) : samples[segments.length % samples.length];
  const lastQuestion = !!asking && qi >= asking.length - 1;
  const nextQuestion = () => {
    if (!lastQuestion) return setQi(qi + 1);
    setStep('check');
    if (asking?.includes('parts')) setPicking(true);
  };
  const ask = (t: ReportTopic) => {
    const i = asking?.indexOf(t) ?? -1;
    if (i >= 0) setQi(i);
    setStep('talk');
  };
  const site = day.sites.find((x) => x.id === job.siteId);
  const gasJob = GAS_TRADES.has(job.trade);
  const gasRecord = day.gasRecords.find((r) => r.jobId === job.id);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      setWarn('');
      await fn();
    } catch (e) {
      setWarn(String((e as Error).message ?? e));
      buzz(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setBusy(false);
    }
  };

  /** Save new words, keeping any fixes already made to the parts. */
  const save = (segs: ReportSegment[]) => {
    const parts = report ? keepFixes(buildReport(input(segs)).parts, report.parts) : undefined;
    return act.saveReport(job, segs, parts);
  };
  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    void run(() => save([...segments, { text: t, at: new Date().toISOString(), ...(asked ? { topic: asked } : {}) }]));
  };
  const fix = (i: number, change: Partial<ReportPart>) => report && run(() => act.saveReport(job, report.segments, report.parts.map((p, j) => (j === i ? { ...p, ...change } : p))));
  const drop = (i: number) => report && run(() => act.saveReport(job, report.segments, report.parts.filter((_, j) => j !== i)));
  /** A part from the van list: one more of it if it's already there. */
  const pick = (itemId: string) => {
    if (!report) return;
    const item = day.priceList.find((x) => x.id === itemId);
    if (!item) return;
    const at = report.parts.findIndex((p) => p.itemId === itemId);
    if (at >= 0) return fix(at, { quantity: report.parts[at].quantity + 1, quantitySaid: true });
    void run(() => act.saveReport(job, report.segments, [...report.parts, pickedPart(item, '', true)]));
  };
  const typePart = () => {
    const text = other.trim();
    if (!report || !text) return;
    const item = day.priceList.find((x) => x.kind === 'material' && x.name.toLowerCase() === text.toLowerCase());
    setOther('');
    void run(() => act.saveReport(job, report.segments, [...report.parts, pickedPart(item, text, false)]));
  };
  const toggle = (t: ReportTick) =>
    setTicks((was) => {
      if (was.includes(t)) return was.filter((x) => x !== t);
      // Fitting something means parts went in.
      return TICKS.map((x) => x.tick).filter((x) => x === t || was.includes(x) || (t === 'fitted' && x === 'parts'));
    });
  const confirmTicks = () =>
    run(async () => {
      await act.saveReport(job, segments, report?.parts, ticks);
      setQi(0);
      setStep(segments.length ? 'check' : 'talk');
    });

  const press = () => {
    if (preview) {
      const all = nextSample.split(' ');
      let n = 0;
      clearInterval(demoTimer.current);
      demoTimer.current = setInterval(() => {
        n = Math.min(all.length, n + 1);
        setDemo(all.slice(0, n).join(' '));
      }, 110);
      return;
    }
    void ear.start();
  };
  const release = async () => {
    if (preview) {
      clearInterval(demoTimer.current);
      const said = demo ? nextSample : '';
      setDemo('');
      add(said);
      return;
    }
    add(await ear.stop());
  };

  const sign = () => {
    if (!report) return;
    const why = cantSign(report);
    if (why) {
      setWarn(why);
      buzz(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void run(async () => {
      await act.signReport(report, job);
      buzz(Haptics.NotificationFeedbackType.Success);
      setShown(undefined);
      setStep('signed');
    });
  };

  const openGas = () =>
    run(async () => {
      await act.startGasRecord(job);
      router.push({ pathname: '/gas/[id]', params: { id: job.id } });
    });

  const lineRow = (l: ReportLine, key: string, first: boolean) => {
    const on = shown === key;
    const s = saidFor(segments, l.from);
    const edit = editing?.segment === l.from.segment && on;
    return (
      <View key={key}>
        <Pressable
          onPress={() => (setShown(on ? undefined : key), setEditing(undefined))}
          disabled={step !== 'check'}
          accessibilityRole={step === 'check' ? 'button' : 'text'}
          accessibilityHint={step === 'check' ? 'Shows the words this came from' : undefined}
          style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.rowText}>{l.text}</Text>
        </Pressable>
        {on && (
          <Animated.View entering={FadeIn.duration(180)} style={styles.said}>
            <Cap tint={color.fgFaint}>You said</Cap>
            {edit ? (
              <>
                <Input value={editing.text} onChangeText={(text) => setEditing({ segment: l.from.segment, text })} multiline accessibilityLabel="What you said" style={styles.editBox} />
                <View style={styles.pair}>
                  <Plain title="Cancel" quiet onPress={() => setEditing(undefined)} flex />
                  <Plain
                    title="Save the words"
                    onPress={() => {
                      const text = editing.text.trim();
                      setEditing(undefined);
                      setShown(undefined);
                      void run(() => save(text ? segments.map((g, i) => (i === l.from.segment ? { ...g, text } : g)) : segments.filter((_, i) => i !== l.from.segment)));
                    }}
                    flex
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.saidText}>
                  {s.before}
                  <Text style={{ color: color.fg }}>{s.it}</Text>
                  {s.after}
                </Text>
                <Pressable onPress={() => setEditing({ segment: l.from.segment, text: segments[l.from.segment].text })} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>Change the words</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        )}
      </View>
    );
  };

  const partRow = (p: ReportPart, i: number) => {
    const item = p.itemId ? day.priceList.find((x) => x.id === p.itemId) : undefined;
    const s = saidFor(segments, p.from);
    return (
      <View key={`part${i}`} style={[styles.part, i > 0 && styles.partDivider]}>
        <View style={styles.partHead}>
          <Text style={styles.partName} numberOfLines={2}>
            {p.choices?.length ? `Which "${p.description}"?` : p.description}
          </Text>
          {p.fromVan && <Text style={styles.van}>VAN</Text>}
        </View>
        <View style={styles.partFrom}>
          <Text style={[styles.partSaid, { flex: 1, marginTop: 0 }]} numberOfLines={2}>
            {p.picked ? (p.itemId ? (p.fromVan ? 'Picked from your van' : 'Picked from the price list') : 'Typed in, not on the price list. The office prices it') : `“${s.it.trim()}”`}
          </Text>
          {p.picked && (
            <Pressable onPress={() => void drop(i)} accessibilityRole="button" accessibilityLabel={`Remove ${p.description}`} hitSlop={10}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          )}
        </View>
        {!!p.choices?.length && (
          <View style={{ gap: 6, marginTop: 10 }} accessibilityRole="radiogroup">
            {p.choices.map((c) => {
              const opt = day.priceList.find((x) => x.id === c);
              return opt ? <Radio key={c} label={opt.name} on={false} onPress={() => fix(i, { itemId: opt.id, description: opt.name, unit: opt.unit, choices: undefined, fromVan: p.sourceSaid ? p.fromVan : day.stock.some((x) => x.itemId === opt.id && x.quantity > 0) })} /> : null;
            })}
          </View>
        )}
        {!p.choices?.length && (
          <View style={styles.partControls}>
            <View style={{ flex: 1, gap: 4 }}>
              <Stepper value={p.quantity} onChange={(quantity) => fix(i, { quantity, quantitySaid: true })} label={item?.unit === 'metre' ? 'Metres' : 'How many'} />
              {!p.quantitySaid && <Text style={[styles.hint, { color: color.warn, marginTop: 2 }]}>You didn't say how many</Text>}
            </View>
            {item?.stocked !== false && (
              <Segmented
                label="Where it came from"
                options={[
                  { key: 'van', label: 'Van' },
                  { key: 'else', label: 'Other' },
                ]}
                value={p.fromVan ? 'van' : 'else'}
                onChange={(k) => fix(i, { fromVan: k === 'van', sourceSaid: true })}
                style={{ flex: 1 }}
              />
            )}
          </View>
        )}
      </View>
    );
  };

  const blocked = report ? cantSign(report) : 'Say something first';
  const partsTicked = !!report?.ticked && needed(report.ticked).includes('parts');
  const van = day.stock
    .filter((x) => x.quantity > 0)
    .map((x) => ({ ...x, item: day.priceList.find((i) => i.id === x.itemId) }))
    .filter((x) => x.item);

  return (
    <View style={styles.root}>
      <Atmosphere state="on_site" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <TopRow
            left={
              step === 'check' ? <Back label="Talk" onPress={() => setStep('talk')} /> : step === 'talk' ? <Back label="Back" onPress={() => (asking && qi > 0 ? setQi(qi - 1) : setStep('what'))} /> : <Back label={job.ref} />
            }
            right={`${job.ref}   ${clock(new Date().toISOString())}`}
          />
        </View>

        {step === 'talk' ? (
          <View style={styles.head}>
            <Text style={styles.jobTitle}>{job.title}</Text>
            {!!site && <Text style={styles.jobPlace}>{`${site.line1}, ${site.town} ${site.postcode.split(' ')[0]}`}</Text>}
          </View>
        ) : (
        <View style={styles.head}>
          <OpTitle size={26}>{step === 'what' ? 'What happened?' : step === 'check' ? 'Check it over' : 'Report signed'}</OpTitle>
          <Text style={styles.sub}>
            {step === 'what'
              ? "Tick everything that happened on this job. You can't sign off until each one is in the report."
              : step === 'check'
                ? 'Tap a line to see the words it came from.'
                : `Signed by ${report?.signedBy ?? day.operator.name}${report?.signedAt ? ` at ${clock(report.signedAt)}` : ''}. The office sees it on ${job.ref}.`}
          </Text>
        </View>
        )}

        {step === 'what' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Card style={styles.list}>
              {TICKS.map((t, i) => {
                const on = ticks.includes(t.tick);
                return (
                  <Pressable
                    key={t.tick}
                    onPress={() => toggle(t.tick)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t.label}
                    style={({ pressed }) => [styles.prompt, i > 0 && styles.promptDivider, pressed && { opacity: 0.6 }]}
                  >
                    <View style={[styles.box, on && styles.boxOn]}>{on && <Icon name="check" size={14} tint={color.bg} strokeWidth={2.6} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promptTitle}>{t.label}</Text>
                      <Text style={styles.promptHint}>{t.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
            <Text style={styles.hint}>What you did always goes in. Parts can be picked from your van afterwards, or said while you talk.</Text>
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'talk' && (
          <ScrollView contentContainerStyle={styles.stage} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {asking && askedPrompt && (
              <>
                <View style={styles.progress}>
                  {asking.map((t, i) => (
                    <View key={t} style={[styles.progressBit, i <= qi && { backgroundColor: color.fg }]} />
                  ))}
                </View>
                <Text style={styles.question}>{askedPrompt.title}</Text>
                <Text style={styles.questionHint}>{asked === 'parts' ? 'Say them, or pick them from your van next' : askedPrompt.hint}</Text>
              </>
            )}
            <Text style={styles.eyebrow}>
              {`${asking ? `${qi + 1} of ${asking.length}` : 'Job update'}  ·  ${listening ? 'Recording' : answer ? 'Said' : 'Ready'}`}
            </Text>
            <Wave bars={bars} live={listening} />
            <Text style={styles.timer} accessibilityLabel={`${Math.floor(elapsed / 60)} minutes ${elapsed % 60} seconds`}>{`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}</Text>
            <Text style={[styles.quote, !live && !answer && { color: color.fgFaint }]} accessibilityLiveRegion="polite">
              {live ? `“${tail(live)}”` : answer ? `“${tail(answer.text)}”` : asking ? 'Hold the button and answer.' : 'Hold the button and talk it through, the way you would tell the office.'}
            </Text>
            {!asking && <View style={styles.marks} accessibilityLabel={prompts.map((p) => `${p.chip} ${covered.has(p.topic) ? 'covered' : 'still to say'}`).join(', ')}>
              {prompts.map((p) => {
                const done = covered.has(p.topic);
                return (
                  <View key={p.topic} style={styles.mark}>
                    <View style={[styles.markDot, done && { backgroundColor: color.fg }]} />
                    <Text style={[styles.markText, done && { color: color.fg }]}>{p.chip}</Text>
                  </View>
                );
              })}
            </View>}
            {ear.onPhone === false && Platform.OS === 'android' && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.hint}>This phone needs signal to hear you until its English (UK) speech pack is on it.</Text>
                <Plain title="Get the English (UK) pack" quiet onPress={() => void ear.getPack()} />
              </View>
            )}
            {(ear.hearing === 'type' || ear.hearing === 'refused') && !preview && (
              <View style={{ marginTop: 14, gap: 8 }}>
                <Text style={styles.hint}>{ear.hearing === 'refused' ? 'The microphone is off for Ardent, so type it instead. You can switch it on in Settings.' : "This phone can't listen, so type it instead."}</Text>
                <Input value={typed} onChangeText={setTyped} multiline placeholder="What you did, parts, tests, anything left" accessibilityLabel="Type your report" style={styles.editBox} />
                <Plain
                  title="Add it"
                  onPress={() => {
                    add(typed);
                    setTyped('');
                  }}
                  disabled={!typed.trim()}
                />
              </View>
            )}
            {!!(ear.problem || warn) && <Text style={[styles.hint, { color: color.warn }]}>{ear.problem || warn}</Text>}
          </ScrollView>
        )}

        {step === 'check' && report && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {report.missing.length > 0 && (
              <>
                <Section label="Still needed" right={<Cap tint={color.warn}>{`${report.missing.length}`}</Cap>} style={{ marginTop: 0 }} />
                <Card style={styles.list}>
                  {report.missing.map((t, i) => (
                    <Line
                      key={t}
                      first={i === 0}
                      left={title(t)}
                      right={t === 'parts' ? <Chip label="Pick" tint={color.fg} onPress={() => setPicking(true)} /> : <Chip label="Say it" tint={color.fg} onPress={() => ask(t)} />}
                    />
                  ))}
                </Card>
              </>
            )}

            {report.sections.map((s) => (
              <View key={s.topic}>
                <Section label={title(s.topic)} />
                <Card style={styles.list}>{s.lines.map((l, i) => lineRow(l, `${s.topic}${i}`, i === 0))}</Card>
              </View>
            ))}

            {(report.parts.length > 0 || partsTicked || picking) && (
              <>
                <Section label="Parts for the invoice" right={<Cap>{`${report.parts.length}`}</Cap>} />
                {report.parts.length > 0 && <Card style={styles.list}>{report.parts.map(partRow)}</Card>}
                {picking ? (
                  <Card style={[styles.list, { marginTop: report.parts.length ? 8 : 0 }]}>
                    <Cap tint={color.fgMuted}>On your van</Cap>
                    {van.length === 0 && <Text style={styles.hint}>Nothing on your van list.</Text>}
                    {van.map((v, i) => {
                      const n = report.parts.find((p) => p.itemId === v.itemId)?.quantity;
                      return (
                        <Pressable
                          key={v.itemId}
                          onPress={() => pick(v.itemId)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${v.item!.name}`}
                          style={({ pressed }) => [styles.vanRow, i > 0 && styles.rowDivider, pressed && { opacity: 0.6 }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowText}>{v.item!.name}</Text>
                            <Text style={styles.promptHint}>{`${v.quantity} on the van`}</Text>
                          </View>
                          {n ? <Text style={styles.reading}>{`${n} added`}</Text> : <Icon name="plus" size={18} tint={color.fg} />}
                        </Pressable>
                      );
                    })}
                    <Cap tint={color.fgMuted} style={{ marginTop: 16 }}>Not on the van</Cap>
                    <Input value={other} onChangeText={setOther} placeholder="Type it, for example 10-way consumer unit" accessibilityLabel="Part not on the van" style={{ marginTop: 8 }} onSubmitEditing={typePart} />
                    <View style={styles.pair}>
                      <Plain title="Done" quiet onPress={() => setPicking(false)} flex />
                      <Plain title="Add it" onPress={typePart} disabled={!other.trim()} flex />
                    </View>
                  </Card>
                ) : (
                  <View style={styles.pair}>
                    <Plain title="From the van" icon="plus" onPress={() => setPicking(true)} flex />
                    <Plain title="Say them" quiet onPress={() => ask('parts')} flex />
                  </View>
                )}
                {report.parts.length > 0 && <Text style={styles.hint}>Signing adds these to the job at price list prices, and takes the van ones off your van.</Text>}
              </>
            )}

            {report.readings.length > 0 && (
              <>
                <Section label="Readings" />
                <Card style={styles.list}>
                  {report.readings.map((r, i) => (
                    <Line key={`${r.label}${i}`} first={i === 0} left={r.label} right={<Text style={styles.reading}>{r.value}</Text>} />
                  ))}
                </Card>
              </>
            )}

            {gasJob && (
              <Card style={{ marginTop: 16, paddingVertical: 2 }}>
                <Line first left="Gas safety record" sub={gasRecord?.status === 'issued' ? 'Issued' : 'Readings for the CP12 go on its own form'} right={gasRecord ? (gasRecord.status === 'issued' ? 'Issued' : 'Draft') : 'Open'} onPress={() => void openGas()} />
              </Card>
            )}
            {!!(warn || blocked) && <Text style={[styles.hint, { color: color.warn }]}>{warn || blocked}</Text>}
          </ScrollView>
        )}

        {step === 'signed' && report && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)} style={styles.grid}>
              <Stat label="Lines" value={String(report.sections.reduce((n, s) => n + s.lines.length, 0))} />
              <Stat label="Parts" value={String(report.parts.length)} />
              <Stat label="Readings" value={String(report.readings.length)} />
            </Animated.View>
            {report.sections.map((s) => (
              <View key={s.topic}>
                <Section label={title(s.topic)} />
                <Card style={styles.list}>{s.lines.map((l, i) => lineRow(l, `${s.topic}${i}`, i === 0))}</Card>
              </View>
            ))}
            {report.parts.length > 0 && (
              <>
                <Section label="Parts added to the job" />
                <Card style={styles.list}>
                  {report.parts.map((p, i) => (
                    <Line key={`p${i}`} first={i === 0} left={`${p.quantity > 1 ? `${p.quantity}× ` : ''}${p.description}`} right={p.fromVan ? 'Van' : undefined} />
                  ))}
                </Card>
              </>
            )}
          </ScrollView>
        )}

        <Dock>
          {step === 'what' && <Go label={busy ? 'Saving' : 'Next: talk it through'} icon="arrow" onPress={() => void confirmTicks()} disabled={busy} />}
          {step === 'talk' && (
            <View style={styles.micRow}>
              <View style={styles.micWrap}>
                <Animated.View pointerEvents="none" style={[styles.micRing, ring]} />
                <Pressable
                  onPressIn={press}
                  onPressOut={() => void release()}
                  disabled={!preview && (ear.hearing === 'type' || ear.hearing === 'refused')}
                  accessibilityRole="button"
                  accessibilityLabel="Hold to talk"
                  accessibilityHint="Talks while held. Let go when you've said it."
                  style={({ pressed }) => [styles.mic, (pressed || listening) && { transform: [{ scale: 0.96 }] }, !preview && (ear.hearing === 'type' || ear.hearing === 'refused') && { opacity: 0.35 }]}
                >
                  <View style={[styles.micCore, listening && styles.micCoreOn]} />
                </Pressable>
              </View>
              <Text style={styles.micLabel}>{listening ? 'Release to finish' : busy ? 'Saving' : 'Hold to talk'}</Text>
              {(asking ? !!answer || (asked === 'parts' && !!report?.parts.length) : segments.length > 0) && !listening && (
                <Pressable onPress={asking ? nextQuestion : () => setStep('check')} accessibilityRole="button" hitSlop={10} style={styles.next}>
                  <Text style={styles.nextText}>{!asking ? 'Check it over' : !lastQuestion ? 'Next question' : asking.includes('parts') ? 'Next: check the parts' : 'Check it over'}</Text>
                  <Icon name="arrow" size={15} tint={color.fg} />
                </Pressable>
              )}
              {asked === 'parts' && !answer && !listening && (
                <Pressable onPress={nextQuestion} accessibilityRole="button" hitSlop={10} style={styles.next}>
                  <Text style={[styles.nextText, { color: color.fgMuted }]}>Pick them from the van instead</Text>
                </Pressable>
              )}
              {preview && <Text style={[styles.hint, { textAlign: 'center' }]}>Preview: holding plays what an engineer might say.</Text>}
            </View>
          )}
          {step === 'check' && <HoldToCommit label={busy ? 'Saving' : 'Hold to sign off'} icon="check" onCommit={sign} disabled={!!blocked || busy} />}
          {step === 'signed' && <Go label={`Back to ${job.ref}`} tone="grey" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/job/[id]', params: { id: job.id } }))} />}
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  head: { paddingHorizontal: 22, paddingTop: 22 },
  scroll: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: space[6] },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 10 },
  list: { paddingVertical: 14 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 10 },
  row: { paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowText: { color: color.fg, fontFamily: font.sans, fontSize: 15, lineHeight: 21 },
  // Units are case-sensitive (ms, MΩ), so readings never go upper case.
  reading: { color: color.fg, fontFamily: font.mono, fontSize: 13 },
  link: { color: color.fg, fontFamily: font.sansMedium, fontSize: 13, marginTop: 10 },
  prompt: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 11 },
  promptDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  promptTitle: { color: color.fg, fontFamily: font.sansMedium, fontSize: 15 },
  promptHint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 3 },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickDone: { backgroundColor: color.inset },
  heard: { color: color.fg, fontFamily: font.sans, fontSize: 16, lineHeight: 23, marginTop: 10 },
  said: { backgroundColor: color.inset, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  saidText: { color: color.fgFaint, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 8 },
  editBox: { minHeight: 88, textAlignVertical: 'top', marginTop: 8 },
  pair: { flexDirection: 'row', gap: 8, marginTop: 8 },
  part: { paddingVertical: 12 },
  partDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partName: { flex: 1, color: color.fg, fontFamily: font.sansMedium, fontSize: 15 },
  partSaid: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 4 },
  partControls: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  partFrom: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  remove: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 13 },
  vanRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  box: { width: 24, height: 24, borderRadius: 7, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: color.fg },
  van: { color: color.fgMuted, backgroundColor: color.raised, fontFamily: font.mono, fontSize: 10, letterSpacing: 1.6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden' },
  grid: { flexDirection: 'row', gap: 8 },
  progress: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', marginBottom: 28 },
  progressBit: { flex: 1, height: 3, borderRadius: 2, backgroundColor: color.raised },
  question: { color: color.fg, fontFamily: font.sansMedium, fontSize: 22, lineHeight: 28, textAlign: 'center' },
  questionHint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  stage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  eyebrow: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 56, marginTop: 22 },
  bar: { width: 4, borderRadius: 2, backgroundColor: color.fg },
  timer: { color: color.fg, fontFamily: font.mono, fontSize: 30, letterSpacing: 2, marginTop: 18 },
  quote: { color: color.fgMuted, fontFamily: font.sans, fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 22, minHeight: 72 },
  marks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 26 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.raised },
  markText: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  jobTitle: { color: color.fg, fontFamily: font.sansSemi, fontSize: 22, lineHeight: 28 },
  jobPlace: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: 4 },
  micCore: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.bg },
  micCoreOn: { width: 24, height: 24, borderRadius: 6 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 6 },
  nextText: { color: color.fg, fontFamily: font.sansMedium, fontSize: 15 },
  micRow: { alignItems: 'center', gap: 10, marginBottom: 12 },
  micWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  micRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, backgroundColor: color.emberSoft },
  mic: { width: 84, height: 84, borderRadius: 42, backgroundColor: color.ember, alignItems: 'center', justifyContent: 'center' },
  micLabel: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' },
});
