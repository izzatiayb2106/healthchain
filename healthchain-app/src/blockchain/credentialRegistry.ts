import { ethers } from 'ethers';

export const CREDENTIAL_REGISTRY_ABI = [
  'function issueRecord(address patient, string cid, bytes32 payloadHash, string credentialType) returns (uint256)',
  'function getPatientRecordCount(address patient) view returns (uint256)',
  'function getPatientRecordAt(address patient, uint256 index) view returns (uint256 recordId, address issuer, address subject, string cid, bytes32 payloadHash, string credentialType, uint256 issuedAt)',
  'function getRecordById(uint256 recordId) view returns (address issuer, address patient, string cid, bytes32 payloadHash, string credentialType, uint256 issuedAt)',
  'function verifyRecord(uint256 recordId, string cid, bytes32 payloadHash) view returns (bool)',
  'event RecordIssued(uint256 indexed recordId, address indexed issuer, address indexed patient, string cid, bytes32 payloadHash, string credentialType, uint256 issuedAt)',
] as const;

export type HybridChainRecord = {
  recordId: string;
  issuer: string;
  patient: string;
  cid: string;
  payloadHash: string;
  credentialType: string;
  issuedAt: string;
};

export function getCredentialRegistryAddress() {
  return String(import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS || '').trim();
}

export function getCredentialRegistryContract(providerOrSigner: ethers.Provider | ethers.Signer, addressOverride?: string) {
  const address = String(addressOverride || getCredentialRegistryAddress()).trim();
  if (!address) {
    throw new Error('VITE_CREDENTIAL_REGISTRY_ADDRESS is not set');
  }
  return new ethers.Contract(address, CREDENTIAL_REGISTRY_ABI, providerOrSigner);
}

export async function assertCredentialRegistryDeployed(provider: ethers.Provider, addressOverride?: string) {
  const address = String(addressOverride || getCredentialRegistryAddress()).trim();
  if (!address) {
    throw new Error('VITE_CREDENTIAL_REGISTRY_ADDRESS is not set');
  }

  const [code, network] = await Promise.all([provider.getCode(address), provider.getNetwork()]);
  if (!code || code === '0x') {
    throw new Error(
      `CredentialRegistry is not deployed at ${address} on chainId ${String(network.chainId)}. ` +
      `Switch MetaMask to the correct network or redeploy and update VITE_CREDENTIAL_REGISTRY_ADDRESS.`
    );
  }

  return address;
}

export function mapChainRecordTuple(tuple: any): HybridChainRecord {
  return {
    recordId: String(tuple[0]),
    issuer: String(tuple[1]).toLowerCase(),
    patient: String(tuple[2]).toLowerCase(),
    cid: String(tuple[3]),
    payloadHash: String(tuple[4]),
    credentialType: String(tuple[5]),
    issuedAt: new Date(Number(tuple[6]) * 1000).toISOString(),
  };
}
