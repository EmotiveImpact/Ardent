// Compliance certificate form templates (V1 #9). Mirrors @haumea/types
// CERT_FORM_TEMPLATES — kept as a local copy so the Expo/metro bundle doesn't
// reach across workspaces for a small constant.
export type CertFieldType = 'pass_fail' | 'text'
export interface CertField {
  key: string
  label: string
  type: CertFieldType
}
export interface CertTemplate {
  key: string
  label: string
  fields: CertField[]
}

const FAULTS: CertField = { key: 'faults_found', label: 'Faults / observations', type: 'text' }

export const CERT_FORM_TEMPLATES: CertTemplate[] = [
  {
    key: 'fire_alarm',
    label: 'Fire & Alarm System',
    fields: [
      { key: 'panel_operational', label: 'Control panel operational', type: 'pass_fail' },
      { key: 'zones_tested', label: 'All zones tested', type: 'pass_fail' },
      { key: 'call_points', label: 'Manual call points functional', type: 'pass_fail' },
      { key: 'sounders', label: 'Sounders audible throughout', type: 'pass_fail' },
      { key: 'battery_backup', label: 'Battery / standby supply OK', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'emergency_lighting',
    label: 'Emergency Lighting',
    fields: [
      { key: 'all_luminaires', label: 'All luminaires illuminate on test', type: 'pass_fail' },
      { key: 'duration_test', label: 'Holds full-duration (3hr) test', type: 'pass_fail' },
      { key: 'exit_signs', label: 'Exit signs clear & lit', type: 'pass_fail' },
      { key: 'charge_indicators', label: 'Charge indicators healthy', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'fire_extinguisher',
    label: 'Fire Extinguisher',
    fields: [
      { key: 'correct_type', label: 'Correct type for the risk', type: 'pass_fail' },
      { key: 'pressure_ok', label: 'Gauge in green / pressure OK', type: 'pass_fail' },
      { key: 'seal_intact', label: 'Safety pin & seal intact', type: 'pass_fail' },
      { key: 'mounted_signed', label: 'Correctly mounted & signed', type: 'pass_fail' },
      { key: 'service_label', label: 'Service label up to date', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'access_control',
    label: 'Access Control',
    fields: [
      { key: 'readers_working', label: 'All readers operational', type: 'pass_fail' },
      { key: 'fire_release', label: 'Door release on fire alarm', type: 'pass_fail' },
      { key: 'rex_buttons', label: 'Request-to-exit buttons work', type: 'pass_fail' },
      { key: 'backup_power', label: 'Backup power tested', type: 'pass_fail' },
      FAULTS,
    ],
  },
  // ── UK statutory cert library (Wave 3 / W3-T12) ──────────────────────
  // Readings are captured in text fields — the renderer supports only
  // pass_fail | text by design (both apps + both test suites enforce it).
  {
    key: 'eicr',
    label: 'EICR (BS 7671)',
    fields: [
      { key: 'consumer_unit', label: 'Consumer unit / distribution board condition OK', type: 'pass_fail' },
      { key: 'rcd_test', label: 'RCD operation within limits', type: 'pass_fail' },
      { key: 'earthing_bonding', label: 'Earthing & bonding adequate', type: 'pass_fail' },
      { key: 'no_c1_c2', label: 'No C1 / C2 observations', type: 'pass_fail' },
      { key: 'observation_codes', label: 'Observations (C1/C2/C3/FI with details)', type: 'text' },
      { key: 'circuits_tested', label: 'Circuits tested', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'fire_alarm_weekly',
    label: 'Fire Alarm Weekly Test (BS 5839)',
    fields: [
      { key: 'call_point_tested', label: 'Manual call point tested (rotate weekly)', type: 'pass_fail' },
      { key: 'zone_indicated', label: 'Correct zone indicated at panel', type: 'pass_fail' },
      { key: 'sounders_heard', label: 'Sounders heard throughout', type: 'pass_fail' },
      { key: 'log_book_updated', label: 'Fire log book updated', type: 'pass_fail' },
      { key: 'call_point_location', label: 'Call point location tested', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'fire_alarm_quarterly',
    label: 'Fire Alarm Quarterly Service (BS 5839)',
    fields: [
      { key: 'panel_healthy', label: 'Panel healthy — no faults displayed', type: 'pass_fail' },
      { key: 'batteries_standby', label: 'Batteries / standby supply tested', type: 'pass_fail' },
      { key: 'devices_tested_pct', label: '% of devices tested this visit', type: 'text' },
      { key: 'false_alarm_review', label: 'False alarm record reviewed', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'gas_safety_cp12',
    label: 'Gas Safety Record CP12 (Gas Safe)',
    fields: [
      { key: 'appliance_safe', label: 'Appliance safe to use', type: 'pass_fail' },
      { key: 'flue_flow', label: 'Flue flow & spillage tests pass', type: 'pass_fail' },
      { key: 'ventilation', label: 'Ventilation provision adequate', type: 'pass_fail' },
      { key: 'operating_pressure', label: 'Operating pressure / heat input', type: 'text' },
      { key: 'gas_safe_number', label: 'Engineer Gas Safe reg. number', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'loler',
    label: 'LOLER Lifting Equipment',
    fields: [
      { key: 'swl_marked', label: 'SWL clearly marked', type: 'pass_fail' },
      { key: 'defect_examination', label: 'No defects affecting safe operation', type: 'pass_fail' },
      { key: 'safety_devices', label: 'Safety devices functional', type: 'pass_fail' },
      { key: 'next_examination', label: 'Next thorough examination due', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'legionella_monthly',
    label: 'Legionella Monthly Checks (ACoP L8)',
    fields: [
      { key: 'sentinel_hot', label: 'Sentinel hot outlets ≥ 50°C', type: 'pass_fail' },
      { key: 'sentinel_cold', label: 'Sentinel cold outlets ≤ 20°C', type: 'pass_fail' },
      { key: 'recorded_temps', label: 'Recorded temperatures (outlet: °C)', type: 'text' },
      { key: 'outlets_flushed', label: 'Infrequently-used outlets flushed', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'legionella_quarterly',
    label: 'Legionella Quarterly (ACoP L8)',
    fields: [
      { key: 'shower_heads', label: 'Shower heads cleaned & descaled', type: 'pass_fail' },
      { key: 'tmv_checks', label: 'TMV fail-safe checks pass', type: 'pass_fail' },
      { key: 'monthly_records', label: 'Monthly temperature records reviewed', type: 'pass_fail' },
      FAULTS,
    ],
  },
]
