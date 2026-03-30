import express from "express";
import { ethers } from "ethers";
import { ensureDidForWallet } from "../services/didService";
import { getCaDid, getIdentityByDid, getIdentityByWallet, getSystemAdminWallet, setRole, upsertIdentity } from "../services/authServices";
import { hasCredentialType, saveIssuedCredential } from "../services/credentialServices";
import { upsertDoctorProfile } from "../services/doctorProfileService";
import {
  canLicenseBeIssuedToWallet,
  getMinistryLicenseByProfessionalId,
  listMinistryLicenseRecords,
  resolveProfessionalAccessRole,
} from "../services/ministryRegistryService";

const KNOWN_ROLES = new Set(["patient", "doctor", "verifier", "admin"]);

function normalizeRole(role: unknown): "patient" | "doctor" | "verifier" | "admin" {
  const candidate = String(role || "").toLowerCase();
  if (KNOWN_ROLES.has(candidate)) {
    return candidate as "patient" | "doctor" | "verifier" | "admin";
  }
  return "patient";
}

async function resolveRoleByCredential(did: string, currentRole: string) {
  const normalizedCurrent = normalizeRole(currentRole);

  if (normalizedCurrent === "admin" || normalizedCurrent === "verifier") {
    return normalizedCurrent;
  }

  if (
    await hasCredentialType(did, "DoctorCredential") ||
    await hasCredentialType(did, "MedicalLicenseCredential")
  ) {
    return "doctor";
  }

  return normalizedCurrent === "doctor" ? "doctor" : "patient";
}

export default function authRoutes(agent: any) {
  const router = express.Router();

  const resolveDemoMinistryDid = async () => {
    const issuerWallet = String(process.env.DEMO_MINISTRY_WALLET || "demo-ministry-wallet").trim().toLowerCase();
    const ensured = await ensureDidForWallet(agent, issuerWallet);
    return String(ensured.identifier?.did || "").trim();
  };

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
      let mapped = await upsertIdentity(address, did, normalizeRole(existing?.role));

      const systemAdminWallet = await getSystemAdminWallet()
      if (systemAdminWallet && mapped.wallet === systemAdminWallet && mapped.role !== 'admin') {
        mapped = await setRole(mapped.wallet, 'admin')
      }

      const resolvedRole = await resolveRoleByCredential(mapped.did, mapped.role)
      if (mapped.role !== resolvedRole) {
        mapped = await setRole(mapped.wallet, resolvedRole)
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


  // Whitelist-only professional access for demo: professionalId + requestedRole
  router.post("/professional/access", async (req, res) => {
    try {
      const address = String(req.body.address || "").trim();
      const signature = String(req.body.signature || "").trim();
      const message = String(req.body.message || "").trim();
      const providedDid = String(req.body.did || "").trim();
      const professionalId = String(req.body.professionalId || "").trim();
      const requestedRole = String(req.body.requestedRole || "").trim().toLowerCase();

      if (!address || !signature || !message) {
        return res.status(400).json({ error: "address, signature, and message are required" });
      }
      if (!professionalId) {
        return res.status(400).json({ error: "professionalId is required" });
      }
      if (requestedRole !== "doctor" && requestedRole !== "verifier") {
        return res.status(400).json({ error: "requestedRole must be doctor or verifier" });
      }

      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const identity = await getIdentityByWallet(address);
      if (!identity || !identity.did) {
        return res.status(404).json({ error: "No DID mapping found for this wallet" });
      }
      if (providedDid && providedDid !== identity.did) {
        return res.status(400).json({ error: "Submitted DID does not match wallet identity" });
      }

      const licenseRecord = await getMinistryLicenseByProfessionalId(professionalId);
      if (!licenseRecord) {
        return res.status(404).json({ error: "Professional ID not found in Ministry registry" });
      }
      if (licenseRecord.status !== "active") {
        return res.status(400).json({ error: `License is not active (status: ${licenseRecord.status})` });
      }
      if (!canLicenseBeIssuedToWallet(licenseRecord, identity.wallet)) {
        return res.status(403).json({ error: "Professional ID is linked to a different wallet" });
      }

      const allowedRole = resolveProfessionalAccessRole(licenseRecord);
      if (allowedRole !== requestedRole) {
        return res.status(403).json({
          error: `This professional ID allows ${allowedRole} access, not ${requestedRole}`,
        });
      }

      const ministryDid = await resolveDemoMinistryDid();
      if (!ministryDid) {
        return res.status(500).json({ error: "Failed to resolve demo Ministry DID" });
      }

      const vcType = allowedRole === "doctor" ? "MedicalLicenseCredential" : "VerifierCredential";
      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: ministryDid },
          credentialSubject: {
            id: identity.did,
            wallet: identity.wallet,
            name: licenseRecord.fullName,
            role: allowedRole,
            professionalId: licenseRecord.professionalId,
            licenseType: licenseRecord.licenseType,
            specialty: licenseRecord.specialty,
            licenseStatus: licenseRecord.status,
            validUntil: licenseRecord.validUntil,
            issuedBy: "Demo Ministry of Health",
          },
          type: ["VerifiableCredential", vcType],
        },
        proofFormat: "jwt",
      });

      await saveIssuedCredential(identity.did, vcType, credential);
      const updated = await setRole(identity.wallet, allowedRole);

      if (allowedRole === "doctor") {
        await upsertDoctorProfile({
          did: updated.did,
          wallet: updated.wallet,
          legalName: licenseRecord.fullName,
          legalNameVerified: Boolean(licenseRecord.fullName),
          licenseNumber: licenseRecord.professionalId,
        });
      }

      return res.json({
        success: true,
        wallet: updated.wallet,
        did: updated.did,
        role: updated.role,
        professionalId: licenseRecord.professionalId,
        credentialType: vcType,
        issuer: ministryDid,
      });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({
        error: "Professional access request failed",
        details: err?.message || "Unknown error",
      });
    }
  });

  // Demo helper: list Ministry registry entries used as source-of-truth for issuance.
  router.get("/ministry/registry", async (_req, res) => {
    try {
      const records = await listMinistryLicenseRecords();
      return res.json({ total: records.length, records });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Failed to load Ministry registry" });
    }
  });

  return router;
}