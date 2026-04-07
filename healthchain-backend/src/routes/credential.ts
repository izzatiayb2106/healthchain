import express from "express";
import { ethers } from "ethers";
import { encrypt } from "@metamask/eth-sig-util";
import { getIdentityByDid, getIdentityByWallet, upsertIdentity } from "../services/authServices";
import { ensureDidForWallet } from "../services/didService";
import { createCredentialQrSession } from "../services/credentialQrService";
import { getPatientProfileByDid } from "../services/patientProfileService";
import { getDoctorProfileByDid } from "../services/doctorProfileService";
import { jwtAuthMiddleware } from "../middleware/jwtAuth";
import {
  finalizeHybridCredential,
  getHybridCredentialByCid,
  listHybridCredentialsBySubjectDid,
  storeHybridEncryptedCredential,
} from "../services/hybridCredentialService";
import { emitEventToWallet } from "../services/eventService";
import { appendAuditLog } from "../services/auditLogService";

type ExpirationResolution = {
  expirationDate: string | null;
  expirationPolicy: string;
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function parseDate(input: string) {
  const timestamp = Date.parse(String(input || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function yearsFrom(issuedAtMs: number, years: number) {
  const date = new Date(issuedAtMs);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString();
}

function resolveExpiration(credentialDetails: any, issuedAtIso: string): ExpirationResolution {
  const issuedAtMs = Date.parse(issuedAtIso);
  const vaccineType = String(credentialDetails?.vaccineType || "").trim().toLowerCase();
  const patientDob = String(credentialDetails?.patientDob || credentialDetails?.dateOfBirth || "").trim();

  if (vaccineType === "yellow fever") {
    return { expirationDate: null, expirationPolicy: "Lifetime" };
  }
  if (vaccineType === "meningococcal (conjugate)") {
    return { expirationDate: yearsFrom(issuedAtMs, 5), expirationPolicy: "5 years" };
  }
  if (vaccineType === "meningococcal (polysaccharide)") {
    return { expirationDate: yearsFrom(issuedAtMs, 3), expirationPolicy: "3 years" };
  }
  if (vaccineType === "tetanus / diphtheria (tdap)" || vaccineType === "tetanus") {
    return { expirationDate: yearsFrom(issuedAtMs, 10), expirationPolicy: "10 years" };
  }
  if (vaccineType === "typhoid (injectable)") {
    return { expirationDate: yearsFrom(issuedAtMs, 3), expirationPolicy: "3 years" };
  }
  if (vaccineType === "typhoid (oral)") {
    return { expirationDate: yearsFrom(issuedAtMs, 1), expirationPolicy: "1 year" };
  }
  if (vaccineType === "cholera (adults)") {
    return { expirationDate: yearsFrom(issuedAtMs, 2), expirationPolicy: "2 years" };
  }
  if (vaccineType === "cholera (short-term)") {
    return { expirationDate: toIso(issuedAtMs + 10 * DAY_MS), expirationPolicy: "10 days" };
  }
  if (vaccineType === "cholera") {
    const dobMs = parseDate(patientDob);
    if (dobMs) {
      const ageYears = (issuedAtMs - dobMs) / YEAR_MS;
      if (ageYears < 18) {
        return { expirationDate: toIso(issuedAtMs + 10 * DAY_MS), expirationPolicy: "10 days" };
      }
    }
    return { expirationDate: yearsFrom(issuedAtMs, 2), expirationPolicy: "2 years" };
  }
  if (vaccineType === "polio") {
    return { expirationDate: yearsFrom(issuedAtMs, 1), expirationPolicy: "12 months" };
  }
  if (vaccineType === "influenza") {
    return { expirationDate: yearsFrom(issuedAtMs, 1), expirationPolicy: "1 year" };
  }
  if (vaccineType === "covid-19") {
    return { expirationDate: toIso(issuedAtMs + 270 * DAY_MS), expirationPolicy: "270 days" };
  }
  if (vaccineType === "hepatitis a / b" || vaccineType === "hepatitis b") {
    return { expirationDate: null, expirationPolicy: "Lifetime" };
  }
  if (vaccineType === "hpv (human papillomavirus)" || vaccineType === "hpv") {
    return { expirationDate: null, expirationPolicy: "Lifetime" };
  }
  if (vaccineType === "mmr (measles, mumps, rubella)" || vaccineType === "mmr") {
    return { expirationDate: null, expirationPolicy: "Lifetime" };
  }

  // Fallback for custom/other vaccines
  return { expirationDate: yearsFrom(issuedAtMs, 1), expirationPolicy: "1 year" };
}

async function resolveIdentityByJWT(req: express.Request) {
  if (!req.user) {
    throw new Error("Not authenticated. Use JWT token in Authorization header.");
  }

  const identity = await getIdentityByWallet(req.user.wallet);
  if (!identity) {
    throw new Error("Identity not found for wallet");
  }

  return identity;
}

export default function credentialRoutes(agent: any) {
  const router = express.Router();

  // Apply JWT authentication to all credential routes
  router.use(jwtAuthMiddleware);

  const encryptForPatient = (publicKey: string, payload: string) => {
    const encrypted = encrypt({
      publicKey,
      data: payload,
      version: "x25519-xsalsa20-poly1305",
    });
    return `0x${Buffer.from(JSON.stringify(encrypted), "utf8").toString("hex")}`;
  };

  const parseHybridVerifyPayload = (input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("payload is required");
    }

    const parsed = input as Record<string, unknown>;
    const type = String(parsed.type || "").trim();
    const contractAddress = String(parsed.contractAddress || "").trim();
    const recordId = String(parsed.recordId || "").trim();
    const cid = String(parsed.cid || "").trim();
    const payloadHash = String(parsed.payloadHash || "").trim();

    if (type !== "healthchain-hybrid-record") {
      throw new Error("Unsupported payload type");
    }
    if (!contractAddress || !recordId || !cid || !payloadHash) {
      throw new Error("Hybrid payload is missing required fields");
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(payloadHash)) {
      throw new Error("Invalid payloadHash format");
    }

    try {
      void BigInt(recordId);
    } catch {
      throw new Error("Invalid recordId");
    }

    return {
      contractAddress,
      recordId,
      cid,
      payloadHash,
    };
  };

  router.post("/issue", async (_req, res) => {
    return res.status(410).json({
      error: "Legacy issuance endpoint removed",
      hint: "Use /credential/hybrid/prepare and /credential/hybrid/finalize",
    });
  });

  router.post("/hybrid/prepare", async (req, res) => {
    try {
      const doctorIdentity = await resolveIdentityByJWT(req);
      const debugId = `hybrid-${Date.now()}`;
      console.log(`[HYBRID][${debugId}] Prepare request`, {
        doctorWallet: doctorIdentity.wallet,
        subjectDid: req.body.subjectDid,
        subjectWallet: req.body.subjectWallet,
        credentialType: req.body.credentialType,
      });
      if (doctorIdentity.role !== "doctor") {
        return res.status(403).json({ error: "Doctor role required to issue credentials" });
      }

      const subjectInput = String(req.body.subjectDid || req.body.subject || "").trim();
      if (!subjectInput) {
        return res.status(400).json({ error: "subjectDid is required" });
      }

      let patientIdentity = await getIdentityByDid(subjectInput);
      if (!patientIdentity && subjectInput.startsWith("0x")) {
        patientIdentity = await getIdentityByWallet(subjectInput.toLowerCase());
      }
      if (!patientIdentity || patientIdentity.role !== "patient") {
        return res.status(400).json({ error: "subjectDid must belong to an existing patient" });
      }

      const patientProfile = await getPatientProfileByDid(patientIdentity.did);
      const encryptionPublicKey = String(patientProfile?.encryptionPublicKey || "").trim();
      if (!encryptionPublicKey) {
        return res.status(400).json({
          error: "Patient encryption public key not registered",
          hint: "Patient must open dashboard and approve encryption key registration once.",
        });
      }

      const ensuredIssuer = await ensureDidForWallet(agent, doctorIdentity.wallet);
      const issuerDid = String(ensuredIssuer.identifier?.did || doctorIdentity.did || "").trim();
      if (!issuerDid) {
        return res.status(500).json({ error: "Unable to resolve issuer DID for doctor wallet" });
      }
      if (issuerDid !== doctorIdentity.did) {
        await upsertIdentity(doctorIdentity.wallet, issuerDid, doctorIdentity.role);
      }

      const doctorProfile = await getDoctorProfileByDid(doctorIdentity.did);

      const credentialType = String(req.body.credentialType || "VaccinationCredential").trim() || "VaccinationCredential";
      const issuedAt = new Date().toISOString();
      const credentialDetails = req.body.credentialDetails && typeof req.body.credentialDetails === "object"
        ? req.body.credentialDetails
        : {};
      const expiration = resolveExpiration(credentialDetails, issuedAt);

      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: issuerDid },
          issuanceDate: issuedAt,
          ...(expiration.expirationDate ? { expirationDate: expiration.expirationDate } : {}),
          credentialSubject: {
            id: patientIdentity.did,
            wallet: patientIdentity.wallet,
            name: req.body.name,
            role: req.body.role || "patient",
            ...credentialDetails,
            hospitalOrClinic: String(doctorProfile?.hospitalOrClinic || credentialDetails?.hospitalOrClinic || "").trim() || "N/A",
            professionalId: String(doctorProfile?.professionalId || credentialDetails?.professionalId || "").trim() || "N/A",
            issuerDid,
            expirationDate: expiration.expirationDate || "Lifetime",
            expirationPolicy: expiration.expirationPolicy,
          },
          type: ["VerifiableCredential", credentialType],
        },
        proofFormat: "jwt",
      });

      const vcJwt =
        typeof credential === "string"
          ? credential
          : String(credential?.proof?.jwt || "").trim();
      if (!vcJwt) {
        return res.status(500).json({ error: "Issued credential JWT is missing" });
      }

      const encryptedCredentialHex = encryptForPatient(encryptionPublicKey, vcJwt);
      const stored = await storeHybridEncryptedCredential({
        encryptedCredentialHex,
        subjectDid: patientIdentity.did,
        subjectWallet: patientIdentity.wallet,
        issuerDid,
        credentialType,
        issuedAt,
        expirationDate: expiration.expirationDate,
        expirationPolicy: expiration.expirationPolicy,
      });

      // Emit real-time event to patient and doctor for hybrid credential
      const eventData = {
        type: 'credential-issued',
        mode: 'hybrid',
        credentialType: credentialType,
        issuedAt: issuedAt,
        issuerName: req.body.name,
        issuerDid: issuerDid,
        patientDid: patientIdentity.did,
        patientWallet: patientIdentity.wallet,
        cid: stored.cid,
      };
      emitEventToWallet(patientIdentity.wallet, 'credential-issued', eventData);
      emitEventToWallet(doctorIdentity.wallet, 'credential-issued', eventData);

      await appendAuditLog({
        action: 'credential_issuance',
        role: 'doctor',
        wallet: doctorIdentity.wallet,
        did: doctorIdentity.did,
        status: 'success',
        details: `Issued ${credentialType} to ${patientIdentity.wallet}`,
        metadata: {
          patientWallet: patientIdentity.wallet,
          patientDid: patientIdentity.did,
          cid: stored.cid,
          payloadHash: stored.payloadHash,
        },
      });

      return res.status(201).json({
        success: true,
        mode: "hybrid",
        storageMode: stored.storageMode,
        issuedTo: patientIdentity.did,
        patientWallet: patientIdentity.wallet,
        issuerDid,
        credentialType,
        cid: stored.cid,
        payloadHash: stored.payloadHash,
        issuedAt,
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Hybrid credential preparation failed";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: "Hybrid credential preparation failed", details: message });
    }
  });

  router.post("/hybrid/finalize", async (req, res) => {
    try {
      const doctorIdentity = await resolveIdentityByJWT(req);
      const debugId = `hybrid-finalize-${Date.now()}`;
      console.log(`[HYBRID][${debugId}] Finalize request`, {
        doctorWallet: doctorIdentity.wallet,
        cid: req.body.cid,
        txHash: req.body.txHash,
        recordId: req.body.recordId,
        chainId: req.body.chainId,
        contractAddress: req.body.contractAddress,
      });
      if (doctorIdentity.role !== "doctor") {
        return res.status(403).json({ error: "Doctor role required to finalize issuance" });
      }

      const cid = String(req.body.cid || "").trim();
      const txHash = String(req.body.txHash || "").trim();
      const recordId = String(req.body.recordId || "").trim();
      const chainId = String(req.body.chainId || "").trim();
      const contractAddress = String(req.body.contractAddress || "").trim().toLowerCase();

      if (!cid || !txHash || !recordId || !chainId || !contractAddress) {
        return res.status(400).json({ error: "cid, txHash, recordId, chainId and contractAddress are required" });
      }

      const finalized = await finalizeHybridCredential({
        cid,
        txHash,
        chainId,
        contractAddress,
        recordId,
      });
      console.log(`[HYBRID][${debugId}] Finalize success`, {
        cid: finalized.cid,
        recordId: finalized.recordId,
        txHash: finalized.txHash,
        contractAddress: finalized.contractAddress,
      });

      // Emit event to patient for blockchain confirmation
      const eventData = {
        type: 'credential-finalized',
        mode: 'hybrid',
        credentialType: finalized.credentialType,
        issuedAt: finalized.issuedAt,
        issuerDid: finalized.issuerDid,
        txHash: txHash,
        recordId: recordId,
        chainId: chainId,
      };
      emitEventToWallet(finalized.subjectWallet, 'credential-finalized', eventData);
      emitEventToWallet(finalized.issuerDid, 'credential-finalized', eventData);

      return res.json({ success: true, record: finalized });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Failed to finalize hybrid credential";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      if (message === "Hybrid credential record not found for cid") {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: "Failed to finalize hybrid credential" });
    }
  });

  router.get("/hybrid/cid/:cid", async (req, res) => {
    try {
      const identity = await resolveIdentityByJWT(req);
      if (identity.role !== "patient") {
        return res.status(403).json({ error: "Patient role required for encrypted payload access" });
      }
      const cid = String(req.params.cid || "").trim();
      if (!cid) {
        return res.status(400).json({ error: "cid is required" });
      }

      console.log(`[HYBRID_CID] Fetching credential, CID: ${cid}, patient wallet: ${identity.wallet}`);
      
      const found = await getHybridCredentialByCid(cid);
      if (!found) {
        console.error(`[HYBRID_CID] Credential not found, CID: ${cid}`);
        return res.status(404).json({ error: "Encrypted payload not found for cid" });
      }

      if (found.subjectDid !== identity.did) {
        console.error(`[HYBRID_CID] Access denied - DID mismatch`);
        return res.status(403).json({ error: "Patient can only access own encrypted credential" });
      }

      const hasEncryptedHex = !!found.encryptedCredentialHex;
      console.log(`[HYBRID_CID] Found credential, hasEncryptedHex: ${hasEncryptedHex}, hexLength: ${found.encryptedCredentialHex?.length || 0}`);

      if (!hasEncryptedHex) {
        console.error(`[HYBRID_CID] ERROR: Encrypted credential hex is empty after retrieval!`);
        return res.status(500).json({ 
          error: "Failed to retrieve encrypted credential from storage",
          hint: "The credential data may not have been properly encrypted or stored. Contact support."
        });
      }

      await appendAuditLog({
        action: 'credential_decryption',
        role: 'patient',
        wallet: identity.wallet,
        did: identity.did,
        status: 'success',
        details: `Fetched encrypted payload for decryption (${found.cid})`,
        metadata: {
          cid: found.cid,
          recordId: found.recordId || null,
          credentialType: found.credentialType,
        },
      });

      return res.json({
        success: true,
        cid: found.cid,
        payloadHash: found.payloadHash,
        encryptedCredentialHex: found.encryptedCredentialHex,
        credentialType: found.credentialType,
        issuedAt: found.issuedAt,
        contractAddress: found.contractAddress || null,
        recordId: found.recordId || null,
      });
    } catch (error) {
      console.error('[HYBRID_CID] Error:', error);
      const message = (error as any)?.message || "Failed to fetch encrypted payload";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: "Failed to fetch encrypted payload" });
    }
  });

  router.get("/received/:subjectId", async (req, res) => {
    try {
      const patientIdentity = await resolveIdentityByJWT(req);
      if (patientIdentity.role !== "patient") {
        return res.status(403).json({ error: "Patient access only" });
      }

      const subjectId = String(req.params.subjectId || "").toLowerCase();
      if (subjectId !== patientIdentity.did.toLowerCase()) {
        return res.status(403).json({ error: "You can only read credentials issued to your own DID" });
      }

      const received = (await listHybridCredentialsBySubjectDid(patientIdentity.did)).map((entry) => ({
        issuedAt: entry.issuedAt,
        credentialType: entry.credentialType,
        mode: "hybrid",
        cid: entry.cid,
        payloadHash: entry.payloadHash,
        recordId: entry.recordId || null,
        txHash: entry.txHash || null,
        chainId: entry.chainId || null,
        contractAddress: entry.contractAddress || null,
      }));

      res.json({
        subjectId: req.params.subjectId,
        total: received.length,
        credentials: received,
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Failed to load received credentials";
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: "Failed to load received credentials" });
    }
  });

  router.post("/qr/create", async (req, res) => {
    try {
      const identity = await resolveIdentityByJWT(req);
      if (identity.role !== "patient") {
        return res.status(403).json({ error: "Patient role required" });
      }

      const requestedRecordId = String(req.body.recordId || "").trim();
      const issuedAt = String(req.body.issuedAt || "").trim();
      const credentialType = String(req.body.credentialType || "").trim();
      if (!requestedRecordId && !issuedAt) {
        return res.status(400).json({ error: "recordId or issuedAt is required" });
      }

      const records = await listHybridCredentialsBySubjectDid(identity.did);
      const target = records.find(
        (entry) =>
          (!requestedRecordId || String(entry.recordId || "").trim() === requestedRecordId) &&
          (!issuedAt || String(entry.issuedAt || "").trim() === issuedAt) &&
          (!credentialType || String(entry.credentialType || "").trim() === credentialType)
      );

      if (!target) {
        return res.status(404).json({ error: "Hybrid credential not found for patient" });
      }

      if (!target.recordId || !target.contractAddress) {
        return res.status(409).json({
          error: "Credential has not been finalized on-chain yet",
          hint: "Wait for doctor finalize step before generating verifier QR",
        });
      }

      const session = await createCredentialQrSession({
        subjectDid: identity.did,
        issuedAt: target.issuedAt,
        credentialType: target.credentialType,
        cid: target.cid,
        payloadHash: target.payloadHash,
        recordId: String(target.recordId),
        contractAddress: String(target.contractAddress),
        chainId: String(target.chainId || "") || undefined,
        createdByWallet: identity.wallet,
        ttlSeconds: 600,
      });

      const qrPayload = JSON.stringify({
        type: "healthchain-credential-qr",
        token: session.token,
      });

      return res.status(201).json({
        success: true,
        mode: "hybrid",
        qrPayload,
        serverNowUtc: new Date().toISOString(),
        serverNowEpochMs: Date.now(),
        expiresAt: session.expiresAt,
        expiresAtUtc: session.expiresAt,
        expiresAtEpochMs: new Date(session.expiresAt).getTime(),
        expiresInSeconds: Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)),
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Failed to create credential QR";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: "Failed to create credential QR" });
    }
  });

  router.post("/hybrid/verify", async (req, res) => {
    try {
      const verifierIdentity = await resolveIdentityByJWT(req);
      if (verifierIdentity.role !== "verifier") {
        return res.status(403).json({ error: "Verifier role required" });
      }

      const address = String(req.body.address || "").trim().toLowerCase();
      const message = String(req.body.message || "").trim();
      const signature = String(req.body.signature || "").trim();

      if (!address || !message || !signature) {
        return res.status(400).json({ error: "address, message and signature are required" });
      }

      if (address !== verifierIdentity.wallet.toLowerCase()) {
        return res.status(403).json({ error: "Signer wallet does not match authenticated verifier wallet" });
      }

      const recovered = ethers.verifyMessage(message, signature).toLowerCase();
      if (recovered !== address) {
        return res.status(401).json({ error: "Invalid verifier signature" });
      }

      const payload = parseHybridVerifyPayload(req.body.payload);

      const rpcUrl = String(process.env.RPC_URL || "http://127.0.0.1:8545").trim();
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(
        payload.contractAddress,
        ["function verifyRecord(uint256 recordId, string cid, bytes32 payloadHash) view returns (bool)"],
        provider
      );

      const valid = Boolean(
        await contract.verifyRecord(
          BigInt(payload.recordId),
          payload.cid,
          payload.payloadHash
        )
      );

      const foundRecord = await getHybridCredentialByCid(payload.cid)
      const expirationDate = String(foundRecord?.expirationDate || '').trim()
      const isExpired = Boolean(
        valid &&
        expirationDate &&
        !/^lifetime$/i.test(expirationDate) &&
        Number.isFinite(Date.parse(expirationDate)) &&
        Date.now() > Date.parse(expirationDate)
      )

      const verificationStatusText = !valid
        ? 'Verification Failed'
        : isExpired
          ? 'Credential Expired'
          : 'Verified Valid'

      await appendAuditLog({
        action: 'verification',
        role: 'verifier',
        wallet: verifierIdentity.wallet,
        did: verifierIdentity.did,
        status: valid && !isExpired ? 'success' : 'failed',
        details: verificationStatusText,
        metadata: {
          contractAddress: payload.contractAddress,
          recordId: payload.recordId,
          cid: payload.cid,
          payloadHash: payload.payloadHash,
          expirationDate: expirationDate || null,
          isExpired,
        },
      });

      return res.json({
        success: true,
        mode: "hybrid",
        valid,
        expired: isExpired,
        statusText: verificationStatusText,
        verifiedBy: verifierIdentity.did,
        contractAddress: payload.contractAddress,
        recordId: payload.recordId,
        cid: payload.cid,
        payloadHash: payload.payloadHash,
        expirationDate: expirationDate || null,
      });
    } catch (error: any) {
      console.error(error);
      const message = String(error?.message || "Failed to verify hybrid credential");
      if (message === "Not authenticated. Use JWT token in Authorization header.") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      if (
        message === "Unsupported payload type" ||
        message === "Hybrid payload is missing required fields" ||
        message === "Invalid payloadHash format" ||
        message === "Invalid recordId"
      ) {
        return res.status(400).json({ error: message });
      }
      return res.status(500).json({ error: "Failed to verify hybrid credential" });
    }
  });

  router.post("/qr/verify", (_req, res) => {
    return res.status(410).json({
      error: "Legacy QR-session verification endpoint removed",
      hint: "Use hybrid payload verification in verifier dashboard with type=healthchain-hybrid-record",
    });
  });

  router.post("/qr/redeem", (_req, res) => {
    return res.status(410).json({
      error: "Legacy QR-session verification endpoint removed",
      hint: "Use hybrid payload verification in verifier dashboard with type=healthchain-hybrid-record",
    });
  });

  return router;
}
