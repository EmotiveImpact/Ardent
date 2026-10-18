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
