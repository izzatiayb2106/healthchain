import express from "express";
import { ethers } from "ethers";
import { getIdentityByDid, getIdentityByWallet } from "../services/authServices";
import { getDoctorProfileByDid, upsertDoctorProfile } from "../services/doctorProfileService";
import { getPatientProfileByDid, getPatientProfileByWallet } from "../services/patientProfileService";
import { listHybridCredentialsBySubjectDid } from "../services/hybridCredentialService";
import { jwtAuthMiddleware } from "../middleware/jwtAuth";
import {
  getPendingPatientsByDoctorDid,
  addPendingPatient,
  removePendingPatient,
} from "../services/doctorPendingPatientsService";

function isValidAvatarUrl(value: string) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function resolveDoctorIdentityByJWT(req: express.Request) {
  const jwtUser = (req as any).user;
  if (!jwtUser || !jwtUser.wallet) {
    throw new Error("Not authenticated or missing wallet in JWT");
  }

  const identity = await getIdentityByWallet(jwtUser.wallet);
  if (!identity || identity.role !== "doctor") {
    throw new Error("Doctor role required");
  }

  return identity;
}

export default function doctorRoutes() {
  const router = express.Router();
  router.use(jwtAuthMiddleware);

  router.get("/profile/me", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const profile = await getDoctorProfileByDid(identity.did);
      if (!profile) {
        return res.status(404).json({
          error: "Doctor profile not found",
          did: identity.did,
          needsOnboarding: true,
        });
      }

      const needsOnboarding = !profile.displayName || !profile.specialty || !profile.hospitalOrClinic;
      return res.json({ did: identity.did, profile, needsOnboarding });
    } catch (error: any) {
      const message = error?.message || "Failed to load doctor profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to load doctor profile" });
    }
  });

  router.post("/profile/me", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const displayName = String(req.body.displayName || "").trim();
      const specialty = String(req.body.specialty || "").trim();
      const hospitalOrClinic = String(req.body.hospitalOrClinic || "").trim();
      const professionalId = String(req.body.professionalId || req.body.licenseNumber || "").trim();
      const avatarUrl = String(req.body.avatarUrl || "").trim();

      if (!displayName || !specialty || !hospitalOrClinic) {
        return res.status(400).json({
          error: "displayName, specialty, and hospitalOrClinic are required",
        });
      }

      if (!isValidAvatarUrl(avatarUrl)) {
        return res.status(400).json({ error: "avatarUrl must be a valid http(s) URL" });
      }

      const profile = await upsertDoctorProfile({
        did: identity.did,
        wallet: identity.wallet,
        displayName,
        specialty,
        hospitalOrClinic,
        professionalId,
        avatarUrl,
      });

      return res.status(201).json({ success: true, profile });
    } catch (error: any) {
      const message = error?.message || "Failed to save doctor profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to save doctor profile" });
    }
  });

  router.put("/profile/me", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const current = await getDoctorProfileByDid(identity.did);
      if (!current) {
        return res.status(404).json({ error: "Doctor profile not found. Complete onboarding first." });
      }

      const payload = {
        displayName: req.body.displayName,
        specialty: req.body.specialty,
        hospitalOrClinic: req.body.hospitalOrClinic,
        professionalId: req.body.professionalId ?? req.body.licenseNumber,
        avatarUrl: req.body.avatarUrl,
      } as Record<string, unknown>;

      const hasAnyField = Object.values(payload).some((value) => typeof value === "string");
      if (!hasAnyField) {
        return res.status(400).json({
          error: "At least one editable profile field is required",
        });
      }

      const displayName = typeof payload.displayName === "string" ? String(payload.displayName).trim() : undefined;
      const specialty = typeof payload.specialty === "string" ? String(payload.specialty).trim() : undefined;
      const hospitalOrClinic = typeof payload.hospitalOrClinic === "string" ? String(payload.hospitalOrClinic).trim() : undefined;
      const professionalId = typeof payload.professionalId === "string" ? String(payload.professionalId).trim() : undefined;
      const avatarUrl = typeof payload.avatarUrl === "string" ? String(payload.avatarUrl).trim() : undefined;

      if (avatarUrl !== undefined && !isValidAvatarUrl(avatarUrl)) {
        return res.status(400).json({ error: "avatarUrl must be a valid http(s) URL" });
      }

      const updated = await upsertDoctorProfile({
        did: identity.did,
        wallet: identity.wallet,
        displayName,
        specialty,
        hospitalOrClinic,
        professionalId,
        avatarUrl,
      });

      return res.json({ success: true, profile: updated });
    } catch (error: any) {
      const message = error?.message || "Failed to update doctor profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to update doctor profile" });
    }
  });

  router.post("/pending-patients", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const patientWallet = String(req.body.patientWallet || "").trim().toLowerCase();
      const patientDidInput = String(req.body.patientDid || "").trim();

      if (!patientWallet) {
        return res.status(400).json({ error: "patientWallet is required" });
      }

      const patientIdentity = await getIdentityByWallet(patientWallet);
      if (!patientIdentity || patientIdentity.role !== "patient") {
        return res.status(404).json({ error: "No registered patient found with that wallet address" });
      }

      const patientDid =
        patientDidInput && patientDidInput.startsWith("did:")
          ? patientDidInput
          : patientIdentity.did;

      const recordAdded = addPendingPatient(identity.did, identity.wallet, patientWallet, patientDid);
      return res.status(201).json({ success: true, pendingPatients: recordAdded });
    } catch (error: any) {
      const message = error?.message || "Failed to add pending patient";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to add pending patient" });
    }
  });

  router.get("/pending-patients", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const pendingPatients = getPendingPatientsByDoctorDid(identity.did);
      return res.json({ success: true, pendingPatients: pendingPatients?.patients || [] });
    } catch (error: any) {
      const message = error?.message || "Failed to fetch pending patients";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch pending patients" });
    }
  });

  router.get("/pending-patients/me", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const pendingPatients = getPendingPatientsByDoctorDid(identity.did);
      return res.json({ success: true, pendingPatients: pendingPatients?.patients || [] });
    } catch (error: any) {
      const message = error?.message || "Failed to fetch pending patients";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch pending patients" });
    }
  });

  router.delete("/pending-patients/:patientWallet", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentityByJWT(req);
      const patientWallet = String(req.params.patientWallet || "").trim().toLowerCase();

      if (!patientWallet) {
        return res.status(400).json({ error: "patientWallet is required" });
      }

      const updated = removePendingPatient(identity.did, patientWallet);
      return res.json({ success: true, pendingPatients: updated?.patients || [] });
    } catch (error: any) {
      const message = error?.message || "Failed to remove pending patient";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to remove pending patient" });
    }
  });

  router.get("/patient-profile/:patientDid", async (req, res) => {
    try {
      await resolveDoctorIdentityByJWT(req);
      const patientDid = String(req.params.patientDid || "").trim();
      if (!patientDid) {
        return res.status(400).json({ error: "patientDid is required" });
      }

      // If patientDid looks like a plain wallet address (no DID prefix), fall back to wallet lookup
      let patientProfile = await getPatientProfileByDid(patientDid);
      if (!patientProfile && patientDid.startsWith("0x")) {
        patientProfile = await getPatientProfileByWallet(patientDid);
      }
      if (!patientProfile) {
        return res.status(404).json({ error: "Patient profile not found" });
      }

      return res.json({ success: true, profile: patientProfile });
    } catch (error: any) {
      const message = error?.message || "Failed to load patient profile";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to load patient profile" });
    }
  });

  router.get("/patient-credentials/:patientDid", async (req, res) => {
    try {
      const doctorIdentity = await resolveDoctorIdentityByJWT(req);
      const patientDidParam = String(req.params.patientDid || "").trim();
      if (!patientDidParam) {
        return res.status(400).json({ error: "patientDid is required" });
      }

      let patientIdentity = await getIdentityByDid(patientDidParam);
      if (!patientIdentity && patientDidParam.startsWith("0x")) {
        patientIdentity = await getIdentityByWallet(patientDidParam.toLowerCase());
      }
      if (!patientIdentity || patientIdentity.role !== "patient") {
        return res.status(404).json({ error: "Patient identity not found" });
      }

      const hybrid = await listHybridCredentialsBySubjectDid(patientIdentity.did);
      const doctorIssued = hybrid
        .filter((entry) => String(entry.issuerDid || "").toLowerCase() === doctorIdentity.did.toLowerCase())
        .map((entry) => ({
          issuedAt: entry.issuedAt,
          credentialType: entry.credentialType,
          issuerDid: entry.issuerDid,
          credential: null,
          mode: "hybrid",
          cid: entry.cid,
          payloadHash: entry.payloadHash,
          recordId: entry.recordId || null,
          txHash: entry.txHash || null,
          chainId: entry.chainId || null,
          contractAddress: entry.contractAddress || null,
          onChainFinalized: Boolean(entry.recordId && entry.contractAddress),
        }));

      const finalized = doctorIssued.filter((entry) => entry.onChainFinalized);
      const pending = doctorIssued.filter((entry) => !entry.onChainFinalized);

      return res.json({
        success: true,
        patientDid: patientIdentity.did,
        total: finalized.length,
        credentials: finalized,
        pendingCount: pending.length,
        pendingCredentials: pending,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to load patient credentials";
      if (message === "Missing user authentication headers" || message === "Invalid user signature") {
        return res.status(401).json({ error: message });
      }
      if (message === "Doctor role required") {
        return res.status(403).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "Failed to load patient credentials" });
    }
  });

  return router;
}
