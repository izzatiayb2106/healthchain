import express from "express";
import { ethers } from "ethers";
import { getIdentityByDid, getIdentityByWallet } from "../services/authServices";
import { getPatientProfileByDid, upsertPatientProfile } from "../services/patientProfileService";
import { getDoctorProfileByDid } from "../services/doctorProfileService";
import { addPendingPatient } from "../services/doctorPendingPatientsService";
import { listHybridCredentialsBySubjectDid } from "../services/hybridCredentialService";
import { jwtAuthMiddleware } from "../middleware/jwtAuth";

function getWalletAuth(req: express.Request) {
  const wallet = String(req.header("x-user-wallet") || "").trim().toLowerCase();
  const signature = String(req.header("x-user-signature") || "").trim();
  const message = String(req.header("x-user-message") || "").trim();
  return { wallet, signature, message };
}

async function resolvePatientIdentityByJWT(req: express.Request) {
  const jwtUser = (req as any).user;
  if (!jwtUser || !jwtUser.wallet) {
    throw new Error("Not authenticated or missing wallet in JWT");
  }

  const identity = await getIdentityByWallet(jwtUser.wallet);
  if (!identity || identity.role !== "patient") {
    throw new Error("Patient role required");
  }

  return identity;
}

export default function patientRoutes() {
  const router = express.Router();
  router.use(jwtAuthMiddleware);

  router.get("/profile/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentityByJWT(req);
      const profile = await getPatientProfileByDid(identity.did);
      if (!profile) {
        return res.status(404).json({
          error: "Patient profile not found",
          did: identity.did,
          needsOnboarding: true,
        });
      }

      const needsOnboarding = !profile.fullName || !profile.dateOfBirth;
      return res.json({ did: identity.did, profile, needsOnboarding });
    } catch (error: any) {
      const message = error?.message || "Failed to load patient profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to load patient profile" });
    }
  });

  router.post("/profile/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentityByJWT(req);
      const fullName = String(req.body.fullName || "").trim();
      const dateOfBirth = String(req.body.dateOfBirth || "").trim();
      const bloodType = String(req.body.bloodType || "").trim();
      const phone = String(req.body.phone || "").trim();
      const email = String(req.body.email || "").trim();
      const emergencyContact = String(req.body.emergencyContact || "").trim();

      if (!fullName || !dateOfBirth) {
        return res.status(400).json({ error: "fullName and dateOfBirth are required" });
      }

      const profile = await upsertPatientProfile({
        did: identity.did,
        wallet: identity.wallet,
        fullName,
        dateOfBirth,
        bloodType,
        phone,
        email,
        emergencyContact,
      });

      return res.status(201).json({ success: true, profile });
    } catch (error: any) {
      const message = error?.message || "Failed to save patient profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to save patient profile" });
    }
  });

  router.put("/profile/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentityByJWT(req);
      const current = await getPatientProfileByDid(identity.did);
      if (!current) {
        return res.status(404).json({ error: "Patient profile not found. Complete onboarding first." });
      }

      const profile = await upsertPatientProfile({
        did: identity.did,
        wallet: identity.wallet,
        fullName: typeof req.body.fullName === "string" ? req.body.fullName : undefined,
        dateOfBirth: typeof req.body.dateOfBirth === "string" ? req.body.dateOfBirth : undefined,
        bloodType: typeof req.body.bloodType === "string" ? req.body.bloodType : undefined,
        phone: typeof req.body.phone === "string" ? req.body.phone : undefined,
        email: typeof req.body.email === "string" ? req.body.email : undefined,
        emergencyContact: typeof req.body.emergencyContact === "string" ? req.body.emergencyContact : undefined,
      });

      return res.json({ success: true, profile });
    } catch (error: any) {
      const message = error?.message || "Failed to update patient profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to update patient profile" });
    }
  });

  router.post("/profile/me/encryption-key", async (req, res) => {
    try {
      const identity = await resolvePatientIdentityByJWT(req);
      const encryptionPublicKey = String(req.body.encryptionPublicKey || "").trim();
      if (!encryptionPublicKey) {
        return res.status(400).json({ error: "encryptionPublicKey is required" });
      }

      const profile = await upsertPatientProfile({
        did: identity.did,
        wallet: identity.wallet,
        encryptionPublicKey,
      });

      return res.status(201).json({ success: true, profile });
    } catch (error: any) {
      const message = error?.message || "Failed to save encryption public key";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to save encryption public key" });
    }
  });

  router.get("/credentials/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentityByJWT(req);
      const hybrid = await listHybridCredentialsBySubjectDid(identity.did);

      const mapped = await Promise.all(
        hybrid
          .map(async (entry) => {
            const issuerDid = String(entry.issuerDid || "").trim();
            const issuerIdentity = issuerDid ? await getIdentityByDid(issuerDid) : null;
            const issuerProfile = issuerDid ? await getDoctorProfileByDid(issuerDid) : null;
            const issuerName = String(
              issuerProfile?.displayName || issuerProfile?.legalName || ""
            ).trim();
            return {
              issuedAt: entry.issuedAt,
              credentialType: entry.credentialType,
              issuerDid,
              issuerName,
              issuerRole: issuerIdentity?.role || "unknown",
              issuedByDoctor: issuerIdentity?.role === "doctor",
              credential: null,
              mode: "hybrid",
              cid: entry.cid,
              payloadHash: entry.payloadHash,
              recordId: entry.recordId || null,
              txHash: entry.txHash || null,
              chainId: entry.chainId || null,
              contractAddress: entry.contractAddress || null,
            };
          })
      );

      const doctorIssued = mapped.filter((entry) => entry.issuedByDoctor);
      return res.json({
        subjectDid: identity.did,
        total: doctorIssued.length,
        credentials: doctorIssued,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to load patient credentials";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to load patient credentials" });
    }
  });

  // Patient-initiated: register themselves with a doctor
  router.post("/register-with-doctor", async (req, res) => {
    try {
      const patientIdentity = await resolvePatientIdentityByJWT(req);

      const doctorWallet = String(req.body.doctorWallet || "").trim().toLowerCase();
      if (!doctorWallet) {
        return res.status(400).json({ error: "doctorWallet is required" });
      }

      const doctorIdentity = await getIdentityByWallet(doctorWallet);
      if (!doctorIdentity || doctorIdentity.role !== "doctor") {
        return res.status(404).json({ error: "No registered doctor found with that wallet address" });
      }

      addPendingPatient(
        doctorIdentity.did,
        doctorIdentity.wallet,
        patientIdentity.wallet,
        patientIdentity.did
      );

      return res.status(201).json({ success: true, doctorDid: doctorIdentity.did });
    } catch (error: any) {
      const message = error?.message || "Failed to register with doctor";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Patient role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to register with doctor" });
    }
  });

  return router;
}
