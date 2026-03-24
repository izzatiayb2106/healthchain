import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

export type CredentialQrSession = {
  token: string
  subjectDid: string
  issuedAt: string
  credentialType: string
  credential: any
  createdByWallet: string
  createdAt: string
  expiresAt: string
}

type CredentialQrStore = {
  sessions: CredentialQrSession[]
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'credential-qr-sessions.json')

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(storePath)
  } catch {
    const initial: CredentialQrStore = { sessions: [] }
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
  }
}

async function readStore(): Promise<CredentialQrStore> {
  await ensureStoreExists()
  const raw = await fs.readFile(storePath, 'utf8')
  const parsed = JSON.parse(raw) as CredentialQrStore
  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  }
}

async function writeStore(store: CredentialQrStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

function isExpired(expiresAt: string) {
  return Date.now() > new Date(expiresAt).getTime()
}

export async function createCredentialQrSession(input: {
  subjectDid: string
  issuedAt: string
  credentialType: string
  credential: any
  createdByWallet: string
  ttlSeconds?: number
}) {
  const ttlSeconds = Number.isFinite(input.ttlSeconds) ? Math.max(30, Number(input.ttlSeconds)) : 600
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString()

  const store = await readStore()
  store.sessions = store.sessions.filter((entry) => !isExpired(entry.expiresAt))

  const session: CredentialQrSession = {
    token: randomBytes(24).toString('hex'),
    subjectDid: String(input.subjectDid || '').trim(),
    issuedAt: String(input.issuedAt || '').trim(),
    credentialType: String(input.credentialType || '').trim(),
    credential: input.credential,
    createdByWallet: String(input.createdByWallet || '').trim().toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt,
  }

  store.sessions.unshift(session)
  await writeStore(store)
  return session
}

export async function getCredentialQrSession(token: string) {
  const target = String(token || '').trim()
  if (!target) return null

  const store = await readStore()
  store.sessions = store.sessions.filter((entry) => !isExpired(entry.expiresAt))
  const found = store.sessions.find((entry) => entry.token === target) || null
  await writeStore(store)
  return found
}
