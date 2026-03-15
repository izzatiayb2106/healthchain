import express from "express";
import { ethers } from "ethers";
import { ensureDidForWallet } from "../services/didService";
import { getCaDid, getIdentityByWallet, getSystemAdminWallet, setRole, upsertIdentity } from "../services/authServices";
import { hasCredentialType, saveIssuedCredential } from "../services/credentialServices";

export default function authRoutes(agent: any) {
  const router = express.Router();

  router.post("/metamask", async (req, res) => {
    try {
      const { address, signature, message } = req.body;

      const recovered = ethers.verifyMessage(message, signature);

      if (recovered.toLowerCase() !== String(address || '').toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const ensured = await ensureDidForWallet(agent, address);
      const did = String(ensured.identifier?.did || '');

      const existing = await getIdentityByWallet(address);
      let mapped = await upsertIdentity(address, did, existing?.role || 'pending');

      const systemAdminWallet = await getSystemAdminWallet()
      if (systemAdminWallet && mapped.wallet === systemAdminWallet && mapped.role !== 'admin') {
        mapped = await setRole(mapped.wallet, 'admin')
      }

      let patientCredentialIssued = false
      const caDid = await getCaDid()
      if (caDid) {
        const hasPatientCredential = await hasCredentialType(mapped.did, 'PatientCredential')
        if (!hasPatientCredential) {
          const credential = await agent.createVerifiableCredential({
            credential: {
              issuer: { id: caDid },
              credentialSubject: {
                id: mapped.did,
                wallet: mapped.wallet,
                role: 'patient',
                verificationStatus: 'pending',
              },
              type: ['VerifiableCredential', 'PatientCredential'],
            },
            proofFormat: 'jwt',
          })
          await saveIssuedCredential(mapped.did, 'PatientCredential', credential)
          patientCredentialIssued = true
        }
      }

      res.json({
        success: true,
        address: mapped.wallet,
        did: mapped.did,
        role: mapped.role,
        didCreated: ensured.created,
        patientCredentialIssued,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  return router;
}