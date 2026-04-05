import { promises as fs } from 'fs'
import path from 'path'

export type AuditAction =
  | 'login'
  | 'logout'
  | 'credential_issuance'
  | 'credential_decryption'
  | 'verification'
  | 'lock_user'
  | 'unlock_user'

export type AuditLogRecord = {
  id: string
  timestamp: string
  action: AuditAction
  role: 'pending' | 'patient' | 'doctor' | 'verifier' | 'admin' | 'system'
  wallet: string
  did?: string
  status: 'success' | 'failed'
  details?: string
  metadata?: Record<string, unknown>
}

type AuditStore = {
  logs: AuditLogRecord[]
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'audit-log.json')

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(storePath)
  } catch {
    const initial: AuditStore = { logs: [] }
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
  }
}

async function readStore(): Promise<AuditStore> {
  await ensureStoreExists()
  const raw = await fs.readFile(storePath, 'utf8')
  const parsed = JSON.parse(raw) as AuditStore
  return {
    logs: Array.isArray(parsed.logs) ? parsed.logs : [],
  }
}

async function writeStore(store: AuditStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function appendAuditLog(input: {
  action: AuditAction
  role: AuditLogRecord['role']
  wallet: string
  did?: string
  status?: AuditLogRecord['status']
  details?: string
  metadata?: Record<string, unknown>
}) {
  const store = await readStore()

  const record: AuditLogRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    action: input.action,
    role: input.role,
    wallet: normalizeWallet(input.wallet),
    did: String(input.did || '').trim() || undefined,
    status: input.status || 'success',
    details: String(input.details || '').trim() || undefined,
    metadata: input.metadata,
  }

  store.logs.unshift(record)
  // Keep file bounded for local dev stability.
  if (store.logs.length > 5000) {
    store.logs = store.logs.slice(0, 5000)
  }

  await writeStore(store)
  return record
}

export async function listAuditLogs(input?: {
  limit?: number
  role?: string
  action?: string
  wallet?: string
}) {
  const store = await readStore()
  const limit = Math.max(1, Math.min(Number(input?.limit || 200), 1000))
  const role = String(input?.role || '').trim().toLowerCase()
  const action = String(input?.action || '').trim().toLowerCase()
  const wallet = normalizeWallet(String(input?.wallet || ''))

  return store.logs
    .filter((entry) => (role ? String(entry.role).toLowerCase() === role : true))
    .filter((entry) => (action ? String(entry.action).toLowerCase() === action : true))
    .filter((entry) => (wallet ? normalizeWallet(entry.wallet) === wallet : true))
    .slice(0, limit)
}
