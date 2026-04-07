import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { ethers } from 'ethers'
import { fundWalletIfNeeded } from '../services/walletFundingService'

dotenv.config()

type WalletSource = {
  wallet: string
  source: string
}

const dataDir = path.resolve(__dirname, '..', 'data')

const defaultFundingSourceFiles = [
  'identity-mappings.json',
  'doctor-profiles.json',
  'verifier-profiles.json',
  'patient-profiles.json',
  'doctor-pending-patients.json',
  'ministry-license-registry.json',
]

function resolveFundingSourceFiles(dirPath: string): string[] {
  const configured = String(process.env.AUTO_FUND_FILES || '').trim()
  const candidates = configured
    ? configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : defaultFundingSourceFiles

  const unique = Array.from(new Set(candidates))
  return unique.filter((name) => fs.existsSync(path.join(dirPath, name)))
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function collectWalletSources(node: unknown, sourcePrefix: string, sources: WalletSource[]): void {
  if (node === null || node === undefined) return

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      collectWalletSources(node[i], `${sourcePrefix}[${i}]`, sources)
    }
    return
  }

  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const source = `${sourcePrefix}.${key}`
      const keyLower = key.toLowerCase()
      const isWalletField = keyLower.includes('wallet')

      if (typeof value === 'string' && ethers.isAddress(value) && isWalletField) {
        sources.push({ wallet: ethers.getAddress(value).toLowerCase(), source })
      } else {
        collectWalletSources(value, source, sources)
      }
    }
  }
}

function getWalletsFromDataDir(dirPath: string): Map<string, Set<string>> {
  const discovered = new Map<string, Set<string>>()
  const files = resolveFundingSourceFiles(dirPath)

  if (files.length === 0) {
    console.log('[fund] No funding source files found in backend data directory.')
    return discovered
  }

  console.log(`[fund] Scanning files: ${files.join(', ')}`)

  for (const fileName of files) {
    const absolutePath = path.join(dirPath, fileName)
    const json = readJson(absolutePath)
    const sources: WalletSource[] = []
    collectWalletSources(json, fileName, sources)

    for (const item of sources) {
      const existing = discovered.get(item.wallet) || new Set<string>()
      existing.add(item.source)
      discovered.set(item.wallet, existing)
    }
  }

  return discovered
}

async function main() {
  const discovered = getWalletsFromDataDir(dataDir)
  if (discovered.size === 0) {
    console.log('[fund] No wallets discovered in backend data files. Nothing to fund.')
    return
  }

  console.log(`[fund] Discovered ${discovered.size} wallet(s) from ${dataDir}`)
  let fundedCount = 0
  let skippedCount = 0

  for (const [wallet, sourceSet] of discovered.entries()) {
    const source = Array.from(sourceSet).join(', ')
    const result = await fundWalletIfNeeded(wallet, source)

    if (result.status === 'funded') {
      fundedCount += 1
      console.log(
        `[fund] Funded ${result.wallet} +${result.fundedEth} ETH from ${source} (tx: ${result.txHash}) -> new balance ${result.balanceAfter} ETH`
      )
      continue
    }

    skippedCount += 1
    console.log(`[fund] Skip ${result.wallet} from ${source}: ${result.reason}`)
  }

  console.log(`[fund] Completed. Funded ${fundedCount}, skipped ${skippedCount}.`)
}

main().catch((error) => {
  console.error('[fund] Failed:', error?.message || error)
  process.exit(1)
})
