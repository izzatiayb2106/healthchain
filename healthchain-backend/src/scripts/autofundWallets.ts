import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { ethers } from 'ethers'

dotenv.config()

type WalletSource = {
  wallet: string
  source: string
}

const dataDir = path.resolve(__dirname, '..', 'data')

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
  const files = fs.readdirSync(dirPath).filter((name) => name.toLowerCase().endsWith('.json'))

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
  const rpcUrl = String(process.env.RPC_URL || 'http://127.0.0.1:8545').trim()
  const fundingPrivateKey = String(process.env.PRIVATE_KEY || '').trim()
  const targetEth = String(process.env.AUTO_FUND_TARGET_ETH || '1000').trim()

  if (!fundingPrivateKey) {
    throw new Error('PRIVATE_KEY is required in .env for wallet auto-funding')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const funder = new ethers.Wallet(fundingPrivateKey, provider)
  const targetWei = ethers.parseEther(targetEth)
  let nextNonce = await provider.getTransactionCount(funder.address, 'latest')

  const discovered = getWalletsFromDataDir(dataDir)
  if (discovered.size === 0) {
    console.log('[fund] No wallets discovered in backend data files. Nothing to fund.')
    return
  }

  console.log(`[fund] Discovered ${discovered.size} wallet(s) from ${dataDir}`)
  let fundedCount = 0
  let skippedCount = 0

  for (const [wallet, sourceSet] of discovered.entries()) {
    const code = await provider.getCode(wallet)
    if (code && code !== '0x') {
      skippedCount += 1
      console.log(`[fund] Skip ${wallet} because it is a contract address.`)
      continue
    }

    const balance = await provider.getBalance(wallet)
    if (balance >= targetWei) {
      skippedCount += 1
      console.log(
        `[fund] Skip ${wallet} (balance ${ethers.formatEther(balance)} ETH >= target ${targetEth} ETH) ` +
        `from ${Array.from(sourceSet).join(', ')}`
      )
      continue
    }

    const topUpAmount = targetWei - balance
    const tx = await funder.sendTransaction({
      to: wallet,
      value: topUpAmount,
      nonce: nextNonce,
    })
    nextNonce += 1
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Funding transaction reverted for ${wallet}. Tx hash: ${tx.hash}`)
    }

    fundedCount += 1
    const updated = await provider.getBalance(wallet)
    console.log(
      `[fund] Funded ${wallet} +${ethers.formatEther(topUpAmount)} ETH (tx: ${tx.hash}) -> new balance ${ethers.formatEther(updated)} ETH`
    )
  }

  console.log(`[fund] Completed. Funded ${fundedCount}, skipped ${skippedCount}. Target balance: ${targetEth} ETH.`)
}

main().catch((error) => {
  console.error('[fund] Failed:', error?.message || error)
  process.exit(1)
})
