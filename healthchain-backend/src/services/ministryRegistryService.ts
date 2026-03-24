import { promises as fs } from 'fs'
import path from 'path'

export type MinistryLicenseRecord = {
  professionalId: string
  fullName: string
  licenseType: string
  specialty: string
  status: 'active' | 'suspended' | 'expired'
  validUntil: string
  linkedWallet?: string
}

type MinistryRegistryStore = {
  records: MinistryLicenseRecord[]
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'ministry-license-registry.json')

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(storePath)
  } catch {
    const initial: MinistryRegistryStore = { records: [] }
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
  }
}

async function readStore(): Promise<MinistryRegistryStore> {
  await ensureStoreExists()
  const raw = await fs.readFile(storePath, 'utf8')
  const parsed = JSON.parse(raw) as MinistryRegistryStore
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
  }
}

export async function listMinistryLicenseRecords() {
  const store = await readStore()
  return store.records
}

export async function getMinistryLicenseByProfessionalId(professionalId: string) {
  const target = String(professionalId || '').trim().toLowerCase()
  if (!target) return null
  const store = await readStore()
  return (
    store.records.find((record) => String(record.professionalId || '').trim().toLowerCase() === target) || null
  )
}

export function canLicenseBeIssuedToWallet(record: MinistryLicenseRecord, wallet: string) {
  if (!record.linkedWallet) return true
  return normalizeWallet(record.linkedWallet) === normalizeWallet(wallet)
}
