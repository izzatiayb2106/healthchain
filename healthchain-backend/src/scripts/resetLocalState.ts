import fs from 'node:fs'
import path from 'node:path'

type ResetTarget = {
  relativePath: string
  payload: unknown
}

const dataDir = path.resolve(__dirname, '..', 'data')

const resetTargets: ResetTarget[] = [
  {
    relativePath: 'hybrid-credentials.json',
    payload: { records: [] },
  },
  
]

function writeJsonFile(filePath: string, payload: unknown): void {
  const content = `${JSON.stringify(payload, null, 2)}\n`
  fs.writeFileSync(filePath, content, 'utf8')
}

function run(): void {
  console.log('Resetting selected backend runtime state files...')

  for (const target of resetTargets) {
    const absolutePath = path.join(dataDir, target.relativePath)
    writeJsonFile(absolutePath, target.payload)
    console.log(`- Reset ${target.relativePath}`)
  }

  console.log('Done. Selected runtime JSON files were reset (identity/profile stores are preserved).')
}

run()
