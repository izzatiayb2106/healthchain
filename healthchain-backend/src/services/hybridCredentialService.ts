import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

export type HybridCredentialRecord = {
  cid: string
  payloadHash: string
  encryptedCredentialHex: string
  subjectDid: string
  subjectWallet: string
  issuerDid: string
  credentialType: string
  issuedAt: string
  storageMode: 'local-fallback'
  txHash?: string
  chainId?: string
  contractAddress?: string
  recordId?: string
  finalizedAt?: string
}

type HybridCredentialStore = {
  records: HybridCredentialRecord[]
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'hybrid-credentials.json')

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

function normalizeHash(hash: string) {
  const h = String(hash || '').trim().toLowerCase()
  if (!h) return ''
  return h.startsWith('0x') ? h : `0x${h}`
}

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(storePath)
  } catch {
    const initial: HybridCredentialStore = { records: [] }
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
  }
}

async function readStore(): Promise<HybridCredentialStore> {
  await ensureStoreExists()
  const raw = await fs.readFile(storePath, 'utf8')
  const parsed = JSON.parse(raw) as HybridCredentialStore
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
  }
}

async function writeStore(store: HybridCredentialStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export function sha256Hex(input: string) {
  return `0x${createHash('sha256').update(input, 'utf8').digest('hex')}`
}

export async function storeHybridEncryptedCredential(input: {
  encryptedCredentialHex: string
  subjectDid: string
  subjectWallet: string
  issuerDid: string
  credentialType: string
  issuedAt: string
}) {
  const encryptedCredentialHex = String(input.encryptedCredentialHex || '').trim()
  if (!encryptedCredentialHex) {
    throw new Error('encryptedCredentialHex is required')
  }

  const payloadHash = sha256Hex(encryptedCredentialHex)
  const cid = `local-${payloadHash.slice(2, 34)}`

  const record: HybridCredentialRecord = {
    cid,
    payloadHash,
    encryptedCredentialHex,
    subjectDid: String(input.subjectDid || '').trim(),
    subjectWallet: normalizeWallet(input.subjectWallet),
    issuerDid: String(input.issuerDid || '').trim(),
    credentialType: String(input.credentialType || '').trim() || 'VaccinationCredential',
    issuedAt: String(input.issuedAt || '').trim() || new Date().toISOString(),
    storageMode: 'local-fallback',
  }

  const store = await readStore()
  const existingIndex = store.records.findIndex((entry) => entry.cid === cid)
  if (existingIndex >= 0) {
    store.records[existingIndex] = { ...store.records[existingIndex], ...record }
  } else {
    store.records.unshift(record)
  }
  await writeStore(store)

  return {
    cid,
    payloadHash,
    storageMode: record.storageMode,
  }
}

export async function finalizeHybridCredential(input: {
  cid: string
  txHash: string
  chainId: string
  contractAddress: string
  recordId: string
}) {
  const cid = String(input.cid || '').trim()
  if (!cid) {
    throw new Error('cid is required')
  }

  const store = await readStore()
  const found = store.records.find((entry) => entry.cid === cid)
  if (!found) {
    throw new Error('Hybrid credential record not found for cid')
  }

  found.txHash = String(input.txHash || '').trim()
  found.chainId = String(input.chainId || '').trim()
  found.contractAddress = normalizeWallet(input.contractAddress)
  found.recordId = String(input.recordId || '').trim()
  found.finalizedAt = new Date().toISOString()

  await writeStore(store)
  return found
}

export async function getHybridCredentialByCid(cid: string) {
  const target = String(cid || '').trim()
  if (!target) return null
  const store = await readStore()
  return store.records.find((entry) => entry.cid === target) || null
}

export async function listHybridCredentialsBySubjectWallet(subjectWallet: string) {
  const target = normalizeWallet(subjectWallet)
  if (!target) return []
  const store = await readStore()
  return store.records.filter((entry) => entry.subjectWallet === target)
}

export function payloadHashMatches(payloadHash: string, encryptedCredentialHex: string) {
  return normalizeHash(payloadHash) === sha256Hex(String(encryptedCredentialHex || '').trim())
}
