import express from "express";
import { ethers } from "ethers";
import { getIdentityByDid, getIdentityByWallet } from "../services/authServices";
import { listIssuedCredentialsBySubject } from "../services/credentialServices";
import { getPatientProfileByDid, upsertPatientProfile } from "../services/patientProfileService";

function parseJwtPayload(tokenLike: string): any {
  const token = String(tokenLike || "").trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function extractIssuerDid(credential: any): string {
  if (!credential) return "";

  if (typeof credential === "string") {
    const jwtPayload = parseJwtPayload(credential);
    const vc = jwtPayload?.vc || {};
    const issuer = vc?.issuer || jwtPayload?.iss || "";
    return typeof issuer === "string" ? issuer : String(issuer?.id || "");
  }

  if (typeof credential === "object") {
    const issuer = credential?.issuer || credential?.vc?.issuer || credential?.proof?.issuer || "";
    return typeof issuer === "string" ? issuer : String(issuer?.id || "");
  }

  return "";
}

function getWalletAuth(req: express.Request) {
  const wallet = String(req.header("x-user-wallet") || "").trim().toLowerCase();
  const signature = String(req.header("x-user-signature") || "").trim();
  const message = String(req.header("x-user-message") || "").trim();
  return { wallet, signature, message };
}

async function resolvePatientIdentity(req: express.Request) {
  const { wallet, signature, message } = getWalletAuth(req);
  if (!wallet || !signature || !message) {
    throw new Error("Missing user authentication headers");
  }

  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== wallet) {
    throw new Error("Invalid user signature");
  }

  const identity = await getIdentityByWallet(wallet);
  if (!identity || identity.role !== "patient") {
    throw new Error("Patient role required");
  }

  return identity;
}

export default function patientRoutes() {
  const router = express.Router();

  router.get("/profile/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentity(req);
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
      const identity = await resolvePatientIdentity(req);
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
      const identity = await resolvePatientIdentity(req);
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

  router.get("/credentials/me", async (req, res) => {
    try {
      const identity = await resolvePatientIdentity(req);
      const issued = await listIssuedCredentialsBySubject(identity.did);

      const mapped = await Promise.all(
        issued
          .filter((entry) => entry.credentialType !== "PatientCredential")
          .map(async (entry) => {
            const issuerDid = extractIssuerDid(entry.credential);
            const issuerIdentity = issuerDid ? await getIdentityByDid(issuerDid) : null;
            return {
              issuedAt: entry.issuedAt,
              credentialType: entry.credentialType,
              issuerDid,
              issuerRole: issuerIdentity?.role || "unknown",
              issuedByDoctor: issuerIdentity?.role === "doctor",
              credential: entry.credential,
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

  return router;
}
