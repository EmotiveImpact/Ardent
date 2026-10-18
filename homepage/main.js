// Menu toggle
const menu = document.querySelector('.nav__menu')
const panel = document.querySelector('.nav__panel')
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') === 'true'
  menu.setAttribute('aria-expanded', String(!open))
  panel.hidden = open
})
panel.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    menu.setAttribute('aria-expanded', 'false')
    panel.hidden = true
  }
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
