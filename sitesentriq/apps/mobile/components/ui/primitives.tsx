import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native'
import { Button } from 'heroui-native'
import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { MapPin, Clock, ChevronRight, ArrowRight } from 'lucide-react-native'
import type { Job } from '@/lib/supabase'
import { JOB_STATUS_COLORS } from '@/constants/config'

/** Open the device's maps app with directions to a job's property. */
export function navigateToJob(job: Job) {
  const props = (job as { properties?: { name?: string; address?: string; latitude?: number; longitude?: number } }).properties
  const lat = props?.latitude
  const lng = props?.longitude
  const query = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(props?.address || props?.name || '')
  if (!query) return
  const url = Platform.select({
    ios: `maps://?daddr=${query}`,
    android: `google.navigation:q=${query}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
  })
  Linking.openURL(url as string).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}`).catch(() => {})
  })
}

// ─── Status colors ───────────────────────────────────────────────────
// Dynamic colors (status chips) are applied via the `style` prop — Uniwind
// compiles className at build time, so it can't generate classes from runtime
// values; inline style is the correct, reliable path for these.
// Single source of truth: JOB_STATUS_COLORS (constants/config) — the same map
// the job hub's StatusBadge uses — so the list (JobCard) and the hub can't drift
// (they previously disagreed on `revisit`: indigo here vs violet there). `overdue`
// is a derived, list-only state not in the DB enum, so it's added on top.
export const STATUS_COLORS: Record<string, string> = {
  ...JOB_STATUS_COLORS,
  overdue: '#ef4444',
}

export const STATUS_LABELS: Record<string, string> = {
  not_ready: 'Not Ready',
  ready: 'Ready',
  scheduled: 'Scheduled',
  due: 'Due',
  pending: 'Pending',
  pending_external: 'Pending External',
  in_progress: 'In Progress',
  contractor_review: 'Contractor Review',
  performed: 'Performed',
  completed: 'Completed',
  incomplete: 'Incomplete',
  failed_access: 'No Access',
  revisit: 'Revisit',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function statusColor(status?: string): string {
  return STATUS_COLORS[(status ?? '').toLowerCase()] ?? '#94a3b8'
}
export function statusLabel(status?: string): string {
  const s = (status ?? '').toLowerCase()
  return STATUS_LABELS[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown')
}

const BRAND = '#e8772e'
const INK = '#0f172a'
const MUTED = '#94a3b8'
const BORDER = '#eef1f6'

// Subtle elevation + border shared by the cards (maps to box-shadow on web,
// shadow* on iOS, elevation on Android). Kept light/flat — just enough lift to
// separate cards from the page, not a heavy drop shadow. Exported so every
// screen's cards share one consistent treatment.
export const CARD_BORDER = '#eef1f6'
export const cardShadow = {
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const
const shadow = cardShadow

/** Soft status chip — tinted dot + label, color from status. */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  const c = statusColor(status)
  return (
    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: `${c}14` }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c, marginRight: 6 }} />
      <Text className="text-[11px] font-bold" style={{ color: c, letterSpacing: 0.2 }}>
        {label ?? statusLabel(status)}
      </Text>
    </View>
  )
}

/** Uppercase micro section label (iOS grouped-list style). */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View className="mb-2.5 flex-row items-center justify-between">
      <Text className="ml-0.5 text-[12px] font-extrabold uppercase tracking-[1.4px] text-muted">
        {children}
      </Text>
      {right}
    </View>
  )
}

