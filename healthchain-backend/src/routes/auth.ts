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
} from "../services/ministryRegistryService";

const KNOWN_ROLES = new Set(["patient", "doctor", "verifier", "admin"]);

function normalizeRole(role: unknown): "patient" | "doctor" | "verifier" | "admin" {
  const candidate = String(role || "").toLowerCase();
  if (KNOWN_ROLES.has(candidate)) {
    return candidate as "patient" | "doctor" | "verifier" | "admin";
  }
  return "patient";
}

function parseJwtPayload(credentialJwt: string): any {
  const token = String(credentialJwt || "").trim();
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function extractCredentialMetadata(verificationResult: any, credentialJwt: string) {
  const verifiableCredential = verificationResult?.verifiableCredential || verificationResult?.credential || verificationResult?.result?.verifiableCredential;
  const jwtPayload = parseJwtPayload(credentialJwt);
  const vcFromJwt = jwtPayload?.vc || {};

  const rawIssuer =
    verifiableCredential?.issuer ||
    vcFromJwt?.issuer ||
    jwtPayload?.iss ||
    "";
  const issuerDid = typeof rawIssuer === "string" ? rawIssuer : String(rawIssuer?.id || "");

  const rawSubject =
    verifiableCredential?.credentialSubject ||
    vcFromJwt?.credentialSubject ||
    {};
  const subject = Array.isArray(rawSubject) ? rawSubject[0] : rawSubject;
  const subjectDid = String(subject?.id || "");

  const vcTypes =
    verifiableCredential?.type ||
    vcFromJwt?.type ||
    [];
  const types = (Array.isArray(vcTypes) ? vcTypes : [vcTypes])
    .map((entry: unknown) => String(entry || ""))
    .filter(Boolean);

  return { issuerDid, subjectDid, types };
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

  router.post("/doctor/apply-vc", async (req, res) => {
    try {
      const address = String(req.body.address || "").trim();
      const signature = String(req.body.signature || "").trim();
      const message = String(req.body.message || "").trim();
      const providedDid = String(req.body.did || "").trim();
      const professionalId = String(req.body.professionalId || "").trim();
      const credentialJwt = String(req.body.credentialJwt || "").trim();

      if (!address || !signature || !message) {
        return res.status(400).json({ error: "address, signature, and message are required" });
      }

      if (!professionalId || !credentialJwt) {
        return res.status(400).json({ error: "professionalId and credentialJwt are required" });
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

      const verification = await agent.verifyCredential({
        credential: credentialJwt,
      });

      if (verification?.verified === false) {
        return res.status(400).json({ error: "Credential verification failed" });
      }

      const metadata = extractCredentialMetadata(verification, credentialJwt);
      if (!metadata.subjectDid || metadata.subjectDid !== identity.did) {
        return res.status(403).json({ error: "Credential subject DID must match your DID" });
      }

      const acceptedTypes = new Set([
        "DoctorCredential",
        "MedicalLicenseCredential",
        "HealthProfessionalCredential",
      ]);
      const matchedType = metadata.types.find((entry) => acceptedTypes.has(entry));
      if (!matchedType) {
        return res.status(400).json({ error: "Credential type must be a recognized doctor/professional credential" });
      }

      const caDid = await getCaDid();
      const demoMinistryDid = await resolveDemoMinistryDid();
      const ministryDids = String(process.env.MINISTRY_DIDS || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const trustedIssuers = new Set([caDid, demoMinistryDid, ...ministryDids].filter(Boolean));

      if (trustedIssuers.size === 0) {
        return res.status(500).json({ error: "No trusted Ministry/CA issuer configured" });
      }

      if (!metadata.issuerDid || !trustedIssuers.has(metadata.issuerDid)) {
        return res.status(403).json({ error: "Credential issuer is not an approved Ministry of Health issuer" });
      }

      await saveIssuedCredential(identity.did, matchedType, credentialJwt);
      const updated = await setRole(identity.wallet, "doctor");
      const legalName = String(parseJwtPayload(credentialJwt)?.vc?.credentialSubject?.name || "").trim();
      await upsertDoctorProfile({
        did: updated.did,
        wallet: updated.wallet,
        legalName,
        legalNameVerified: Boolean(legalName),
        licenseNumber: professionalId,
      });

      return res.json({
        success: true,
        wallet: updated.wallet,
        did: updated.did,
        role: updated.role,
        professionalId,
        issuer: metadata.issuerDid,
        credentialType: matchedType,
      });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({
        error: "Doctor access application failed",
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

  // Demo helper: issue a Ministry-signed doctor-access VC JWT from a whitelist entry.
  router.post("/ministry/issue-doctor-vc", async (req, res) => {
    try {
      const professionalId = String(req.body.professionalId || "").trim();
      const doctorWallet = String(req.body.doctorWallet || "").trim().toLowerCase();
      const doctorDidInput = String(req.body.doctorDid || "").trim();

      if (!professionalId) {
        return res.status(400).json({ error: "professionalId is required" });
      }

      if (!doctorWallet && !doctorDidInput) {
        return res.status(400).json({ error: "doctorWallet or doctorDid is required" });
      }

      const licenseRecord = await getMinistryLicenseByProfessionalId(professionalId);
      if (!licenseRecord) {
        return res.status(404).json({ error: "Professional ID not found in Ministry registry" });
      }

      if (licenseRecord.status !== "active") {
        return res.status(400).json({ error: `License is not active (status: ${licenseRecord.status})` });
      }

      let doctorIdentity = null;
      if (doctorWallet) {
        doctorIdentity = await getIdentityByWallet(doctorWallet);
      }
      if (!doctorIdentity && doctorDidInput) {
        doctorIdentity = await getIdentityByDid(doctorDidInput);
      }

      if (!doctorIdentity) {
        return res.status(404).json({ error: "Doctor identity not found. Login with MetaMask first to create DID mapping." });
      }

      if (!canLicenseBeIssuedToWallet(licenseRecord, doctorIdentity.wallet)) {
        return res.status(403).json({ error: "Professional ID is linked to a different wallet" });
      }

      const ministryDid = await resolveDemoMinistryDid();
      if (!ministryDid) {
        return res.status(500).json({ error: "Failed to resolve demo Ministry DID" });
      }

      const credential = await agent.createVerifiableCredential({
        credential: {
          issuer: { id: ministryDid },
          credentialSubject: {
            id: doctorIdentity.did,
            wallet: doctorIdentity.wallet,
            name: licenseRecord.fullName,
            role: "doctor",
            professionalId: licenseRecord.professionalId,
            licenseType: licenseRecord.licenseType,
            specialty: licenseRecord.specialty,
            licenseStatus: licenseRecord.status,
            validUntil: licenseRecord.validUntil,
            issuedBy: "Demo Ministry of Health",
          },
          type: ["VerifiableCredential", "MedicalLicenseCredential"],
        },
        proofFormat: "jwt",
      });

      const credentialJwt =
        typeof credential === "string"
          ? credential
          : String(credential?.proof?.jwt || "").trim();

      if (!credentialJwt) {
        return res.status(500).json({ error: "Issued credential did not include a JWT proof" });
      }

      return res.json({
        success: true,
        issuerDid: ministryDid,
        issuedTo: doctorIdentity.did,
        credentialType: "MedicalLicenseCredential",
        credentialJwt,
        credential,
      });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Failed to issue Ministry doctor VC", details: err?.message || "Unknown error" });
    }
  });

  return router;
}