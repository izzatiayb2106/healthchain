import { createHash } from 'crypto'
import { getHybridCredentialRepo } from '../db'
import { HybridCredential } from '../db/entities/HybridCredentialEntity'

export type HybridCredentialRecord = {
  cid: string
  payloadHash: string
  encryptedCredentialHex: string
  subjectDid: string
  subjectWallet: string
  issuerDid: string
  credentialType: string
  issuedAt: string
  expirationDate?: string | null
  expirationPolicy?: string
  source?: 'live-issue' | 'migration-legacy'
  legacyIssuedAt?: string
  storageMode: 'local-fallback' | 'pinata'
  txHash?: string
  chainId?: string
  contractAddress?: string
  recordId?: string
  finalizedAt?: string
  credentialDetails?: Record<string, any> | null
}

const PINATA_PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

type PendingHybridCredentialDraft = {
  encryptedCredentialHex: string
  payloadHash: string
  subjectDid: string
  subjectWallet: string
  issuerDid: string
  credentialType: string
  issuedAt: string
  expirationDate?: string | null
  expirationPolicy?: string
  source?: 'live-issue' | 'migration-legacy'
  legacyIssuedAt?: string
  storageMode: HybridCredentialRecord['storageMode']
  credentialDetails?: Record<string, any> | null
}

const pendingHybridCredentialDrafts = new Map<string, PendingHybridCredentialDraft>()

function normalizeWallet(wallet: string) {
  return String(wallet || '').trim().toLowerCase()
}

function getPinataJwt() {
  return String(process.env.PINATA_JWT || '').trim()
}

function getPinataApiKey() {
  return String(process.env.PINATA_API_KEY || '').trim()
}

function getPinataApiSecret() {
  return String(process.env.PINATA_API_SECRET || '').trim()
}

function getPinataAuthHeaders() {
  const jwt = getPinataJwt()
  if (jwt) {
    return {
      Authorization: `Bearer ${jwt}`,
    }
  }

  const apiKey = getPinataApiKey()
  const apiSecret = getPinataApiSecret()
  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    }
  }

  return null
}

function buildPinataHeaders() {
  const authHeaders = getPinataAuthHeaders()
  if (!authHeaders) return null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  for (const [key, value] of Object.entries(authHeaders)) {
    if (typeof value === 'string' && value) {
      headers[key] = value
    }
  }
  return headers
}

function getPinataGatewayBase() {
  const customGateway = String(process.env.PINATA_GATEWAY || '').trim()
  if (customGateway) {
    const withScheme = /^https?:\/\//i.test(customGateway)
      ? customGateway
      : `https://${customGateway}`
    return withScheme.replace(/\/+$/, '')
  }
  return 'https://gateway.pinata.cloud'
}

function isPinataEnabled() {
  return Boolean(getPinataAuthHeaders())
}

