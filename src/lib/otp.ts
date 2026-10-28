const KEYWORD = /\b(code|otp|pin|passcode|password|verification|verify|confirmation|token)\b/i

interface Candidate {
  value: string
  code: string
  index: number
  alnum: boolean
}

function collect(text: string): Candidate[] {
  const found = new Map<string, Candidate>()
  const add = (index: number, value: string, code: string, alnum = false) => {
    const key = `${index}:${value}`
    if (value.length === 0 || found.has(key)) return
    found.set(key, { value, code, index, alnum })
  }

  for (const match of text.matchAll(/(?<![+\d])(\d{4,8})(?![\d])/g)) {
    add(match.index ?? 0, match[1], match[1])
  }

  for (const match of text.matchAll(/(?<![+\d])(\d{3})[ -](\d{3})(?![ -]?\d)/g)) {
    add(match.index ?? 0, match[0], `${match[1]}${match[2]}`)
  }

  for (const match of text.matchAll(/(?<![A-Z0-9])([A-Z]{1,2}-\d{4,7})(?!\d)/g)) {
    add(match.index ?? 0, match[1], match[1].replace(/^[A-Z]{1,2}-/, ''))
  }

  for (const match of text.matchAll(
    /(?<![A-Z0-9])((?=[A-Z0-9]{6}(?![A-Z0-9]))(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6})(?![A-Z0-9])/g,
  )) {
    add(match.index ?? 0, match[1], match[1], true)
  }

  return [...found.values()].sort((left, right) => left.index - right.index)
}

export function extractCode(body: string): string | null {
  if (!body) return null
  const text = body.replace(/\s+/g, ' ').trim()
  const candidates = collect(text)
  if (candidates.length === 0) return null

  const keyword = KEYWORD.exec(text)
  if (!keyword) {
    const sixDigit = candidates.filter((candidate) => /^\d{6}$/.test(candidate.code))
    if (sixDigit.length === 1) return sixDigit[0].code
    const numeric = candidates.filter((candidate) => !candidate.alnum)
    return numeric.length === 1 ? numeric[0].code : null
  }

  const keywordEnd = keyword.index + keyword[0].length
  let best: Candidate | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const after = candidate.index >= keywordEnd
    const distance = after
      ? candidate.index - keywordEnd
      : keyword.index - (candidate.index + candidate.value.length) + 100
    if (distance < 0) continue
    const score = distance + (candidate.alnum ? 2 : 0)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best ? best.code : null
}
