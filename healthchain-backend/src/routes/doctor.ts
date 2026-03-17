import express from "express";
import { ethers } from "ethers";
import { getIdentityByWallet } from "../services/authServices";
import { getDoctorProfileByDid, upsertDoctorProfile } from "../services/doctorProfileService";
import { getPatientProfileByDid, getPatientProfileByWallet } from "../services/patientProfileService";
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

function getWalletAuth(req: express.Request) {
  const wallet = String(req.header("x-user-wallet") || "").trim().toLowerCase();
  const signature = String(req.header("x-user-signature") || "").trim();
  const message = String(req.header("x-user-message") || "").trim();
  return { wallet, signature, message };
}

async function resolveDoctorIdentity(req: express.Request) {
  const { wallet, signature, message } = getWalletAuth(req);
  if (!wallet || !signature || !message) {
    throw new Error("Missing user authentication headers");
  }

  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== wallet) {
    throw new Error("Invalid user signature");
  }

  const identity = await getIdentityByWallet(wallet);
  if (!identity || identity.role !== "doctor") {
    throw new Error("Doctor role required");
  }

  return identity;
}

export default function doctorRoutes() {
  const router = express.Router();

  router.get("/profile/me", async (req, res) => {
    try {
      const identity = await resolveDoctorIdentity(req);
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
      const identity = await resolveDoctorIdentity(req);
      const displayName = String(req.body.displayName || "").trim();
      const specialty = String(req.body.specialty || "").trim();
      const hospitalOrClinic = String(req.body.hospitalOrClinic || "").trim();
      const licenseNumber = String(req.body.licenseNumber || "").trim();
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
        licenseNumber,
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
      const identity = await resolveDoctorIdentity(req);
      const current = await getDoctorProfileByDid(identity.did);
      if (!current) {
        return res.status(404).json({ error: "Doctor profile not found. Complete onboarding first." });
      }

      const payload = {
        displayName: req.body.displayName,
        specialty: req.body.specialty,
        hospitalOrClinic: req.body.hospitalOrClinic,
        licenseNumber: req.body.licenseNumber,
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
      const licenseNumber = typeof payload.licenseNumber === "string" ? String(payload.licenseNumber).trim() : undefined;
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
        licenseNumber,
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
      const identity = await resolveDoctorIdentity(req);
      const patientWallet = String(req.body.patientWallet || "").trim().toLowerCase();
      const patientDid = String(req.body.patientDid || "").trim();

      if (!patientWallet) {
        return res.status(400).json({ error: "patientWallet is required" });
      }

      if (!patientDid) {
        return res.status(400).json({ error: "patientDid is required" });
      }

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
      const identity = await resolveDoctorIdentity(req);
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
      const identity = await resolveDoctorIdentity(req);
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
      const identity = await resolveDoctorIdentity(req);
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
      await resolveDoctorIdentity(req);
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

  return router;
}
