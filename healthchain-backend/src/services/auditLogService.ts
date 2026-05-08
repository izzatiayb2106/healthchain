import { getAuditLogRepo } from '../db'
import { AuditLog } from '../db/entities'

export type AuditAction =
  | 'login'
  | 'logout'
  | 'access_denied'
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

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

// Convert DB entity to API type
function dbAuditLogToAPI(dbRecord: AuditLog): AuditLogRecord {
  return {
    id: dbRecord.id!,
    timestamp: dbRecord.timestamp!.toISOString(),
    action: dbRecord.action! as AuditAction,
    role: dbRecord.role! as AuditLogRecord['role'],
    wallet: dbRecord.wallet!,
    did: dbRecord.did || undefined,
    status: dbRecord.status! as 'success' | 'failed',
    details: dbRecord.details || undefined,
    metadata: dbRecord.metadata ? JSON.parse(dbRecord.metadata) : undefined,
  }
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
  const repo = getAuditLogRepo()

  const record = new AuditLog()
  record.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  record.timestamp = new Date()
  record.action = input.action
  record.role = input.role
  record.wallet = normalizeWallet(input.wallet)
  record.did = String(input.did || '').trim() || undefined
  record.status = input.status || 'success'
  record.details = String(input.details || '').trim() || undefined
  record.metadata = input.metadata ? JSON.stringify(input.metadata) : undefined

  await repo.save(record)
  return dbAuditLogToAPI(record)
}

export async function listAuditLogs(input?: {
  limit?: number
  role?: string
  action?: string
  wallet?: string
}) {
  const repo = getAuditLogRepo()
  const limit = Math.max(1, Math.min(Number(input?.limit || 200), 1000))
  const role = String(input?.role || '').trim().toLowerCase()
  const action = String(input?.action || '').trim().toLowerCase()
  const wallet = normalizeWallet(String(input?.wallet || ''))

  const query = repo.createQueryBuilder('audit')
    .orderBy('audit.timestamp', 'DESC')
    .take(limit)

  if (role) {
    query.andWhere('LOWER(audit.role) = :role', { role })
  }

  if (action) {
    query.andWhere('LOWER(audit.action) = :action', { action })
  }

  if (wallet) {
    query.andWhere('audit.wallet = :wallet', { wallet })
  }

  const logs = await query.getMany()
  return logs.map(dbAuditLogToAPI)
}
