import express from "express";
import { getCaDid, getIdentityByDid } from "../services/authServices";
import { listIssuedCredentialsBySubject, saveIssuedCredential } from "../services/credentialServices";
import { requireAdmin } from "../middleware/adminAuth";

export default function credentialRoutes(agent: any) {
  const router = express.Router();

  router.post("/issue", requireAdmin, async (req, res) => {
    try {
      const issuerDid = String(req.body.issuer || "")
      const caDid = await getCaDid()
      if (!caDid) {
        return res.status(500).json({ error: "CA DID is not configured. Register one with /did/ca/register" })
      }

      if (issuerDid !== caDid) {
        return res.status(403).json({ error: "Only the reserved CA DID can issue credentials" })
      }

      const issuerIdentity = await getIdentityByDid(issuerDid)
      if (!issuerIdentity || issuerIdentity.role !== 'doctor') {
        return res.status(403).json({ error: "Issuer DID must be mapped with doctor role" })
      }

      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: issuerDid },
          credentialSubject: {
            id: req.body.subject,
            name: req.body.name,
            role: req.body.role
          },
          type: ['VerifiableCredential', req.body.credentialType || 'RoleCredential'],
        },
        proofFormat: "jwt"
      });

      const subjectId = String(req.body.subject || "");
      if (subjectId) {
        await saveIssuedCredential(subjectId, String(req.body.credentialType || 'RoleCredential'), credential)
      }

      res.json(credential);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Credential issuance failed" });
    }
  });

  router.get("/received/:subjectId", async (req, res) => {
    try {
      const role = String(req.header("x-user-role") || "").toLowerCase();
      if (role !== "patient") {
        return res.status(403).json({ error: "Patient access only" });
      }

      const subjectId = String(req.params.subjectId || "").toLowerCase();
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
      res.status(500).json({ error: "Failed to load received credentials" });
    }
  });

  return router;
}