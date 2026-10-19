// Builds one page per trade (for-<slug>.html) from the data below, reusing
// the menu and footer from product.html. Run: node scripts/build-trades.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const trades = [
  {
    slug: 'electricians', name: 'Electricians', short: 'Electrical',
    title: 'Ardent for electricians',
    headline: 'Test it, certify it, get paid for it.',
    intro: 'From domestic rewires to commercial maintenance, Ardent turns your test results into certificates on site and files them against the property, ready for the next inspection.',
    alt: 'An electrician pulling cable through tray in a commercial ceiling void',
    features: [
      ['Certificates from the job', 'EICs, EICRs and Minor Works certificates are filled in from the job sheet, with schedules of test results captured on the phone.'],
      ['Landlord inspections on repeat', 'Every EICR carries its next due date. Ardent books the re-inspection and reminds the landlord or agent before it lapses.'],
      ['Observations that turn into work', 'C1, C2 and FI codes on a report become a quote in one tap, so remedial work is priced while you are still on site.'],
      ['Scheme audits without the panic', 'Every certificate, photo and test result is kept against the job, ready for your NICEIC or NAPIT assessor.'],
    ],
    certs: [
      ['EIC', 'Electrical Installation Certificate', 'New circuits and installations'],
      ['EICR', 'Electrical Installation Condition Report', 'Periodic inspection, including landlord checks every five years'],
      ['MEIWC', 'Minor Electrical Installation Works Certificate', 'Additions and alterations to a circuit'],
      ['PAT', 'Portable appliance testing', 'Asset registers and retest dates'],
    ],
    shot: ['certs', 'Ardent certificate register with EICR and PAT expiry dates'],
  },
  {
    slug: 'gas', name: 'Gas & heating engineers', short: 'Gas and heating',
    title: 'Ardent for gas and heating engineers',
    headline: 'Every appliance safe, every record filed.',
    intro: 'Boiler swaps, services and landlord safety checks, with Gas Safe numbers checked before dispatch and every record issued before you leave the property.',
    alt: 'A heating engineer on a rooftop beside heat pump units at golden hour',
    features: [
      ['Gas safety records in minutes', 'Appliance checks, flue readings and tightness tests go straight into the record, signed on the phone and emailed to the landlord.'],
      ['Annual checks booked for you', 'Ardent tracks every landlord property and books the next safety check before the twelve months are up.'],
      ['Gates on the job', 'A gas job cannot close without its tightness test, and an engineer with a lapsed registration cannot be dispatched to it.'],
      ['Installs that commission cleanly', 'Commissioning records, Building Regulations notifications and manufacturer warranties are captured at handover.'],
    ],
    certs: [
      ['CP12', 'Landlord gas safety record', 'Annual check on every gas appliance in a let property'],
      ['SERVICE', 'Boiler service record', 'Readings and checks against the manufacturer&rsquo;s instructions'],
      ['WARNING', 'Warning notice', 'At risk and immediately dangerous situations, recorded with photos'],
      ['COMM', 'Commissioning record', 'New boilers and heat pumps, ready for the warranty'],
    ],
    shot: ['jobsheet', 'Ardent live job sheet for a combi boiler swap with Gas Safe and tightness test gates'],
  },
  {
    slug: 'plumbers', name: 'Plumbers', short: 'Plumbing',
    title: 'Ardent for plumbers',
    headline: 'From the leak call to the paid invoice.',
    intro: 'Emergency call-outs, bathroom fits and planned work, with quotes sent from site and invoices out the moment the job is signed off.',
    alt: 'A plumber working under a kitchen sink by torchlight',
    features: [
      ['Emergencies dispatched fast', 'A burst pipe goes to the nearest free plumber, with the customer told who is coming and when.'],
      ['Quotes from the van', 'Price a bathroom or a repipe on site with photos and your own price list, and get a yes before you drive off.'],
      ['Invoices that chase themselves', 'Jobs turn into invoices without retyping, and overdue ones are chased for you.'],
      ['Proof for every job', 'Before and after photos, materials used and customer signatures are kept against the property.'],
    ],
    certs: [
      ['G3', 'Unvented hot water certificate', 'Installation and annual service of unvented cylinders'],
      ['BUILDING REGS', 'Compliance notification', 'Notifiable work logged with the job'],
      ['RISK', 'Legionella risk assessment', 'Water hygiene checks for landlords and businesses'],
      ['WATER REGS', 'Water fittings compliance', 'Installations recorded against the regulations'],
    ],
    shot: ['invoices', 'Ardent invoices list with sent, paid, overdue and part-paid statuses'],
  },
  {
    slug: 'fire', name: 'Fire & security', short: 'Fire and security',
    title: 'Ardent for fire and security engineers',
    headline: 'Every device tested, every visit on record.',
    intro: 'Fire alarms, emergency lighting, fire doors and access control, with maintenance visits planned months ahead and certificates issued from site.',
    alt: 'A fire engineer testing a ceiling smoke detector in a dark office corridor',
    features: [
      ['Planned maintenance on autopilot', 'Quarterly and six-monthly visits are booked from the contract, so no site falls through the gaps.'],
      ['Device-by-device testing', 'Each detector, call point and light fitting is ticked off on the phone, with faults raised as follow-up work.'],
      ['Certificates the client can trust', 'Commissioning, inspection and servicing certificates are issued from the visit and sent to the responsible person.'],
      ['Ready for your BAFE or NSI audit', 'Engineer competence, visit records and certificates are kept together, ready for inspection.'],
    ],
    certs: [
      ['BS 5839', 'Fire alarm certificates', 'Design, installation, commissioning and servicing'],
      ['BS 5266', 'Emergency lighting certificates', 'Monthly, annual and full duration tests'],
      ['FIRE DOOR', 'Fire door inspection', 'Door-by-door condition reports with photos'],
      ['BS 5306', 'Extinguisher servicing', 'Annual service and asset register'],
    ],
    shot: ['certs', 'Ardent certificate register including BS 5839 fire alarm certificates'],
  },
  {
    slug: 'hvac', name: 'HVAC & refrigeration', short: 'HVAC and refrigeration',
    title: 'Ardent for HVAC and refrigeration engineers',
    headline: 'Keep the plant running and the logs straight.',
    intro: 'Planned maintenance, breakdowns and installs across commercial sites, with refrigerant records kept as you work and leak checks booked on time.',
    alt: 'A refrigeration engineer connecting gauges to a condensing unit',
    features: [
      ['F-gas records as you go', 'Refrigerant added and recovered is logged against the system on site, building the record your clients are required to keep.'],
      ['Leak checks on schedule', 'Ardent works out each system&rsquo;s check frequency and books the next visit automatically.'],
      ['Breakdowns triaged fast', 'Reactive calls go to the nearest engineer with the right qualification and the parts history for that unit.'],
      ['Contracts that pay off', 'Planned maintenance contracts drive the schedule, and every visit is invoiced against the contract.'],
    ],
    certs: [
      ['F-GAS', 'Refrigerant records', 'Charge, top-ups and recovery for every system'],
      ['LEAK', 'Leak check record', 'Checks at the frequency each system requires'],
      ['TM44', 'Air conditioning inspection', 'Energy assessments for larger systems'],
      ['PPM', 'Planned maintenance report', 'Visit reports sent to the client after every service'],
    ],
    shot: ['dispatch', 'Ardent dispatch board planning maintenance visits across the day'],
  },
  {
    slug: 'lifts', name: 'Lift engineers', short: 'Lifts',
    title: 'Ardent for lift engineers',
    headline: 'Every lift serviced, every entrapment answered.',
    intro: 'Maintenance rounds, thorough examinations and emergency call-outs, with every visit logged against the lift and the building.',
    alt: 'Looking up a lift shaft towards an engineer on top of the lift car',
    features: [
      ['Entrapments first', 'Emergency calls jump the queue and go to the nearest engineer, with the building told the moment someone is on the way.'],
      ['Maintenance rounds planned', 'Regular visits are booked from each contract, grouped by area so engineers spend less time driving.'],
      ['Examinations on time', 'Thorough examination dates are tracked for every lift, with defects raised as quotes for the building owner.'],
      ['A history for every lift', 'Visits, parts and faults are kept against each lift, so the next engineer knows what happened last time.'],
    ],
    certs: [
      ['LOLER', 'Thorough examination report', 'Six-monthly for passenger lifts'],
      ['SERVICE', 'Maintenance visit report', 'Checks and adjustments on every visit'],
      ['DEFECT', 'Defect report', 'Faults raised with photos and a quote'],
      ['CALL-OUT', 'Entrapment and breakdown log', 'Response times recorded for every call'],
    ],
    shot: ['crew', 'Ardent crew map showing engineers on site and en route'],
  },
  {
    slug: 'roofers', name: 'Roofers', short: 'Roofing',
    title: 'Ardent for roofers',
    headline: 'Plan around the weather, prove the work.',
    intro: 'Repairs, re-roofs and inspections, with photo evidence from every stage and jobs moved around the forecast without losing track of them.',
    alt: 'A roofer laying slates on a pitched roof at dusk',
    features: [
      ['Weather-proof scheduling', 'Rained off? Move the day&rsquo;s jobs in one go and let customers know automatically.'],
      ['Photos that win arguments', 'Before, during and after photos are stamped with time and place and kept against the job.'],
      ['Quotes from the ladder', 'Measure, photograph and price on site, and send the quote before you drive off.'],
      ['Safety signed off', 'RAMS and working at height checks are signed before work starts, every time.'],
    ],
    certs: [
      ['RAMS', 'Risk assessment and method statement', 'Signed on site before work starts'],
      ['SURVEY', 'Roof condition report', 'Photo-led reports for homeowners and agents'],
      ['GUARANTEE', 'Workmanship guarantee', 'Issued at handover and kept with the job'],
      ['BUILDING REGS', 'Compliance notification', 'Re-roofs logged with the job'],
    ],
    shot: ['waiting', 'Ardent jobs waiting for a slot, ready to be assigned'],
  },
  {
    slug: 'bricklayers', name: 'Bricklayers', short: 'Bricklaying',
    title: 'Ardent for bricklayers',
    headline: 'Every course logged, every stage signed off.',
    intro: 'Extensions, new builds and repairs, with gangs, materials and stage payments tracked from the first lift to the last course.',
    alt: 'A bricklayer in a hi-vis vest beside scaffold sheeting and a pallet of bricks at dusk',
    features: [
      ['Gangs where they are needed', 'Plan bricklayers and labourers across sites on one board, and move a gang in seconds when a delivery slips.'],
      ['Stage payments that land', 'Footings, DPC, wall plate: each stage is photographed, signed off and invoiced the same day.'],
      ['Materials against the job', 'Brick, block and mortar orders sit against the job, so you know what was used and what to charge.'],
      ['Snags closed on site', 'Snags are raised with photos, fixed and signed off before you leave, with the evidence kept for the main contractor.'],
    ],
    certs: [
      ['RAMS', 'Risk assessment and method statement', 'Signed on site before work starts'],
      ['SCAFF', 'Scaffold inspection record', 'Weekly checks logged with photos'],
      ['STAGE', 'Stage sign-off', 'Each stage photographed and approved before it is invoiced'],
      ['CSCS', 'Card checks', 'Every operative&rsquo;s card checked before they start'],
    ],
    shot: ['crew', 'Ardent crew map showing gangs on site and en route'],
  },
  {
    slug: 'landscapers', name: 'Landscapers', short: 'Landscaping',
    title: 'Ardent for landscapers',
    headline: 'Rounds on time, gardens on record.',
    intro: 'Maintenance rounds, hard landscaping and grounds contracts, with every visit planned, photographed and billed without the paperwork.',
    alt: 'A landscaper holding shears on a lawn beside a clipped hedge in the early morning mist',
    features: [
      ['Rounds that plan themselves', 'Regular visits build the week for you, grouped by area so the van spends less time on the road.'],
      ['Seasons in the schedule', 'Cutting, pruning and leaf clearance follow the calendar, and Ardent moves the work when the weather turns.'],
      ['Proof of every visit', 'Before and after photos are stamped with time and place, so a grounds contract is easy to prove.'],
      ['Quotes for the big jobs', 'Patios, fencing and planting are measured and priced on site, with materials added from your price list.'],
    ],
    certs: [
      ['RAMS', 'Risk assessment and method statement', 'Signed on site before work starts'],
      ['PA1/PA6', 'Pesticide spraying records', 'Products, rates and areas logged with every application'],
      ['VISIT', 'Visit report', 'Photos and notes sent to the client after each visit'],
      ['TREE', 'Tree work survey', 'Findings and recommendations with photos'],
    ],
    shot: ['waiting', 'Ardent jobs waiting for a slot, ready to be assigned'],
  },
  {
    slug: 'multi', name: 'Multi-trade contractors', short: 'Multi-trade',
    title: 'Ardent for multi-trade contractors',
    headline: 'Every trade, one job, one record.',
    intro: 'Facilities work and planned maintenance across trades, with the right engineer and the right accreditation on every visit.',
    alt: 'A crew of three tradespeople walking from their vans to a building',
    features: [
      ['The right trade on every visit', 'Ardent matches each job to an engineer with the right trade and current tickets, including your subcontractors.'],
      ['One job, many trades', 'An electrician, a plumber and a decorator can work on the same job, each with their own tasks and sign-off.'],
      ['Contracts that run themselves', 'Planned preventative maintenance builds the schedule, and reactive work is logged against the same contract.'],
      ['Reports clients actually read', 'Every visit produces a clean report with photos and certificates, sent to the client automatically.'],
    ],
    certs: [
      ['ALL', 'Every certificate in one register', 'Gas, electrical, fire, water and lifts together'],
      ['PPM', 'Planned maintenance schedules', 'Task lists for every asset on every site'],
      ['RAMS', 'Risk assessments', 'Signed by every trade before work starts'],
      ['SUBBIES', 'Subcontractor accreditations', 'Insurance and tickets checked before dispatch'],
    ],
    shot: ['dispatch', 'Ardent dispatch board with jobs across several trades'],
  },
]

