import express from "express";
import { ethers } from "ethers";
import { getIdentityByDid, getIdentityByWallet, upsertIdentity } from "../services/authServices";
import { listIssuedCredentialsBySubject, saveIssuedCredential } from "../services/credentialServices";
import { ensureDidForWallet } from "../services/didService";
import { createCredentialQrSession, getCredentialQrSession } from "../services/credentialQrService";

function getWalletAuth(req: express.Request) {
  const wallet = String(req.header("x-user-wallet") || "").trim().toLowerCase();
  const signature = String(req.header("x-user-signature") || "").trim();
  const message = String(req.header("x-user-message") || "").trim();
  return { wallet, signature, message };
}

async function resolveIdentityBySignedWallet(req: express.Request) {
  const { wallet, signature, message } = getWalletAuth(req);
  if (!wallet || !signature || !message) {
    throw new Error("Missing user authentication headers");
  }

  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== wallet) {
    throw new Error("Invalid user signature");
  }

  const identity = await getIdentityByWallet(wallet);
  if (!identity) {
    throw new Error("Identity not found for wallet");
  }

  return identity;
}

export default function credentialRoutes(agent: any) {
  const router = express.Router();

  const resolveQrToken = (tokenOrPayload: string) => {
    const raw = String(tokenOrPayload || "").trim();
    if (!raw) return "";

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.token === "string") {
        return parsed.token.trim();
      }
    } catch {
      // Not JSON, treat as direct token.
    }

    return raw;
  };

  router.post("/issue", async (req, res) => {
    try {
      const doctorIdentity = await resolveIdentityBySignedWallet(req);
      if (doctorIdentity.role !== "doctor") {
        return res.status(403).json({ error: "Doctor role required to issue credentials" });
      }

      const subjectInput = String(req.body.subjectDid || req.body.subject || "").trim();
      if (!subjectInput) {
        return res.status(400).json({ error: "subjectDid is required" });
      }

      // Backward compatibility: older pending records store wallet in patientDid.
      let patientIdentity = await getIdentityByDid(subjectInput);
      if (!patientIdentity && subjectInput.startsWith("0x")) {
        patientIdentity = await getIdentityByWallet(subjectInput.toLowerCase());
      }
      if (!patientIdentity || patientIdentity.role !== "patient") {
        return res.status(400).json({ error: "subjectDid must belong to an existing patient" });
      }

      const subjectWallet = String(req.body.subjectWallet || "").trim().toLowerCase();
      if (subjectWallet && subjectWallet !== patientIdentity.wallet) {
        return res.status(400).json({ error: "subjectWallet does not match subjectDid mapping" });
      }

      // Ensure issuer DID exists in Veramo key store to avoid stale DID mapping failures.
      const ensuredIssuer = await ensureDidForWallet(agent, doctorIdentity.wallet);
      const issuerDid = String(ensuredIssuer.identifier?.did || doctorIdentity.did || "").trim();
      if (!issuerDid) {
        return res.status(500).json({ error: "Unable to resolve issuer DID for doctor wallet" });
      }
      if (issuerDid !== doctorIdentity.did) {
        await upsertIdentity(doctorIdentity.wallet, issuerDid, doctorIdentity.role);
      }

      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: issuerDid },
          credentialSubject: {
            id: patientIdentity.did,
            wallet: patientIdentity.wallet,
            name: req.body.name,
            role: req.body.role || "patient",
            ...(req.body.credentialDetails && typeof req.body.credentialDetails === "object"
              ? req.body.credentialDetails
              : {}),
          },
          type: ['VerifiableCredential', req.body.credentialType || 'RoleCredential'],
        },
        proofFormat: "jwt"
      });

      await saveIssuedCredential(patientIdentity.did, String(req.body.credentialType || 'RoleCredential'), credential);

      res.json({
        success: true,
        issuedBy: issuerDid,
        issuedTo: patientIdentity.did,
        credentialType: String(req.body.credentialType || 'RoleCredential'),
        credential,
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Credential issuance failed";
      if (
        message === "Missing user authentication headers" ||
        message === "Invalid user signature"
      ) {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: "Credential issuance failed", details: message });
    }
  });

  router.get("/received/:subjectId", async (req, res) => {
    try {
      const patientIdentity = await resolveIdentityBySignedWallet(req);
      if (patientIdentity.role !== "patient") {
        return res.status(403).json({ error: "Patient access only" });
      }

      const subjectId = String(req.params.subjectId || "").toLowerCase();
      if (subjectId !== patientIdentity.did.toLowerCase()) {
        return res.status(403).json({ error: "You can only read credentials issued to your own DID" });
      }

      const received = (await listIssuedCredentialsBySubject(subjectId))
        .map((entry) => ({
          issuedAt: entry.issuedAt,
          credential: entry.credential,
          credentialType: entry.credentialType,
        }));

      res.json({
        subjectId: req.params.subjectId,
        total: received.length,
        credentials: received,
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Failed to load received credentials";
      if (
        message === "Missing user authentication headers" ||
        message === "Invalid user signature"
      ) {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: "Failed to load received credentials" });
    }
  });

  router.post("/qr/create", async (req, res) => {
    try {
      const identity = await resolveIdentityBySignedWallet(req);
      if (identity.role !== "patient") {
        return res.status(403).json({ error: "Patient role required" });
      }

      const issuedAt = String(req.body.issuedAt || "").trim();
      const credentialType = String(req.body.credentialType || "").trim();
      if (!issuedAt) {
        return res.status(400).json({ error: "issuedAt is required" });
      }

      const issued = await listIssuedCredentialsBySubject(identity.did);
      const target = issued.find(
        (entry) =>
          String(entry.issuedAt || "").trim() === issuedAt &&
          (!credentialType || String(entry.credentialType || "").trim() === credentialType)
      );

      if (!target) {
        return res.status(404).json({ error: "Credential not found for patient" });
      }

      const session = await createCredentialQrSession({
        subjectDid: identity.did,
        issuedAt: target.issuedAt,
        credentialType: target.credentialType,
        credential: target.credential,
        createdByWallet: identity.wallet,
        ttlSeconds: 600,
      });

      const qrPayload = JSON.stringify({
        type: "healthchain-credential-qr",
        token: session.token,
      });

      return res.status(201).json({
        success: true,
        qrPayload,
        expiresAt: session.expiresAt,
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

  router.post("/qr/redeem", async (req, res) => {
    try {
      const identity = await resolveIdentityBySignedWallet(req);
      if (identity.role !== "verifier") {
        return res.status(403).json({ error: "Verifier role required" });
      }

      const token = resolveQrToken(String(req.body.tokenOrPayload || req.body.token || ""));
      if (!token) {
        return res.status(400).json({ error: "tokenOrPayload is required" });
      }

      const session = await getCredentialQrSession(token);
      if (!session) {
        return res.status(404).json({ error: "QR token is invalid or expired" });
      }

      return res.json({
        success: true,
        verifiedBy: identity.did,
        subjectDid: session.subjectDid,
        issuedAt: session.issuedAt,
        credentialType: session.credentialType,
        credential: session.credential,
      });
    } catch (error) {
      console.error(error);
      const message = (error as any)?.message || "Failed to redeem credential QR";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Identity not found for wallet") {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: "Failed to redeem credential QR" });
    }
  });

  return router;
}