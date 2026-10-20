// Mobile menu: full screen, slides in from the right
const toggle = document.querySelector('.nav__toggle')
const mnav = document.getElementById('mobile-menu')
const closeBtn = mnav.querySelector('.mnav__close')

function openMenu() {
  mnav.hidden = false
  requestAnimationFrame(() => requestAnimationFrame(() => {
    mnav.classList.add('is-open')
    closeBtn.focus({ preventScroll: true })
  }))
  document.body.classList.add('menu-open')
  toggle.setAttribute('aria-expanded', 'true')
}

function closeMenu({ restoreFocus = true } = {}) {
  if (!mnav.classList.contains('is-open')) return
  mnav.classList.remove('is-open')
  document.body.classList.remove('menu-open')
  toggle.setAttribute('aria-expanded', 'false')
  mnav.addEventListener('transitionend', function done(e) {
    if (e.target !== mnav || e.propertyName !== 'transform') return
    mnav.removeEventListener('transitionend', done)
    if (!mnav.classList.contains('is-open')) mnav.hidden = true
  })
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) mnav.hidden = true
  if (restoreFocus) toggle.focus({ preventScroll: true })
}

toggle.addEventListener('click', openMenu)
closeBtn.addEventListener('click', () => closeMenu())
mnav.addEventListener('click', (e) => {
  if (e.target.closest('.mnav__links a, .mnav__foot a')) closeMenu({ restoreFocus: false })
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu()
  // Keep keyboard focus inside the open menu
  if (e.key === 'Tab' && mnav.classList.contains('is-open')) {
    const items = mnav.querySelectorAll('a, button')
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
})
matchMedia('(min-width: 821px)').addEventListener('change', (e) => {
  if (e.matches) closeMenu({ restoreFocus: false })
})

// Until the GPT Image renders exist in images/, show a labelled placeholder
// carrying the prompt that will produce each one.
const promptsReady = fetch('images/prompts.json')
  .then((r) => (r.ok ? r.json() : { images: [] }))
  .catch(() => ({ images: [] }))

function markPlaceholder(figure) {
  if (figure.classList.contains('is-placeholder')) return
  figure.classList.add('is-placeholder')
  figure.querySelector('img')?.remove()
  const label = document.createElement('figcaption')
  label.className = 'ph-label'
  label.innerHTML = `<b>GPT Image placeholder &middot; ${figure.dataset.img}</b><span></span>`
  figure.append(label)
  promptsReady.then(({ images }) => {
    const entry = images.find((i) => i.id === figure.dataset.img)
    if (entry) label.querySelector('span').textContent = entry.prompt
  })
}

document.querySelectorAll('.shot[data-img]').forEach((figure) => {
  const img = figure.querySelector('img')
  if (!img) return markPlaceholder(figure)
  if (img.complete && img.naturalWidth === 0) return markPlaceholder(figure)
  img.addEventListener('error', () => markPlaceholder(figure), { once: true })
})

// Trades list: hovering or focusing a trade shows its photograph; clicking opens its page
const tradeItems = document.querySelectorAll('.trades__item')
const tradeShots = document.querySelectorAll('.trades__shot')
const tradeCount = document.querySelector('.trades__count')

function showTrade(key) {
  tradeItems.forEach((item, i) => {
    const on = item.dataset.trade === key
    item.classList.toggle('is-active', on)
    if (on && tradeCount) tradeCount.textContent = String(i + 1).padStart(2, '0')
  })
  tradeShots.forEach((shot) => shot.classList.toggle('is-active', shot.dataset.trade === key))
}

tradeItems.forEach((item) => {
  const show = () => showTrade(item.dataset.trade)
  item.addEventListener('mouseenter', show)
  item.addEventListener('focus', show)
})

// Console: tabs that switch between real product screens
const consoleTabs = [...document.querySelectorAll('.console__tab')]

function showScreen(tab, focus = false) {
  consoleTabs.forEach((t) => {
    const on = t === tab
    t.classList.toggle('is-active', on)
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  })
  if (focus) tab.focus()
}

consoleTabs.forEach((tab, i) => {
  tab.addEventListener('click', () => showScreen(tab))
  tab.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    showScreen(consoleTabs[(i + step + consoleTabs.length) % consoleTabs.length], true)
  })
})

// Demo form: posts JSON to data-endpoint when one is set, otherwise opens an
// email to data-email with the details filled in.
const demoForm = document.getElementById('demo-form')

if (demoForm) {
  const error = demoForm.querySelector('.demo__error')
  const done = demoForm.querySelector('.demo__done')
  const submit = demoForm.querySelector('[type="submit"]')

  document.querySelectorAll('[data-plan]').forEach((link) => {
    link.addEventListener('click', () => { demoForm.elements.plan.value = link.dataset.plan })
  })

  demoForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    error.hidden = true
    let firstBad = null
    demoForm.querySelectorAll('input, select, textarea').forEach((el) => {
      const bad = !el.checkValidity()
      el.closest('.field2')?.classList.toggle('is-invalid', bad)
      if (bad && !firstBad) firstBad = el
    })
    if (firstBad) {
      error.textContent = 'Please fill in the highlighted fields.'
      error.hidden = false
      firstBad.focus()
      return
    }

    const data = Object.fromEntries(new FormData(demoForm))
    const endpoint = demoForm.dataset.endpoint
    submit.disabled = true

    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(res.status)
      } else {
        const body = Object.entries(data).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
        location.href = `mailto:${demoForm.dataset.email}?subject=${encodeURIComponent(`Demo request: ${data.company}`)}&body=${encodeURIComponent(body)}`
        done.querySelector('h3').textContent = 'Your email app should open with your details filled in. Press send and we\u2019ll call you to book a time.'
      }
      demoForm.classList.add('is-sent')
      done.hidden = false
    } catch {
      error.textContent = `That didn't send. Please try again or email ${demoForm.dataset.email}.`
      error.hidden = false
    } finally {
      submit.disabled = false
    }
  })

  demoForm.addEventListener('input', (e) => {
    if (e.target.checkValidity()) e.target.closest('.field2')?.classList.remove('is-invalid')
  })
}

