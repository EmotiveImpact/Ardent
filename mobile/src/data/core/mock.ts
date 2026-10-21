import type { Certificate, Customer, GasAppliance, GasSafetyRecord, Operator, Exception, Invoice, Job, PriceItem, Quote, Site, StockLevel } from './model'

const day = '2026-10-18'
/** A UK wall-clock time today (British Summer Time), stored as UTC like every Ardent time. */
const t = (hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`).toISOString().replace('.000', '')

export const customers: Customer[] = [
  { id: 'cus_01', name: 'Sarah Whitfield', kind: 'homeowner', phone: '07700 900412', balance: 0 },
  { id: 'cus_02', name: 'Northgate Lettings', kind: 'letting_agent', phone: '0161 496 0321', balance: 184000 },
  { id: 'cus_03', name: 'The Crown & Anchor', kind: 'business', phone: '0161 496 0877', balance: 42500 },
  { id: 'cus_04', name: 'Imran Haq', kind: 'landlord', phone: '07700 900193', balance: 0 },
  { id: 'cus_05', name: 'Grace Okafor', kind: 'homeowner', phone: '07700 900650', balance: 31200 },
  { id: 'cus_06', name: 'Brindle Street Dental', kind: 'business', phone: '0161 496 0145', balance: 0 },
]

export const sites: Site[] = [
  { id: 'sit_01', customerId: 'cus_01', line1: '14 Alder Road', town: 'Didsbury', postcode: 'M20 6BT', lat: 53.4172, lng: -2.2318 },
  { id: 'sit_02', customerId: 'cus_02', line1: 'Flat 3, 88 Wilmslow Rd', town: 'Rusholme', postcode: 'M14 5AL', lat: 53.4532, lng: -2.2248, accessNotes: 'Keys at agent, code 4471' },
  { id: 'sit_03', customerId: 'cus_03', line1: '2 Quay Street', town: 'Castlefield', postcode: 'M3 4LP', lat: 53.4778, lng: -2.2528 },
  { id: 'sit_04', customerId: 'cus_04', line1: '61 Mauldeth Rd', town: 'Levenshulme', postcode: 'M19 2RF', lat: 53.4418, lng: -2.1968 },
  { id: 'sit_05', customerId: 'cus_05', line1: '7 Heaton Close', town: 'Stockport', postcode: 'SK4 3QJ', lat: 53.4232, lng: -2.1802 },
  { id: 'sit_06', customerId: 'cus_06', line1: '19 Brindle Street', town: 'Ancoats', postcode: 'M4 6DE', lat: 53.4848, lng: -2.2262 },
]

export const operators: Operator[] = [
  {
    id: 'opr_01', name: 'Dan Mercer', role: 'owner', initials: 'DM', trades: ['gas', 'heating'], van: 'VN21 KTX',
    state: 'on_site', currentJobId: 'job_1042',
    registrations: [{ body: 'Gas Safe', number: '558 213', expires: '2027-03-31' }],
  },
  {
    id: 'opr_02', name: 'Kofi Asante', role: 'operator', initials: 'KA', trades: ['electrical'], van: 'VK70 HBA',
    state: 'en_route', currentJobId: 'job_1045', etaMinutes: 12,
    registrations: [{ body: 'NICEIC', number: 'D-81772', expires: '2026-11-02' }],
  },
  {
    id: 'opr_03', name: 'Ryan Holt', role: 'operator', initials: 'RH', trades: ['plumbing', 'heating'], van: 'VE19 PLM',
    state: 'delayed', currentJobId: 'job_1047', etaMinutes: 38,
    registrations: [{ body: 'WRAS', number: 'AP-20381', expires: '2027-06-30' }],
  },
  {
    id: 'opr_04', name: 'Tom Byrne', role: 'subcontractor', initials: 'TB', trades: ['general', 'carpentry'], van: 'VA68 RRT',
    state: 'on_call',
    registrations: [],
  },
  {
    id: 'opr_05', name: 'Sam Ellis', role: 'freelance', initials: 'SE', trades: ['gas', 'heating', 'plumbing'], van: 'VX20 SEL',
    state: 'on_call',
    registrations: [
      { body: 'Gas Safe', number: '612 904', expires: '2027-08-31' },
      { body: 'Public liability', number: 'PL-44120', expires: '2027-04-30' },
    ],
    // Freelance, on standby from home in Burnage for the rest of the day.
    standby: { until: '2026-10-18T19:00:00Z', radius: 10, base: { lat: 53.4328, lng: -2.2051 } },
  },
]

export const jobs: Job[] = [
  {
    id: 'job_1042', ref: 'J-1042', title: 'Combi boiler swap', trade: 'gas', status: 'on_site', priority: 'high',
    customerId: 'cus_01', siteId: 'sit_01', operatorIds: ['opr_01'], start: t('08:00'), end: t('15:00'),
    lines: [
      { id: 'li_1', kind: 'material', description: 'Worcester Bosch 4000 30kW', quantity: 1, unitPrice: 132000 },
      { id: 'li_2', kind: 'material', description: 'Magnetic filter and flush kit', quantity: 1, unitPrice: 14500 },
      { id: 'li_3', kind: 'labour', description: 'Install, commission, power flush', quantity: 7, unitPrice: 5500 },
    ],
    checks: [
      { key: 'registration', label: 'Gas Safe', state: 'pass', detail: '558 213' },
      { key: 'rams', label: 'RAMS', state: 'pass', detail: 'Signed 07:52' },
      { key: 'gas_tightness', label: 'Tightness test', state: 'pending', detail: 'Due on commission' },
    ],
  },
  {
    id: 'job_1045', ref: 'J-1045', title: 'Consumer unit upgrade', trade: 'electrical', status: 'en_route', priority: 'normal',
    customerId: 'cus_04', siteId: 'sit_04', operatorIds: ['opr_02'], start: t('10:00'), end: t('14:00'),
    lines: [
      { id: 'li_4', kind: 'material', description: '18th Ed. RCBO board, 10 way', quantity: 1, unitPrice: 26800 },
      { id: 'li_5', kind: 'labour', description: 'Swap board, test, certify', quantity: 4, unitPrice: 5000 },
    ],
    checks: [
      { key: 'registration', label: 'NICEIC', state: 'pass', detail: 'Expires in 15 days' },
      { key: 'rams', label: 'RAMS', state: 'pending' },
      { key: 'eicr', label: 'EIC', state: 'pending' },
    ],
  },
  {
    id: 'job_1047', ref: 'J-1047', title: 'Leak under kitchen sink', trade: 'plumbing', status: 'en_route', priority: 'emergency',
    customerId: 'cus_02', siteId: 'sit_02', operatorIds: ['opr_03'], start: t('09:30'), end: t('11:00'),
    lines: [
      { id: 'li_6', kind: 'callout', description: 'Emergency call-out', quantity: 1, unitPrice: 9500 },
    ],
    checks: [{ key: 'photos', label: 'Before photos', state: 'pending' }],
    notes: 'Tenant reports water through ceiling below.',
  },
  {
    id: 'job_1048', ref: 'J-1048', title: 'Annual CP12, 4 appliances', trade: 'gas', status: 'booked', priority: 'normal',
    customerId: 'cus_03', siteId: 'sit_03', operatorIds: ['opr_01'], start: t('15:30'), end: t('17:00'),
    lines: [{ id: 'li_7', kind: 'labour', description: 'Landlord gas safety inspection', quantity: 1, unitPrice: 8500 }],
    checks: [{ key: 'registration', label: 'Gas Safe', state: 'pass' }],
  },
  {
    id: 'job_1049', ref: 'J-1049', title: 'Hang fire door, fit closer', trade: 'carpentry', status: 'booked', priority: 'low',
    customerId: 'cus_06', siteId: 'sit_06', operatorIds: ['opr_04'], start: t('11:00'), end: t('13:30'),
    lines: [{ id: 'li_8', kind: 'labour', description: 'FD30 door set install', quantity: 3, unitPrice: 4500 }],
    checks: [{ key: 'rams', label: 'RAMS', state: 'pass' }],
  },
  {
    id: 'job_1039', ref: 'J-1039', title: 'Radiator valves x6', trade: 'heating', status: 'complete', priority: 'normal',
    customerId: 'cus_05', siteId: 'sit_05', operatorIds: ['opr_03'], start: '2026-10-17T12:00:00Z', end: '2026-10-17T15:00:00Z',
    lines: [
      { id: 'li_9', kind: 'material', description: 'TRV, Drayton TRV4', quantity: 6, unitPrice: 2200 },
      { id: 'li_10', kind: 'labour', description: 'Drain down, fit, refill', quantity: 3, unitPrice: 5500 },
    ],
    checks: [{ key: 'signature', label: 'Customer sign-off', state: 'pass' }],
  },
  {
    id: 'job_1036', ref: 'J-1036', title: 'Outside socket and lighting', trade: 'electrical', status: 'invoiced', priority: 'normal',
    customerId: 'cus_05', siteId: 'sit_05', operatorIds: ['opr_02'], start: '2026-10-16T08:00:00Z', end: '2026-10-16T11:00:00Z',
    lines: [{ id: 'li_11', kind: 'labour', description: 'IP66 socket, PIR flood', quantity: 1, unitPrice: 26000 }],
    checks: [{ key: 'eicr', label: 'Minor works cert', state: 'pass' }],
  },
  {
    id: 'job_1051', ref: 'J-1051', title: 'Bathroom refit, quote visit', trade: 'plumbing', status: 'quoted', priority: 'normal',
    customerId: 'cus_01', siteId: 'sit_01', operatorIds: [], start: '2026-10-22T09:00:00Z', end: '2026-10-22T10:00:00Z',
    lines: [{ id: 'li_12', kind: 'other', description: 'Full refit, supply and fit', quantity: 1, unitPrice: 685000 }],
    checks: [],
  },
  {
    id: 'job_1052', ref: 'J-1052', title: 'No hot water', trade: 'heating', status: 'enquiry', priority: 'high',
    customerId: 'cus_02', siteId: 'sit_02', operatorIds: [], start: '2026-10-20T07:00:00Z', end: '2026-10-20T09:00:00Z',
    lines: [], checks: [],
  },
  {
    id: 'job_1030', ref: 'J-1030', title: 'Cellar pump service', trade: 'plumbing', status: 'paid', priority: 'normal',
    customerId: 'cus_03', siteId: 'sit_03', operatorIds: ['opr_03'], start: '2026-10-12T06:00:00Z', end: '2026-10-12T08:00:00Z',
    lines: [{ id: 'li_13', kind: 'labour', description: 'Service and descale', quantity: 1, unitPrice: 16500 }],
    checks: [],
  },
  {
    id: 'job_1040', ref: 'J-1040', title: 'Rewire, 3 bed semi', trade: 'electrical', status: 'booked', priority: 'normal',
    customerId: 'cus_04', siteId: 'sit_04', operatorIds: ['opr_02'], start: '2026-10-26T08:00:00Z', end: '2026-10-26T16:00:00Z',
    lines: [{ id: 'li_14', kind: 'other', description: 'Rewire, 3 bed semi', quantity: 1, unitPrice: 520000 }],
    checks: [{ key: 'rams', label: 'RAMS', state: 'pending' }, { key: 'registration', label: 'NICEIC', state: 'pending' }, { key: 'eicr', label: 'Electrical cert', state: 'pending' }],
  },
  {
    id: 'job_1022', ref: 'J-1022', title: 'Emergency lighting test', trade: 'electrical', status: 'paid', priority: 'normal',
    customerId: 'cus_06', siteId: 'sit_06', operatorIds: ['opr_02'], start: '2026-10-13T07:00:00Z', end: '2026-10-13T11:00:00Z',
    lines: [{ id: 'li_15', kind: 'labour', description: 'Emergency lighting test, 14 fittings', quantity: 1, unitPrice: 42000 }],
    checks: [],
  },
  {
    id: 'job_1019', ref: 'J-1019', title: 'Air con service, 4 units', trade: 'hvac', status: 'cancelled', priority: 'low',
    customerId: 'cus_06', siteId: 'sit_06', operatorIds: [], start: '2026-10-07T08:00:00Z', end: '2026-10-07T12:00:00Z',
    lines: [{ id: 'li_16', kind: 'labour', description: 'Air con service, 4 units', quantity: 1, unitPrice: 64000 }],
    checks: [],
  },
  {
    id: 'job_1011', ref: 'J-1011', title: 'Glass washer drain', trade: 'plumbing', status: 'invoiced', priority: 'high',
    customerId: 'cus_03', siteId: 'sit_03', operatorIds: ['opr_03'], start: '2026-10-01T09:00:00Z', end: '2026-10-01T11:00:00Z',
    lines: [{ id: 'li_17', kind: 'labour', description: 'Glass washer drain, new trap', quantity: 1, unitPrice: 35417 }],
    checks: [],
  },
  {
    id: 'job_0998', ref: 'J-0998', title: 'Void property checks', trade: 'gas', status: 'invoiced', priority: 'normal',
    customerId: 'cus_02', siteId: 'sit_02', operatorIds: ['opr_01', 'opr_02'], start: '2026-09-21T08:00:00Z', end: '2026-09-21T13:00:00Z',
    lines: [{ id: 'li_18', kind: 'labour', description: 'Void property gas and electric checks', quantity: 1, unitPrice: 153333 }],
    checks: [],
  },
]

export const certificates: Certificate[] = [
  { id: 'cer_01', kind: 'EICR', siteId: 'sit_02', issued: '2021-10-02', expires: '2026-10-02', state: 'overdue' },
  { id: 'cer_02', kind: 'CP12', siteId: 'sit_04', issued: '2025-09-28', expires: '2026-09-28', state: 'overdue' },
  { id: 'cer_03', kind: 'PAT', siteId: 'sit_03', issued: '2025-10-05', expires: '2026-10-05', state: 'overdue' },
  { id: 'cer_04', kind: 'BS5839', siteId: 'sit_06', issued: '2026-04-09', expires: '2026-10-09', state: 'overdue' },
  { id: 'cer_05', kind: 'CP12', siteId: 'sit_02', issued: '2025-10-11', expires: '2026-10-11', state: 'overdue' },
  { id: 'cer_06', kind: 'Unvented', siteId: 'sit_05', issued: '2025-10-14', expires: '2026-10-14', state: 'overdue' },
  { id: 'cer_07', kind: 'Boiler service', siteId: 'sit_01', issued: '2025-10-16', expires: '2026-10-16', state: 'overdue' },
  { id: 'cer_08', kind: 'CP12', siteId: 'sit_03', issued: '2025-10-21', expires: '2026-10-21', state: 'due_soon', jobId: 'job_1048' },
  { id: 'cer_09', kind: 'PAT', siteId: 'sit_06', issued: '2025-11-05', expires: '2026-11-05', state: 'due_soon' },
  { id: 'cer_10', kind: 'EICR', siteId: 'sit_04', issued: '2021-11-12', expires: '2026-11-12', state: 'due_soon' },
  { id: 'cer_11', kind: 'Boiler service', siteId: 'sit_05', issued: '2026-01-14', expires: '2027-01-14', state: 'valid' },
  { id: 'cer_12', kind: 'EICR', siteId: 'sit_01', issued: '2024-03-02', expires: '2029-03-02', state: 'valid' },
  { id: 'cer_13', kind: 'CP12', siteId: 'sit_05', issued: '2026-06-20', expires: '2027-06-20', state: 'valid' },
  { id: 'cer_14', kind: 'BS5839', siteId: 'sit_03', issued: '2026-08-30', expires: '2027-02-28', state: 'valid' },
  { id: 'cer_15', kind: 'Unvented', siteId: 'sit_01', issued: '2026-02-11', expires: '2027-02-11', state: 'valid' },
]

export const exceptions: Exception[] = [
  { id: 'ex_1', at: t('09:42'), who: 'Kofi Asante', rule: 'Registration expiring', detail: 'NICEIC D-81772 lapses 2 Nov', outcome: 'chasing' },
  { id: 'ex_2', at: t('09:15'), who: 'Ryan Holt', rule: 'Arrival window missed', detail: 'J-1047 emergency, ETA +38 min', outcome: 'chasing' },
  { id: 'ex_3', at: t('08:30'), who: 'Northgate Lettings', rule: 'EICR overdue', detail: '88 Wilmslow Rd, 17 days late', outcome: 'blocked' },
  { id: 'ex_4', at: t('08:04'), who: 'Dan Mercer', rule: 'RAMS signed late', detail: 'J-1042 signed after arrival', outcome: 'overridden' },
  { id: 'ex_5', at: t('07:45'), who: 'Tom Byrne', rule: 'Van check incomplete', detail: 'Tyre tread photo missing', outcome: 'resolved' },
]

/** Hourly series for KPI sparklines, oldest first. */
export const kpiSeries = {
  jobs: [3, 5, 4, 6, 7, 5, 8, 6],
  response: [62, 48, 70, 55, 90, 66, 58, 44],
  invoiced: [420, 610, 380, 890, 720, 540, 980, 760],
  exceptions: [1, 0, 2, 1, 3, 1, 2, 4],
}

export const byId = <T extends { id: string }>(list: T[], id: string | undefined) => list.find((x) => x.id === id)

export const jobTotal = (job: Job) => job.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)

const li = (id: string, description: string, unitPrice: number, quantity = 1, kind: 'labour' | 'material' | 'callout' | 'other' = 'labour') => ({
  id,
  kind,
  description,
  quantity,
  unitPrice,
})

export const invoices: Invoice[] = [
  { id: 'inv_2207', ref: 'INV-2207', jobId: 'job_1036', customerId: 'cus_05', lines: [li('a', 'IP66 socket, PIR flood', 26000)], vatRate: 2000, status: 'sent', issuedAt: '2026-10-16T14:00:00Z', dueAt: '2026-10-30T00:00:00Z', paidAmount: 0 },
  { id: 'inv_2204', ref: 'INV-2204', jobId: 'job_1030', customerId: 'cus_03', lines: [li('b', 'Cellar pump service', 16500)], vatRate: 2000, status: 'paid', issuedAt: '2026-10-12T11:00:00Z', dueAt: '2026-10-26T00:00:00Z', paidAmount: 19800 },
  { id: 'inv_2198', ref: 'INV-2198', jobId: 'job_0998', customerId: 'cus_02', lines: [li('c', 'Void property gas and electric checks', 153333)], vatRate: 2000, status: 'overdue', issuedAt: '2026-09-22T11:00:00Z', dueAt: '2026-10-05T23:00:00Z', paidAmount: 0 },
  { id: 'inv_2201', ref: 'INV-2201', jobId: 'job_1011', customerId: 'cus_03', lines: [li('d', 'Glass washer drain, new trap', 35417)], vatRate: 2000, status: 'part_paid', issuedAt: '2026-10-02T11:00:00Z', dueAt: '2026-10-15T23:00:00Z', paidAmount: 20000 },
  { id: 'inv_2206', ref: 'INV-2206', jobId: 'job_1022', customerId: 'cus_06', lines: [li('e', 'Emergency lighting test, 14 fittings', 42000)], vatRate: 2000, status: 'paid', issuedAt: '2026-10-14T11:00:00Z', dueAt: '2026-10-28T00:00:00Z', paidAmount: 50400 },
  { id: 'inv_2208', ref: 'INV-2208', jobId: 'job_1039', customerId: 'cus_05', lines: [li('f', 'TRV, Drayton TRV4', 2200, 6, 'material'), li('g', 'Drain down, fit, refill', 5500, 3)], vatRate: 2000, status: 'draft', paidAmount: 0 },
]

export const quotes: Quote[] = [
  {
    id: 'quo_311', ref: 'Q-311', jobId: 'job_1051', customerId: 'cus_01', status: 'sent', validUntil: '2026-11-05', sentAt: '2026-10-15T17:20:00Z',
    lines: [li('h1', 'Strip out and make good', 95000), li('h2', 'Bath, basin, WC and taps, supply and fit', 310000, 1, 'material'), li('h3', 'Tiling, floor and splashbacks', 180000), li('h4', 'Plumbing and first fix', 100000)],
    options: [
      { key: 'A', label: 'Like for like', lines: [li('h1', 'Strip out and make good', 95000), li('h2', 'Bath, basin, WC and taps, supply and fit', 310000, 1, 'material'), li('h3', 'Tiling, floor and splashbacks', 180000), li('h4', 'Plumbing and first fix', 100000)] },
      { key: 'B', label: 'Walk-in shower', lines: [li('h5', 'Strip out and make good', 95000), li('h6', 'Walk-in shower tray, screen and mixer', 268000, 1, 'material'), li('h7', 'Basin, WC and taps, supply and fit', 142000, 1, 'material'), li('h8', 'Tiling, full height in the shower', 226000), li('h9', 'Plumbing, first fix and thermostatic mixer', 128000)] },
      { key: 'C', label: 'Full wet room', lines: [li('h10', 'Strip out and make good', 95000), li('h11', 'Wet room tanking and former', 184000, 1, 'material'), li('h12', 'Shower, basin, wall-hung WC, supply and fit', 286000, 1, 'material'), li('h13', 'Tiling, floor to ceiling', 268000), li('h14', 'Plumbing, first fix and underfloor heating mat', 162000)] },
    ],
  },
  { id: 'quo_309', ref: 'Q-309', jobId: 'job_1040', customerId: 'cus_04', lines: [li('i', 'Rewire, 3 bed semi', 520000, 1, 'other')], status: 'accepted', validUntil: '2026-10-30', sentAt: '2026-10-09T09:00:00Z' },
  { id: 'quo_312', ref: 'Q-312', jobId: 'job_1052', customerId: 'cus_02', lines: [li('j', 'Cylinder thermostat and immersion', 38500)], status: 'draft', validUntil: '2026-11-01' },
  { id: 'quo_305', ref: 'Q-305', jobId: 'job_1019', customerId: 'cus_06', lines: [li('k', 'Air con service, 4 units', 64000)], status: 'declined', validUntil: '2026-10-12', sentAt: '2026-09-28T09:00:00Z' },
]

/** The firm's price list. Stocked items ride on the vans. */
export const priceList: PriceItem[] = [
  { id: 'itm_01', code: 'WB4000-30', name: 'Worcester Bosch 4000 30kW combi', kind: 'material', unit: 'each', price: 132000, cost: 98000, trade: 'gas', stocked: false },
  { id: 'itm_02', code: 'MF-22', name: 'Magnetic filter, 22mm', kind: 'material', unit: 'each', price: 14500, cost: 6200, trade: 'heating', stocked: true },
  { id: 'itm_03', code: 'CE-22', name: '22mm compression elbow', kind: 'material', unit: 'each', price: 450, cost: 180, trade: 'plumbing', stocked: true },
  { id: 'itm_04', code: 'CE-15', name: '15mm compression elbow', kind: 'material', unit: 'each', price: 380, cost: 140, trade: 'plumbing', stocked: true },
  { id: 'itm_05', code: 'CU-22', name: '22mm copper pipe', kind: 'material', unit: 'metre', price: 950, cost: 520, trade: 'plumbing', stocked: true },
  { id: 'itm_06', code: 'CU-15', name: '15mm copper pipe', kind: 'material', unit: 'metre', price: 650, cost: 330, trade: 'plumbing', stocked: true },
  { id: 'itm_07', code: 'TRV4', name: 'TRV, Drayton TRV4', kind: 'material', unit: 'each', price: 2200, cost: 1100, trade: 'heating', stocked: true },
  { id: 'itm_08', code: 'IV-15', name: '15mm isolating valve', kind: 'material', unit: 'each', price: 650, cost: 240, trade: 'plumbing', stocked: true },
  { id: 'itm_09', code: 'INH-1', name: 'Central heating inhibitor, 1 litre', kind: 'material', unit: 'each', price: 2400, cost: 1100, trade: 'heating', stocked: true },
  { id: 'itm_10', code: 'FX-1M', name: 'Flue extension, 1m', kind: 'material', unit: 'each', price: 6800, cost: 3900, trade: 'gas', stocked: true },
  { id: 'itm_11', code: 'RCBO-32A', name: 'RCBO, 32A type A', kind: 'material', unit: 'each', price: 3200, cost: 1650, trade: 'electrical', stocked: true },
  { id: 'itm_12', code: 'TE-25', name: '2.5mm twin and earth', kind: 'material', unit: 'metre', price: 180, cost: 85, trade: 'electrical', stocked: true },
  { id: 'itm_13', name: 'Engineer, per hour', kind: 'labour', unit: 'hour', price: 5500, stocked: false },
  { id: 'itm_14', name: 'Emergency call-out', kind: 'callout', unit: 'job', price: 9500, stocked: false },
  { id: 'itm_15', name: 'Landlord gas safety record', kind: 'labour', unit: 'job', price: 8500, trade: 'gas', stocked: false },
  { id: 'itm_16', name: 'Boiler service', kind: 'labour', unit: 'job', price: 9500, trade: 'gas', stocked: false },
]

const van = (operatorId: string, rows: [string, number, number][]): StockLevel[] => rows.map(([itemId, quantity, min]) => ({ operatorId, itemId, quantity, min }))

/** What's on each van this morning. Dan is low on 22mm elbows. */
export const stock: StockLevel[] = [
  ...van('opr_01', [['itm_02', 2, 1], ['itm_03', 2, 5], ['itm_04', 12, 6], ['itm_05', 8, 4], ['itm_06', 10, 4], ['itm_07', 6, 4], ['itm_08', 6, 4], ['itm_09', 4, 2], ['itm_10', 2, 1]]),
  ...van('opr_02', [['itm_11', 3, 2], ['itm_12', 40, 25]]),
  ...van('opr_03', [['itm_03', 9, 5], ['itm_04', 14, 6], ['itm_05', 6, 4], ['itm_06', 12, 4], ['itm_07', 3, 4], ['itm_08', 8, 4]]),
]

const passed = { flue: 'pass', ventilation: 'pass', safetyDevice: 'pass', spillage: 'pass' } as const
const app = (id: string, location: string, type: string, make: string, model: string, flue: GasAppliance['flue'], r: Partial<GasAppliance>): GasAppliance => ({
  id, location, type, make, model, flue, landlords: true, checks: { ...passed, ...(flue === 'flueless' ? { flue: 'n/a', spillage: 'n/a' } : flue === 'room_sealed' ? { spillage: 'n/a' } : {}) }, safe: true, ...r,
})

/** Last year's CP12 at The Crown & Anchor, so this year's starts from its four appliances. */
export const gasRecords: GasSafetyRecord[] = [
  {
    id: 'gsr_01', ref: 'CP-1001', jobId: 'job_1030', siteId: 'sit_03', customerId: 'cus_03', operatorId: 'opr_01', status: 'issued', issuedAt: '2025-10-21T14:10:00Z', expires: '2026-10-21', certificateId: 'cer_08',
    appliances: [
      app('app_01', 'Cellar', 'Boiler', 'Hamworthy', 'Wessex ModuMax 116', 'room_sealed', { pressure: 20.1, heatInput: 116, co: 18, co2: 9.1, ratio: 0.0002 }),
      app('app_02', 'Kitchen', 'Range cooker', 'Falcon', 'G3101', 'flueless', { pressure: 20.4, heatInput: 42 }),
      app('app_03', 'Bar', 'Gas fire', 'Gazco', 'Riva2 670', 'open_flue', { pressure: 19.8, heatInput: 5.6, co: 6, co2: 2.1, ratio: 0.0003 }),
      app('app_04', 'Flat above', 'Combi boiler', 'Vaillant', 'ecoTEC plus 832', 'room_sealed', { pressure: 20.0, heatInput: 32, co: 42, co2: 9.4, ratio: 0.0004 }),
    ],
    installation: { tightness: 'pass', ecv: 'pass', bonding: 'pass', pipework: 'pass', coAlarm: 'pass' },
  },
]

/** Weekly takings in pounds, last 8 weeks, oldest first. */
export const weeklyCash = [
  { week: '25 Aug', invoiced: 6200, paid: 5400 },
  { week: '1 Sep', invoiced: 7400, paid: 6900 },
  { week: '8 Sep', invoiced: 5900, paid: 6100 },
  { week: '15 Sep', invoiced: 8800, paid: 7200 },
  { week: '22 Sep', invoiced: 9600, paid: 8100 },
  { week: '29 Sep', invoiced: 7100, paid: 8400 },
  { week: '6 Oct', invoiced: 10200, paid: 8800 },
  { week: '13 Oct', invoiced: 11800, paid: 9300 },
]

export const invoiceTotal = (inv: Invoice) =>
  Math.round(inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * (1 + inv.vatRate / 10000))
