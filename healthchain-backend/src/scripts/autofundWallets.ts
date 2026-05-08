import dotenv from 'dotenv'
import { ethers } from 'ethers'
import { fundWalletIfNeeded } from '../services/walletFundingService'
import {
  getDoctorPatientRepo,
  getDoctorProfileRepo,
  getIdentityMappingRepo,
  getMinistryRegistryRepo,
  getPatientProfileRepo,
  getVerifierProfileRepo,
  initializeDatabase,
} from '../db'

dotenv.config()

type WalletSource = {
  wallet: string
  source: string
}

function addWallet(discovered: Map<string, Set<string>>, wallet: string, source: string) {
  const normalized = String(wallet || '').trim().toLowerCase()
  if (!ethers.isAddress(normalized)) {
    return
  }

  const existing = discovered.get(normalized) || new Set<string>()
  existing.add(source)
  discovered.set(normalized, existing)
}

async function getWalletsFromDatabase(): Promise<Map<string, Set<string>>> {
  const discovered = new Map<string, Set<string>>()

  await initializeDatabase()

  const identityRepo = getIdentityMappingRepo()
  for (const row of await identityRepo.find()) {
    addWallet(discovered, row.wallet, `identity_mapping:${row.role}`)
  }

  const doctorRepo = getDoctorProfileRepo()
  for (const row of await doctorRepo.find()) {
    addWallet(discovered, row.wallet, 'doctor_profile')
  }

  const verifierRepo = getVerifierProfileRepo()
  for (const row of await verifierRepo.find()) {
    addWallet(discovered, row.wallet, 'verifier_profile')
  }

  const patientRepo = getPatientProfileRepo()
  for (const row of await patientRepo.find()) {
    addWallet(discovered, row.wallet, 'patient_profile')
  }

  const doctorPatientRepo = getDoctorPatientRepo()
  for (const row of await doctorPatientRepo.find()) {
    addWallet(discovered, row.doctorWallet, 'doctor_patient.doctorWallet')
    addWallet(discovered, row.patientWallet, 'doctor_patient.patientWallet')
  }

  const ministryRepo = getMinistryRegistryRepo()
  for (const row of await ministryRepo.find()) {
    addWallet(discovered, row.linkedWallet || '', `ministry_registry:${row.professionalId}`)
  }

  return discovered
}

async function main() {
  const discovered = await getWalletsFromDatabase()
  if (discovered.size === 0) {
    console.log('[fund] No wallets discovered in SQLite. Nothing to fund.')
    return
  }

  console.log(`[fund] Discovered ${discovered.size} wallet(s) from SQLite`)
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
