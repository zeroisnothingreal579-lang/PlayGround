const { ipcRenderer } = require('electron')

function send(payload) {
  try {
    ipcRenderer.sendToHost('sv:event', payload)
  } catch {}
}

function selectorFor(node) {
  if (!node || node.nodeType !== 1) return null
  if (node.id) return `#${CSS.escape(node.id)}`

  const parts = []
  let el = node
  while (el && el.nodeType === 1 && parts.length < 6) {
    let part = el.tagName.toLowerCase()
    const parent = el.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => child.tagName === el.tagName)
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(el) + 1})`
    }
    parts.unshift(part)
    el = parent
  }
  return parts.join(' > ')
}

let scrollQueued = false

window.addEventListener('scroll', () => {
  if (scrollQueued) return
  scrollQueued = true
  setTimeout(() => {
    scrollQueued = false
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    send({ type: 'scroll', ratio: Math.min(1, Math.max(0, window.scrollY / max)) })
  }, 120)
}, { passive: true })

window.addEventListener('click', event => {
  send({
    type: 'click',
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
    selector: selectorFor(event.target)
  })
}, true)

window.addEventListener('input', event => {
  const el = event.target
  if (!el) return
  const value = el.isContentEditable ? el.textContent : el.value
  if (value === undefined) return
  send({
    type: 'input',
    selector: selectorFor(el),
    value: String(value),
    editable: Boolean(el.isContentEditable)
  })
}, true)

window.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    send({ type: 'key', key: 'Enter', selector: selectorFor(event.target) })
  }
}, true)
