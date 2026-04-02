import { ethers } from 'ethers'

function normalizeAddress(value: string): string {
  return String(value || '').trim().toLowerCase()
}

export async function runContractPreflight() {
  const rpcUrl = String(process.env.RPC_URL || 'http://127.0.0.1:8545').trim()
  const configured = normalizeAddress(String(process.env.CREDENTIAL_REGISTRY_ADDRESS || ''))

  if (!configured) {
    throw new Error('CREDENTIAL_REGISTRY_ADDRESS is not set in backend .env')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const [network, code] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(configured),
  ])

  if (!code || code === '0x') {
    throw new Error(
      `No bytecode found at ${configured} on chainId ${String(network.chainId)}. Check deployment/env sync.`
    )
  }

  const probeContract = new ethers.Contract(
    configured,
    ['function getPatientRecordCount(address patient) view returns (uint256)'],
    provider
  )

  try {
    await probeContract.getPatientRecordCount(ethers.ZeroAddress)
  } catch (error: any) {
    const message = String(error?.shortMessage || error?.message || '').toLowerCase()
    if (
      message.includes('unrecognized selector') ||
      message.includes('missing revert data') ||
      message.includes('call exception')
    ) {
      throw new Error(
        `Contract at ${configured} is not compatible with CredentialRegistry ABI on chainId ${String(network.chainId)}.`
      )
    }
    throw error
  }
}