const base = readFileSync(join(root, 'product.html'), 'utf8')
const top = base.slice(0, base.indexOf('  <main>'))
  .replace(/ aria-current="page"/g, '')
const foot = base.slice(base.indexOf('  <footer'))

const page = (t) => {
  const head = top
    .replace(/<title>[^<]*<\/title>/, `<title>Ardent | ${t.short}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${t.title}: ${t.intro.replace(/<[^>]+>/g, '')}">`)
    .replace('<body class="page page--ink">', '<body class="page page--ink page--trade">')
  const others = trades.filter((o) => o !== t)
    .map((o) => `<li><a href="for-${o.slug}.html"><img src="images/trade-${o.slug}.jpg" alt="" loading="lazy"><span>${o.name}</span></a></li>`).join('\n          ')
  return `${head}  <main>
    <section class="tp-hero wrap">
      <div class="tp-hero__text">
        <p class="eyebrow mono"><a href="index.html#trades">Trades</a> / ${t.short}</p>
        <h1>${t.headline}</h1>
        <p class="tp-hero__intro">${t.intro}</p>
        <div class="btns">
          <a class="btn btn--light" href="pricing.html#demo">Book a demo</a>
          <a class="btn btn--ghost" href="pricing.html">See pricing</a>
        </div>
        <ul class="tp-chips mono">${t.certs.map(([code]) => `<li>${code}</li>`).join('')}</ul>
      </div>
      <figure class="shot tp-hero__shot" data-img="trade-${t.slug}">
        <img src="images/trade-${t.slug}.jpg" alt="${t.alt}">
      </figure>
    </section>

    <section class="tp-features wrap">
      <h2>What Ardent handles for ${t.short.toLowerCase()} businesses</h2>
      <ol class="tp-grid">
        ${t.features.map(([h, p], i) => `<li><span class="mono">0${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('\n        ')}
      </ol>
    </section>

    <section class="tp-certs wrap">
      <div>
        <p class="eyebrow mono">+ Certificates and records</p>
        <h2>Issued from the job, filed against the property.</h2>
      </div>
      <ul class="tp-certs__list">
        ${t.certs.map(([code, name, note]) => `<li><span class="mono">${code}</span><b>${name}</b><em>${note}</em></li>`).join('\n        ')}
      </ul>
    </section>

    <section class="feat wrap">
      <div class="feat__text">
        <p class="eyebrow mono"><span>+</span> Inside Ardent</p>
        <h2>Built around the way you already work.</h2>
        <p>The office plans and tracks the work in Ardent. Engineers see the same job on their phone, with or without signal.</p>
        <a class="btn btn--dark tp-more" href="product.html">Explore the product</a>
      </div>
      <figure class="feat__shot"><img src="images/ui-${t.shot[0]}.jpg" alt="${t.shot[1]}" loading="lazy"></figure>
    </section>

    <section class="tp-others wrap">
      <p class="eyebrow mono">+ Other trades</p>
      <ul>
          ${others}
      </ul>
    </section>
  </main>

${foot}`
}

for (const t of trades) writeFileSync(join(root, `for-${t.slug}.html`), page(t))
console.log(`Built ${trades.length} trade pages`)