// News: filter the stories by topic. The hash (news.html#Guides) picks a topic on load.
const newsFilters = [...document.querySelectorAll('.news__chipbtn')]

function filterNews(cat) {
  let shown = 0
  newsFilters.forEach((b) => {
    const on = b.dataset.filter === cat
    b.classList.toggle('is-active', on)
    b.setAttribute('aria-pressed', String(on))
  })
  document.querySelectorAll('.news [data-cat]').forEach((el) => {
    const show = cat === 'All' || el.dataset.cat === cat
    el.hidden = !show
    if (show) shown++
  })
  const empty = document.querySelector('.news__empty')
  if (empty) empty.hidden = shown > 0
}

if (newsFilters.length) {
  newsFilters.forEach((b) => b.addEventListener('click', () => {
    filterNews(b.dataset.filter)
    history.replaceState(null, '', b.dataset.filter === 'All' ? location.pathname : `#${b.dataset.filter}`)
  }))
  const fromHash = decodeURIComponent(location.hash.slice(1))
  if (newsFilters.some((b) => b.dataset.filter === fromHash)) filterNews(fromHash)
}

// The Ardent Brief sign-up: posts to data-endpoint when set, otherwise opens an email
document.querySelectorAll('form.brief').forEach((form) => {
  const msg = form.querySelector('.brief__msg')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = form.elements.email
    if (!input.checkValidity()) {
      form.classList.add('is-invalid')
      msg.textContent = 'Please enter a valid email address.'
      msg.hidden = false
      input.focus()
      return
    }
    form.classList.remove('is-invalid')
    try {
      if (form.dataset.endpoint) {
        const res = await fetch(form.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: input.value }),
        })
        if (!res.ok) throw new Error(res.status)
        msg.textContent = 'You are on the list. First Brief lands next month.'
      } else {
        location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent('Subscribe me to the Ardent Brief')}&body=${encodeURIComponent(input.value)}`
        msg.textContent = 'Your email app should open. Press send to subscribe.'
      }
      form.classList.add('is-done')
    } catch {
      msg.textContent = `That didn't send. Please try again or email ${form.dataset.email}.`
    }
    msg.hidden = false
  })
})

// Header video: never play for people who ask for reduced motion
const heroVideo = document.querySelector('.hero__video')
if (heroVideo && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  heroVideo.pause()
  heroVideo.removeAttribute('autoplay')
}

// Live shift clock in the hero readout
const shiftClock = document.querySelector('.js-clock')
if (shiftClock) {
  const tick = () => { shiftClock.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
  tick()
  setInterval(tick, 30000)
}

// Role select: hovering, focusing or tapping a card opens it out
const roleCards = [...document.querySelectorAll('.role')]
function openRole(card) {
  roleCards.forEach((c) => {
    const on = c === card
    c.classList.toggle('is-active', on)
    c.querySelector('.role__hit').setAttribute('aria-expanded', String(on))
  })
}
const canHover = matchMedia('(hover: hover)').matches
roleCards.forEach((card) => {
  card.querySelector('.role__hit').addEventListener('click', () => openRole(card))
  if (canHover) card.addEventListener('mouseenter', () => openRole(card))
  card.addEventListener('focusin', () => openRole(card))
})

// Every page opens at the top unless the link points at a section.
// Some hosts (the preview included) restore the old scroll after load,
// so keep pinning to the top until the visitor scrolls themselves.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
const root = document.documentElement
function toTop() {
  if (location.hash) return
  root.style.scrollBehavior = 'auto'
  scrollTo(0, 0)
  root.scrollTop = 0
  document.body.scrollTop = 0
  // Also scrolls an embedding frame's page, where the browser allows it
  try { (document.body || root).scrollIntoView({ block: 'start' }) } catch (e) {}
  requestAnimationFrame(() => { root.style.scrollBehavior = '' })
}
let userScrolled = false
const stopPinning = () => { userScrolled = true }
;['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((e) => addEventListener(e, stopPinning, { once: true, passive: true }))
toTop()
const pin = () => { if (!userScrolled) toTop() }
addEventListener('DOMContentLoaded', pin)
addEventListener('load', () => { pin(); [60, 200, 500, 1000].forEach((t) => setTimeout(pin, t)) })
addEventListener('pageshow', pin)
// Leaving for another page: go to the top first, so a host that swaps
// pages in place never carries the old position across
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]')
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return
  const url = new URL(a.href, location.href)
  if (url.pathname === location.pathname) return
  root.style.scrollBehavior = 'auto'
  scrollTo(0, 0)
})

// Sticky top menu: a spacer holds its place, the bar darkens once you scroll
const topNav = document.querySelector('.nav')
if (topNav) {
  const spacer = document.createElement('div')
  spacer.className = 'nav-spacer'
  spacer.setAttribute('aria-hidden', 'true')
  topNav.before(spacer)
  // Lift the bar out of the hero so no section can paint over it
  document.body.prepend(topNav)
  const fit = () => { spacer.style.height = topNav.offsetHeight + 'px' }
  fit()
  addEventListener('resize', fit)
  topNav.classList.add('is-fixed')
  const shade = () => topNav.classList.toggle('is-scrolled', scrollY > 8)
  shade()
  addEventListener('scroll', shade, { passive: true })
}
