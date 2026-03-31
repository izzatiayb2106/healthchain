import 'dotenv/config'
import { encrypt } from '@metamask/eth-sig-util'
import { ethers } from 'ethers'
import {
  finalizeHybridCredential,
  findHybridByLegacyReference,
  storeHybridEncryptedCredential,
} from '../services/hybridCredentialService'
import { getIdentityByDid } from '../services/authServices'
import { listAllIssuedCredentials } from '../services/credentialServices'
import { getPatientProfileByDid } from '../services/patientProfileService'

const CREDENTIAL_REGISTRY_ABI = [
  'function issueRecord(address patient, string cid, bytes32 payloadHash, string credentialType) returns (uint256)',
] as const

function extractIssuerDid(credential: any): string {
  if (!credential) return ''

  if (typeof credential === 'string') {
    const parts = credential.split('.')
    if (parts.length >= 2) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        const issuer = payload?.vc?.issuer || payload?.iss || ''
        return typeof issuer === 'string' ? issuer : String(issuer?.id || '')
      } catch {
        return ''
      }
    }
    return ''
  }

  const issuer = credential?.issuer || credential?.vc?.issuer || credential?.proof?.issuer || ''
  return typeof issuer === 'string' ? issuer : String(issuer?.id || '')
}

function toVcJwt(credential: any): string {
  if (typeof credential === 'string') return credential.trim()
  return String(credential?.proof?.jwt || '').trim()
}

function encryptForPatient(publicKey: string, payload: string) {
  const encrypted = encrypt({
    publicKey,
    data: payload,
    version: 'x25519-xsalsa20-poly1305',
  })
  return `0x${Buffer.from(JSON.stringify(encrypted), 'utf8').toString('hex')}`
}

async function main() {
  const rpcUrl = String(process.env.RPC_URL || '').trim()
  const privateKey = String(process.env.PRIVATE_KEY || '').trim()
  const contractAddress = String(process.env.CREDENTIAL_REGISTRY_ADDRESS || '').trim()

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error('RPC_URL, PRIVATE_KEY, and CREDENTIAL_REGISTRY_ADDRESS are required in backend .env')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, CREDENTIAL_REGISTRY_ABI, signer)
  const network = await provider.getNetwork()

  const legacy = await listAllIssuedCredentials()
  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const entry of legacy) {
    try {
      const subjectDid = String(entry.subjectId || '').trim()
      const credentialType = String(entry.credentialType || '').trim() || 'VaccinationCredential'
      const legacyIssuedAt = String(entry.issuedAt || '').trim()

      if (!subjectDid || !legacyIssuedAt || credentialType === 'PatientCredential') {
        skipped += 1
        continue
      }

      const already = await findHybridByLegacyReference(subjectDid, legacyIssuedAt, credentialType)
      if (already) {
        skipped += 1
        continue
      }

      const patientIdentity = await getIdentityByDid(subjectDid)
      if (!patientIdentity) {
        console.warn(`Skipping ${subjectDid} @ ${legacyIssuedAt}: no identity mapping`) 
        skipped += 1
        continue
      }

      const patientProfile = await getPatientProfileByDid(subjectDid)
      const encryptionPublicKey = String(patientProfile?.encryptionPublicKey || '').trim()
      if (!encryptionPublicKey) {
        console.warn(`Skipping ${subjectDid} @ ${legacyIssuedAt}: missing patient encryption key`) 
        skipped += 1
        continue
      }

      const vcJwt = toVcJwt(entry.credential)
      if (!vcJwt) {
        console.warn(`Skipping ${subjectDid} @ ${legacyIssuedAt}: legacy credential JWT missing`) 
        skipped += 1
        continue
      }

      const issuerDid = extractIssuerDid(entry.credential)
      const encryptedCredentialHex = encryptForPatient(encryptionPublicKey, vcJwt)

      const stored = await storeHybridEncryptedCredential({
        encryptedCredentialHex,
        subjectDid,
        subjectWallet: patientIdentity.wallet,
        issuerDid,
        credentialType,
        issuedAt: legacyIssuedAt,
        source: 'migration-legacy',
        legacyIssuedAt,
      })

      const predictedRecordId = await contract.issueRecord.staticCall(
        patientIdentity.wallet,
        stored.cid,
        stored.payloadHash,
        credentialType,
      )
      const tx = await contract.issueRecord(
        patientIdentity.wallet,
        stored.cid,
        stored.payloadHash,
        credentialType,
      )
      await tx.wait()

      await finalizeHybridCredential({
        cid: stored.cid,
        txHash: tx.hash,
        chainId: String(network.chainId),
        contractAddress,
        recordId: String(predictedRecordId),
      })

      migrated += 1
      console.log(`Migrated: ${subjectDid} @ ${legacyIssuedAt} -> CID ${stored.cid}`)
    } catch (error: any) {
      failed += 1
      console.error('Failed to migrate one legacy record:', error?.message || error)
    }
  }

  console.log('--- Legacy migration summary ---')
  console.log(`Total legacy records: ${legacy.length}`)
  console.log(`Migrated: ${migrated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
