import { getMinistryRegistryRepo } from '../db';
import { MinistryRegistry as DBMinistryRegistry } from '../db/entities/MinistryRegistryEntity';

export type MinistryLicenseRecord = {
  id?: string
  professionalId: string
  fullName: string
  licenseType: string
  specialty: string
  role?: 'doctor' | 'verifier'
  status: 'active' | 'inactive' | 'suspended' | 'expired'
  validUntil: string
  linkedWallet?: string
}

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

// Convert database entity to API format
function dbMinistryToAPI(dbRecord: DBMinistryRegistry): MinistryLicenseRecord {
  const validUntilDate =
    dbRecord.validUntil instanceof Date
      ? dbRecord.validUntil
      : dbRecord.validUntil
      ? new Date(String(dbRecord.validUntil))
      : null

  const validUntilStr = validUntilDate && !isNaN(validUntilDate.getTime())
    ? validUntilDate.toISOString().split('T')[0]
    : ''

  return {
    id: dbRecord.id,
    professionalId: dbRecord.professionalId,
    fullName: dbRecord.fullName,
    licenseType: dbRecord.licenseType,
    specialty: dbRecord.specialty,
    role: dbRecord.role,
    status: dbRecord.status,
    validUntil: validUntilStr,
    linkedWallet: dbRecord.linkedWallet || undefined,
  }
}

export async function listMinistryLicenseRecords(): Promise<MinistryLicenseRecord[]> {
  const repo = getMinistryRegistryRepo()
  const records = await repo.find()
  return records.map(dbMinistryToAPI)
}

export async function getMinistryLicenseByProfessionalId(professionalId: string): Promise<MinistryLicenseRecord | null> {
  const target = String(professionalId || '').trim()
  if (!target) return null

  const repo = getMinistryRegistryRepo()
  // Perform case-insensitive search to match professional IDs regardless of casing
  const record = await repo
    .createQueryBuilder('m')
    .where('LOWER(m.professionalId) = :pid', { pid: target.toLowerCase() })
    .getOne()

  return record ? dbMinistryToAPI(record) : null
}

export function canLicenseBeIssuedToWallet(record: MinistryLicenseRecord, wallet: string): boolean {
  if (!record.linkedWallet) return true
  return normalizeWallet(record.linkedWallet) === normalizeWallet(wallet)
}

export function resolveProfessionalAccessRole(record: MinistryLicenseRecord): 'doctor' | 'verifier' {
  const explicitRole = String(record.role || '').trim().toLowerCase()
  if (explicitRole === 'doctor' || explicitRole === 'verifier') {
    return explicitRole
  }

  const licenseType = String(record.licenseType || '').trim().toLowerCase()
  if (licenseType.includes('medical') || licenseType.includes('doctor') || licenseType.includes('physician')) {
    return 'doctor'
  }

  return 'verifier'
}