async function uploadEncryptedPayloadToPinata(input: {
  encryptedCredentialHex: string
  payloadHash: string
  subjectDid: string
  subjectWallet: string
  issuerDid: string
  credentialType: string
  issuedAt: string
}) {
  const headers = buildPinataHeaders()
  if (!headers) {
    throw new Error('Pinata auth is not configured (set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET)')
  }

  const response = await fetch(PINATA_PIN_JSON_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      pinataMetadata: {
        name: `healthchain-${input.credentialType || 'credential'}-${Date.now()}`,
      },
      pinataContent: {
        type: 'healthchain-encrypted-credential',
        payloadHash: input.payloadHash,
        encryptedCredentialHex: input.encryptedCredentialHex,
        subjectDid: input.subjectDid,
        subjectWallet: input.subjectWallet,
        issuerDid: input.issuerDid,
        credentialType: input.credentialType,
        issuedAt: input.issuedAt,
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Pinata upload failed (${response.status}): ${detail || 'unknown error'}`)
  }

  const data = (await response.json()) as { IpfsHash?: string }
  const cid = String(data?.IpfsHash || '').trim()
  if (!cid) {
    throw new Error('Pinata upload did not return IpfsHash')
  }

  return cid
}

async function fetchEncryptedPayloadFromPinata(cid: string) {
  const gatewayBase = getPinataGatewayBase()
  const url = `${gatewayBase}/ipfs/${encodeURIComponent(cid)}`
  console.log(`[PINATA] Fetching from gateway: ${url}`)
  
  const response = await fetch(url)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const errorMsg = `Failed to fetch from Pinata (${response.status}): ${detail || 'unknown error'}`
    console.error(`[PINATA] ${errorMsg}`)
    throw new Error(errorMsg)
  }

  console.log(`[PINATA] Got response, status ${response.status}, parsing JSON...`)
  const payload = (await response.json()) as {
    encryptedCredentialHex?: string
  }

  console.log(`[PINATA] Parsed payload, hasEncryptedCredentialHex: ${!!payload?.encryptedCredentialHex}`)
  
  const encryptedCredentialHex = String(payload?.encryptedCredentialHex || '').trim()
  if (!encryptedCredentialHex) {
    const errorMsg = 'Pinata payload missing encryptedCredentialHex'
    console.error(`[PINATA] ${errorMsg}, payload keys: ${Object.keys(payload).join(', ')}`)
    throw new Error(errorMsg)
  }

  console.log(`[PINATA] Success! Retrieved encrypted hex, length: ${encryptedCredentialHex.length}`)
  return encryptedCredentialHex
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
  expirationDate?: string | null
  expirationPolicy?: string
  source?: 'live-issue' | 'migration-legacy'
  legacyIssuedAt?: string
  credentialDetails?: Record<string, any> | null
}) {
  const encryptedCredentialHex = String(input.encryptedCredentialHex || '').trim()
  if (!encryptedCredentialHex) {
    throw new Error('encryptedCredentialHex is required')
  }

  const payloadHash = sha256Hex(encryptedCredentialHex)
  let cid = `local-${payloadHash.slice(2, 34)}`
  let storageMode: HybridCredentialRecord['storageMode'] = 'local-fallback'

  if (isPinataEnabled()) {
    try {
      cid = await uploadEncryptedPayloadToPinata({
        encryptedCredentialHex,
        payloadHash,
        subjectDid: String(input.subjectDid || '').trim(),
        subjectWallet: normalizeWallet(input.subjectWallet),
        issuerDid: String(input.issuerDid || '').trim(),
        credentialType: String(input.credentialType || '').trim() || 'VaccinationCredential',
        issuedAt: String(input.issuedAt || '').trim() || new Date().toISOString(),
      })
      storageMode = 'pinata'
    } catch (error) {
      console.error('Pinata upload failed. Falling back to local storage mode.', error)
    }
  }

  pendingHybridCredentialDrafts.set(cid, {
    encryptedCredentialHex: storageMode === 'pinata' ? '' : encryptedCredentialHex,
    payloadHash,
    subjectDid: String(input.subjectDid || '').trim(),
    subjectWallet: normalizeWallet(input.subjectWallet),
    issuerDid: String(input.issuerDid || '').trim(),
    credentialType: String(input.credentialType || '').trim() || 'VaccinationCredential',
    issuedAt: String(input.issuedAt || '').trim() || new Date().toISOString(),
    expirationDate: input.expirationDate ? String(input.expirationDate) : null,
    expirationPolicy: String(input.expirationPolicy || '').trim() || undefined,
    source: input.source || 'live-issue',
    legacyIssuedAt: String(input.legacyIssuedAt || '').trim() || undefined,
    storageMode,
    credentialDetails: input.credentialDetails || null,
  })

  return {
    cid,
    payloadHash,
    storageMode,
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

  const repo = getHybridCredentialRepo()
  const pendingDraft = pendingHybridCredentialDrafts.get(cid)
  if (!pendingDraft) {
    const existing = await repo.findOne({ where: { cid } })
    if (existing && existing.finalizedAt) {
      return dbToApi(existing)
    }
    throw new Error('Hybrid credential record not found for cid')
  }

  const saved = await repo.save(
    repo.create({
      cid,
      payloadHash: pendingDraft.payloadHash,
      encryptedCredentialHex: pendingDraft.encryptedCredentialHex,
      subjectDid: pendingDraft.subjectDid,
      subjectWallet: pendingDraft.subjectWallet,
      issuerDid: pendingDraft.issuerDid,
      credentialType: pendingDraft.credentialType,
      issuedAt: new Date(pendingDraft.issuedAt),
      expirationDate: pendingDraft.expirationDate ? new Date(pendingDraft.expirationDate) : null,
      expirationPolicy: pendingDraft.expirationPolicy || null,
      source: pendingDraft.source || null,
      legacyIssuedAt: pendingDraft.legacyIssuedAt || null,
      storageMode: pendingDraft.storageMode,
      txHash: String(input.txHash || '').trim(),
      chainId: String(input.chainId || '').trim(),
      contractAddress: normalizeWallet(input.contractAddress),
      recordId: String(input.recordId || '').trim(),
      finalizedAt: new Date(),
      credentialDetails: pendingDraft.credentialDetails || null,
    })
  )

  pendingHybridCredentialDrafts.delete(cid)
  return dbToApi(saved)
}

export async function getHybridCredentialByCid(cid: string): Promise<HybridCredentialRecord | null> {
  const target = String(cid || '').trim()
  if (!target) return null
  
  const repo = getHybridCredentialRepo()
  const found = await repo.findOne({ where: { cid: target } })
  if (!found) return null

  console.log(`[GET_CID] Found record, storageMode: ${found.storageMode}, hasLocalEncryptedHex: ${!!found.encryptedCredentialHex}`);
  
  if (found.storageMode === 'pinata' && !String(found.encryptedCredentialHex || '').trim()) {
    console.log(`[GET_CID] Need to fetch from Pinata for CID: ${found.cid}`);
    try {
      const encryptedCredentialHex = await fetchEncryptedPayloadFromPinata(found.cid)
      console.log(`[GET_CID] Successfully fetched from Pinata, hex length: ${encryptedCredentialHex.length}`);
      return {
        ...dbToApi(found),
        encryptedCredentialHex,
      }
    } catch (error: any) {
      console.error(`[GET_CID] Failed to fetch from Pinata:`, error?.message);
      throw error;
    }
  }

  return dbToApi(found)
}

export async function listHybridCredentialsBySubjectWallet(subjectWallet: string) {
  const target = normalizeWallet(subjectWallet)
  if (!target) return []
  const repo = getHybridCredentialRepo()
  const records = await repo.find({ where: { subjectWallet: target } })
  return records.filter((entry) => Boolean(entry.finalizedAt)).map(dbToApi)
}

export async function listHybridCredentialsBySubjectDid(subjectDid: string) {
  const target = String(subjectDid || '').trim()
  if (!target) return []
  const repo = getHybridCredentialRepo()
  const records = await repo.find({ where: { subjectDid: target } })
  return records.filter((entry) => Boolean(entry.finalizedAt)).map(dbToApi)
}

export async function findHybridByLegacyReference(subjectDid: string, legacyIssuedAt: string, credentialType: string): Promise<HybridCredentialRecord | null> {
  const targetSubject = String(subjectDid || '').trim()
  const targetIssuedAt = String(legacyIssuedAt || '').trim()
  const targetCredentialType = String(credentialType || '').trim()
  if (!targetSubject || !targetIssuedAt || !targetCredentialType) return null

  const repo = getHybridCredentialRepo()
  const found = await repo.findOne({
    where: {
      subjectDid: targetSubject,
      legacyIssuedAt: targetIssuedAt,
      credentialType: targetCredentialType,
    },
  })
  return found && found.finalizedAt ? dbToApi(found) : null
}

// Helper to convert DB entity to API record type
function dbToApi(entity: HybridCredential): HybridCredentialRecord {
  return {
    cid: entity.cid,
    payloadHash: entity.payloadHash,
    encryptedCredentialHex: entity.encryptedCredentialHex,
    subjectDid: entity.subjectDid,
    subjectWallet: entity.subjectWallet,
    issuerDid: entity.issuerDid,
    credentialType: entity.credentialType,
    issuedAt: entity.issuedAt.toISOString(),
    expirationDate: entity.expirationDate ? entity.expirationDate.toISOString() : null,
    expirationPolicy: entity.expirationPolicy || undefined,
    source: entity.source as 'live-issue' | 'migration-legacy' | undefined,
    legacyIssuedAt: entity.legacyIssuedAt || undefined,
    storageMode: entity.storageMode as 'local-fallback' | 'pinata',
    txHash: entity.txHash || undefined,
    chainId: entity.chainId || undefined,
    contractAddress: entity.contractAddress || undefined,
    recordId: entity.recordId || undefined,
    finalizedAt: entity.finalizedAt ? entity.finalizedAt.toISOString() : undefined,
    credentialDetails: entity.credentialDetails || undefined,
  }
}