/** A quick-action tile: icon chip + label. `filled` = brand-orange lead tile. */
export function ActionTile({
  icon,
  label,
  onPress,
  filled,
  disabled,
}: {
  icon: ReactNode
  label: string
  onPress?: () => void
  filled?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 items-center rounded-2xl border p-3 ${filled ? '' : 'bg-surface'}`}
      style={({ pressed }) => [
        {
          backgroundColor: filled ? BRAND : undefined,
          borderColor: filled ? BRAND : BORDER,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        filled ? shadow : null,
      ]}
    >
      <View
        className={`mb-2 h-11 w-11 items-center justify-center rounded-2xl ${filled ? '' : 'bg-surface-secondary'}`}
        style={filled ? { backgroundColor: 'rgba(255,255,255,0.22)' } : undefined}
      >
        {icon}
      </View>
      <Text
        className={`text-center text-[12px] font-semibold ${filled ? 'text-white' : 'text-foreground'}`}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Stat card — big number + label, with a soft tinted accent bar. */
export function StatCard({ value, label, accent }: { value: ReactNode; label: string; accent?: string }) {
  const a = accent ?? BRAND
  return (
    <View className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface p-4" style={shadow}>
      <View className="mb-2.5 h-1.5 w-9 rounded-full" style={{ backgroundColor: a }} />
      <Text className="text-[30px] font-extrabold text-foreground" style={{ letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[13px] font-medium text-muted">{label}</Text>
    </View>
  )
}

/** Elevated job card — flat (no spine), rounded, with chevron affordance. */
export function JobCard({ job }: { job: Job }) {
  const time = job.scheduled_date
    ? new Date(job.scheduled_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null
  const propertyName = (job as { properties?: { name?: string } }).properties?.name

  return (
    <Pressable
      onPress={() => router.push(`/job/${job.id}`)}
      className="mb-2.5 flex-row items-center rounded-2xl border border-border bg-surface p-3.5"
      style={({ pressed }) => [
        { transform: [{ scale: pressed ? 0.99 : 1 }] },
        shadow,
      ]}
    >
      <View className="flex-1">
        <View className="mb-1.5 flex-row items-center justify-between">
          {time ? (
            <View className="flex-row items-center rounded-full bg-[#fff3ea] px-2 py-0.5">
              <Clock size={12} color={BRAND} />
              <Text className="ml-1 text-[12px] font-bold" style={{ color: BRAND }}>{time}</Text>
            </View>
          ) : <View />}
          <StatusChip status={job.status} />
        </View>
        {job.job_number ? (
          <Text className="mb-0.5 text-[11px] font-bold tracking-wider text-muted">{job.job_number}</Text>
        ) : null}
        <Text className="mb-1 text-[15.5px] font-bold text-foreground" numberOfLines={1}>
          {job.title}
        </Text>
        {propertyName ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={13} color={MUTED} />
            <Text className="text-[13px] text-muted" numberOfLines={1}>{propertyName}</Text>
          </View>
        ) : null}
        {(job as { service_group?: string | null }).service_group ? (
          <Text className="mt-1 text-[11px] font-semibold text-muted" numberOfLines={1}>
            {(job as { service_group?: string | null }).service_group}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color="#cbd5e1" style={{ marginLeft: 8 }} />
    </Pressable>
  )
}

/**
 * NextJobHero — the engineer's most important next action. A clean, light card
 * (white, flat) with a small brand "Next up" kicker and a one-tap Start button.
 */
export function NextJobHero({ job }: { job: Job }) {
  const sched = job.scheduled_date ? new Date(job.scheduled_date) : null
  const time = sched
    ? sched.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null
  // Label the day when the next job ISN'T today, so a clear-today morning can't
  // misread tomorrow's 09:00 as today's. Local calendar day, not UTC.
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let dayLabel: string | null = null
  if (sched) {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const key = ymd(sched)
    if (key === ymd(today)) dayLabel = null
    else if (key === ymd(tomorrow)) dayLabel = 'Tomorrow'
    else dayLabel = sched.toLocaleDateString('en-GB', { weekday: 'short' })
  }
  const timeLabel = time ? (dayLabel ? `${dayLabel} · ${time}` : time) : null
  const propertyName = (job as { properties?: { name?: string } }).properties?.name

  return (
    <View className="rounded-2xl border border-border bg-surface p-4" style={shadow}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-extrabold uppercase tracking-[1.4px]" style={{ color: BRAND }}>
          Next up
        </Text>
        {timeLabel ? (
          <View className="flex-row items-center rounded-full bg-[#fff3ea] px-2.5 py-1">
            <Clock size={12} color={BRAND} />
            <Text className="ml-1 text-[12px] font-bold" style={{ color: BRAND }}>{timeLabel}</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-2 text-[18px] font-extrabold text-foreground" numberOfLines={2}>
        {job.title}
      </Text>
      {propertyName ? (
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <MapPin size={14} color={MUTED} />
          <Text className="text-[13.5px] text-muted" numberOfLines={1}>{propertyName}</Text>
        </View>
      ) : null}
      {/* HeroUI Native primary Button (brand orange via the fixed --accent in
          global.css). Collapse-proof per diagnosis: custom icon+label MUST be
          wrapped in <Button.Label>, and an inline minHeight set (the h-12
          className races and can collapse to 0 when children are custom JSX). */}
      <Button
        variant="primary"
        onPress={() => router.push(`/job/${job.id}`)}
        className="mt-3.5 w-full"
        style={{ minHeight: 52 }}
      >
        <Button.Label>
          <View className="flex-row items-center justify-center gap-2">
            <Text className="text-[14.5px] font-bold text-white">Open job</Text>
            <ArrowRight size={16} color="#fff" />
          </View>
        </Button.Label>
      </Button>
    </View>
  )
}

// Kept for any callers referencing the StyleSheet (none currently).
export const _styles = StyleSheet.create({})
