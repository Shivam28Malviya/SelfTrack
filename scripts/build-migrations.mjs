// Embeds db/migrations/*.sql into lib/tp/migrations.js.
//
// The serverless bundle only ships files the tracer can see, and a
// readFileSync on a computed path is not one of them — so the migrations have
// to exist as code for the in-app migrate endpoint to apply them. This script
// generates that file; `npm test` fails if the two ever drift apart.
//
// Usage: npm run build:migrations
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../db/migrations/', import.meta.url))
const out = fileURLToPath(new URL('../lib/tp/migrations.js', import.meta.url))

export function buildSource() {
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const entries = files.map(name => {
    const sql = readFileSync(dir + name, 'utf8')
    // Backticks and ${ would break the template literal this is embedded in.
    if (sql.includes('`') || sql.includes('${')) {
      throw new Error(`${name} contains a backtick or \${, which cannot be embedded`)
    }
    return `  {\n    name: ${JSON.stringify(name)},\n    sql: \`\n${sql}\`,\n  },`
  })

  return `// GENERATED FILE — do not edit.
// Source: db/migrations/*.sql · regenerate with \`npm run build:migrations\`.
//
// These are embedded rather than read from disk because the serverless bundle
// does not ship files reached through a computed path, and the in-app migrate
// endpoint has to apply them from inside a deployed function.
export const MIGRATIONS = [
${entries.join('\n')}
]
`
}

if (process.argv[1] && process.argv[1].endsWith('build-migrations.mjs')) {
  writeFileSync(out, buildSource())
  console.log(`Wrote ${out}`)
}
