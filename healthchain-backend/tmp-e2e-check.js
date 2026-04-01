const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const { getEncryptionPublicKey } = require('@metamask/eth-sig-util');

const API = 'http://localhost:3001';
const JWT_SECRET = (process.env.JWT_SECRET || 'healthchain-dev-secret-change-in-prod').trim();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function post(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? authHeader(token) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${url} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function get(url, token) {
  const res = await fetch(url, { headers: token ? authHeader(token) : {} });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

(async () => {
  const backendRoot = process.cwd();
  const dataDir = path.join(backendRoot, 'src', 'data');
  const envPath = path.join(backendRoot, '.env');

  const identities = readJson(path.join(dataDir, 'identity-mappings.json')).identities || [];
  const doctor = identities.find((x) => x.role === 'doctor');
  const patient = identities.find((x) => x.role === 'patient');
  const verifier = identities.find((x) => x.role === 'verifier');

  if (!doctor || !patient || !verifier) {
    throw new Error('Missing doctor/patient/verifier identities in identity-mappings.json');
  }

  const doctorToken = jwt.sign({ wallet: doctor.wallet, did: doctor.did, role: 'doctor' }, JWT_SECRET, { expiresIn: '7d' });
  const patientToken = jwt.sign({ wallet: patient.wallet, did: patient.did, role: 'patient' }, JWT_SECRET, { expiresIn: '7d' });
  const verifierToken = jwt.sign({ wallet: verifier.wallet, did: verifier.did, role: 'verifier' }, JWT_SECRET, { expiresIn: '7d' });

  const envRaw = fs.readFileSync(envPath, 'utf8');
  const env = Object.fromEntries(
    envRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );

  const rpcUrl = (env.RPC_URL || 'http://127.0.0.1:8545').trim();
  const contractAddress = String(env.CREDENTIAL_REGISTRY_ADDRESS || '').trim();
  const senderPk = String(env.PRIVATE_KEY || '').trim();

  if (!contractAddress || !senderPk) {
    throw new Error('Missing CREDENTIAL_REGISTRY_ADDRESS or PRIVATE_KEY in backend .env');
  }

  const testPrivateKey = '59c6995e998f97a5a0044966f094538e6f1f9f6e20f5af6f4f0d5f2f2be5c6c5';
  const encryptionPublicKey = getEncryptionPublicKey(testPrivateKey);

  const encryptionSet = await post(`${API}/patient/profile/me/encryption-key`, { encryptionPublicKey }, patientToken);

  const credentialType = 'VaccinationCredential';
  const prepare = await post(
    `${API}/credential/hybrid/prepare`,
    {
      subjectDid: patient.did,
      subjectWallet: patient.wallet,
      credentialType,
      name: 'E2E Patient',
      role: 'patient',
      credentialDetails: {
        patientName: 'E2E Patient',
        patientDob: '1998-08-20',
        vaccineType: 'MMR',
        manufacturer: 'HealthCo',
        batchNumber: `E2E-${Date.now()}`,
        doseNumber: 1,
        dateAdministered: '2026-04-01',
        nextDoseDate: '2026-05-01',
        notes: 'Automated e2e check',
      },
    },
    doctorToken
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(senderPk, provider);
  const chainId = String((await provider.getNetwork()).chainId);

  const abi = [
    'function issueRecord(address patient, string cid, bytes32 payloadHash, string credentialType) returns (uint256)',
    'function getPatientRecordCount(address patient) view returns (uint256)',
    'function getPatientRecordAt(address patient, uint256 index) view returns (uint256 recordId, address issuer, address subject, string cid, bytes32 payloadHash, string credentialType, uint256 issuedAt)',
    'function verifyRecord(uint256 recordId, string cid, bytes32 payloadHash) view returns (bool)',
  ];

  const contract = new ethers.Contract(contractAddress, abi, signer);
  const predictedRecordId = await contract.issueRecord.staticCall(
    prepare.patientWallet,
    prepare.cid,
    prepare.payloadHash,
    prepare.credentialType
  );
  const tx = await contract.issueRecord(
    prepare.patientWallet,
    prepare.cid,
    prepare.payloadHash,
    prepare.credentialType
  );
  const receipt = await tx.wait();

  const finalize = await post(
    `${API}/credential/hybrid/finalize`,
    {
      cid: prepare.cid,
      txHash: tx.hash,
      recordId: String(predictedRecordId),
      chainId,
      contractAddress,
    },
    doctorToken
  );

  const count = Number(await contract.getPatientRecordCount(patient.wallet));
  const latest = await contract.getPatientRecordAt(patient.wallet, count - 1);
  const onChainMatches =
    String(latest[3]) === String(prepare.cid) &&
    String(latest[4]).toLowerCase() === String(prepare.payloadHash).toLowerCase();

  const encryptedByCid = await get(`${API}/credential/hybrid/cid/${encodeURIComponent(prepare.cid)}`, patientToken);
  const validatePayload = await post(
    `${API}/credential/hybrid/validate-payload`,
    {
      payloadHash: prepare.payloadHash,
      encryptedCredentialHex: encryptedByCid.encryptedCredentialHex,
    },
    patientToken
  );

  const standardIssue = await post(
    `${API}/credential/issue`,
    {
      subjectDid: patient.did,
      subjectWallet: patient.wallet,
      credentialType: 'RoleCredential',
      name: 'E2E Patient',
      role: 'patient',
      credentialDetails: {
        testMarker: 'e2e-role-credential',
      },
    },
    doctorToken
  );

  const patientCreds = await get(`${API}/patient/credentials/me`, patientToken);
  const issuedEntry = (patientCreds.credentials || [])[0];

  let qrCreate = null;
  let qrVerify = null;
  let qrVerifyError = null;
  if (issuedEntry && issuedEntry.issuedAt) {
    qrCreate = await post(
      `${API}/credential/qr/create`,
      {
        issuedAt: issuedEntry.issuedAt,
        credentialType: issuedEntry.credentialType,
      },
      patientToken
    );

    try {
      qrVerify = await post(
        `${API}/credential/qr/verify`,
        {
          tokenOrPayload: qrCreate.qrPayload,
        },
        verifierToken
      );
    } catch (error) {
      qrVerifyError = String(error && error.message ? error.message : error);
    }
  }

  const onChainVerify = await contract.verifyRecord(
    predictedRecordId,
    prepare.cid,
    prepare.payloadHash
  );

  const result = {
    roles: {
      doctor: doctor.wallet,
      patient: patient.wallet,
      verifier: verifier.wallet,
    },
    checks: {
      patientEncryptionKeySaved: Boolean(encryptionSet?.success),
      hybridPrepared: Boolean(prepare?.success),
      chainTxMined: Boolean(receipt?.status === 1n || receipt?.status === 1),
      hybridFinalized: Boolean(finalize?.success),
      patientChainReadCount: count,
      patientLatestRecordMatchesPreparedPayload: onChainMatches,
      payloadHashValidationMatches: Boolean(validatePayload?.matches),
      verifyRecordTrue: Boolean(onChainVerify),
      standardCredentialIssued: Boolean(standardIssue?.success),
      patientCredentialsReadable: Number(patientCreds?.total || 0),
      qrCreated: Boolean(qrCreate?.success),
      qrVerified: Boolean(qrVerify?.success),
    },
    artifacts: {
      cid: prepare.cid,
      payloadHash: prepare.payloadHash,
      recordId: String(predictedRecordId),
      txHash: tx.hash,
      chainId,
      contractAddress,
      qrExpiresAt: qrCreate?.expiresAt || null,
      qrVerifyError,
    },
  };

  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
