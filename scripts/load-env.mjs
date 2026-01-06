import fs from 'node:fs'
import path from 'node:path'

function parseEnvFile(contents) {
  const out = {}
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    out[key] = value
  }
  return out
}

export function loadEnvFiles({ cwd = process.cwd() } = {}) {
  // Match Next.js precedence: .env.local then .env
  const files = ['.env.local', '.env']
  for (const f of files) {
    const p = path.join(cwd, f)
    if (!fs.existsSync(p)) continue
    try {
      const parsed = parseEnvFile(fs.readFileSync(p, 'utf8'))
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) {
          process.env[k] = String(v)
        }
      }
    } catch {
      // ignore unreadable env files
    }
  }
}

// Auto-load on import.
loadEnvFiles()


