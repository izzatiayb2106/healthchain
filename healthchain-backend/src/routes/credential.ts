import express from "express";
import { ethers } from "ethers";
import { getIdentityByDid, getIdentityByWallet } from "../services/authServices";
import { listIssuedCredentialsBySubject, saveIssuedCredential } from "../services/credentialServices";

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

  router.post("/issue", async (req, res) => {
    try {
      const doctorIdentity = await resolveIdentityBySignedWallet(req);
      if (doctorIdentity.role !== "doctor") {
        return res.status(403).json({ error: "Doctor role required to issue credentials" });
      }

      const subjectDid = String(req.body.subjectDid || req.body.subject || "").trim();
      if (!subjectDid) {
        return res.status(400).json({ error: "subjectDid is required" });
      }

      const patientIdentity = await getIdentityByDid(subjectDid);
      if (!patientIdentity || patientIdentity.role !== "patient") {
        return res.status(400).json({ error: "subjectDid must belong to an existing patient" });
      }

      const subjectWallet = String(req.body.subjectWallet || "").trim().toLowerCase();
      if (subjectWallet && subjectWallet !== patientIdentity.wallet) {
        return res.status(400).json({ error: "subjectWallet does not match subjectDid mapping" });
      }

      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: doctorIdentity.did },
          credentialSubject: {
            id: patientIdentity.did,
            wallet: patientIdentity.wallet,
            name: req.body.name,
            role: req.body.role || "patient",
          },
          type: ['VerifiableCredential', req.body.credentialType || 'RoleCredential'],
        },
        proofFormat: "jwt"
      });

      await saveIssuedCredential(patientIdentity.did, String(req.body.credentialType || 'RoleCredential'), credential);

      res.json({
        success: true,
        issuedBy: doctorIdentity.did,
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
      res.status(500).json({ error: "Credential issuance failed" });
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

  return router;
}