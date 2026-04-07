import express from "express";
import { ethers } from "ethers";
import { ensureDidForWallet } from "../services/didService";
import { getCaDid, getIdentityByDid, getIdentityByWallet, getSystemAdminWallet, setRole, upsertIdentity } from "../services/authServices";
import { getDoctorProfileByDid, getVerifierProfileByDid, upsertDoctorProfile, upsertVerifierProfile } from "../services/doctorProfileService";
import {
  canLicenseBeIssuedToWallet,
  getMinistryLicenseByProfessionalId,
  listMinistryLicenseRecords,
  resolveProfessionalAccessRole,
} from "../services/ministryRegistryService";
import { registerSseConnection } from "../services/eventService";
import { jwtAuthMiddleware } from "../middleware/jwtAuth";
import { appendAuditLog } from "../services/auditLogService";
import { fundWalletIfNeeded } from "../services/walletFundingService";

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
  // issued-credentials store is retired; role is now resolved from identity mapping/registry updates.
  return normalizedCurrent;
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
      if (!existing) {
        await fundWalletIfNeeded(mapped.wallet, "auth:metamask registration");
      }

      const systemAdminWallet = await getSystemAdminWallet()
      if (systemAdminWallet && mapped.wallet === systemAdminWallet && mapped.role !== 'admin') {
        mapped = await setRole(mapped.wallet, 'admin')
      }

      const resolvedRole = await resolveRoleByCredential(mapped.did, mapped.role)
      if (mapped.role !== resolvedRole) {
        mapped = await setRole(mapped.wallet, resolvedRole)
      }

      const patientCredentialIssued = false

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

  // JWT-based login endpoint: Sign once, get token for all future requests
  router.post("/login-jwt", async (req, res) => {
    try {
      const { address, signature, message } = req.body;
      const professionalId = String(req.body?.professionalId || "").trim();

      if (!address || !signature || !message) {
        return res.status(400).json({ error: "address, signature, and message are required" });
      }

      // Verify signature
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== String(address || "").toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Get or create identity
      const ensured = await ensureDidForWallet(agent, address);
      const did = String(ensured.identifier?.did || "");

      const existing = await getIdentityByWallet(address);
      let mapped = await upsertIdentity(address, did, normalizeRole(existing?.role));
      if (!existing) {
        await fundWalletIfNeeded(mapped.wallet, "auth:login-jwt registration");
      }

      // Set admin if system admin wallet
      const systemAdminWallet = await getSystemAdminWallet();
      if (systemAdminWallet && mapped.wallet === systemAdminWallet && mapped.role !== "admin") {
        mapped = await setRole(mapped.wallet, "admin");
      }

      // Resolve role by credentials
      const resolvedRole = await resolveRoleByCredential(mapped.did, mapped.role);
      if (mapped.role !== resolvedRole) {
        mapped = await setRole(mapped.wallet, resolvedRole);
      }

      const normalizedRole = normalizeRole(mapped.role);
      if (normalizedRole === "doctor" || normalizedRole === "verifier") {
        if (!professionalId) {
          return res.status(400).json({ error: "professionalId is required for professional login" });
        }

        const licenseRecord = await getMinistryLicenseByProfessionalId(professionalId);
        if (!licenseRecord) {
          return res.status(404).json({ error: "Professional ID not found in Ministry registry" });
        }

        if (licenseRecord.status !== "active") {
          return res.status(400).json({ error: `License is not active (status: ${licenseRecord.status})` });
        }

        if (!canLicenseBeIssuedToWallet(licenseRecord, mapped.wallet)) {
          return res.status(403).json({ error: "Professional ID is linked to a different wallet" });
        }

        const allowedRole = resolveProfessionalAccessRole(licenseRecord);
        if (allowedRole !== normalizedRole) {
          return res.status(403).json({
            error: `This professional ID allows ${allowedRole} access, not ${normalizedRole}`,
          });
        }
      }

      const patientCredentialIssued = false;

      if ((mapped as any)?.locked) {
        await appendAuditLog({
          action: "login",
          role: mapped.role,
          wallet: mapped.wallet,
          did: mapped.did,
          status: "failed",
          details: "Blocked login attempt from locked account",
        });
        return res.status(423).json({
          error: "This account is locked by admin",
          reason: (mapped as any)?.lockReason || "Locked by admin",
        });
      }

      // Generate JWT token
      const { generateToken } = await import("../services/jwtService");
      const token = generateToken({
        wallet: mapped.wallet,
        did: mapped.did,
        role: normalizedRole,
      });

      res.json({
        success: true,
        token,
        address: mapped.wallet,
        did: mapped.did,
        role: mapped.role,
        expiresIn: "7d",
        didCreated: ensured.created,
        patientCredentialIssued,
      });

      await appendAuditLog({
        action: "login",
        role: mapped.role,
        wallet: mapped.wallet,
        did: mapped.did,
        status: "success",
        details: "JWT login success",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  router.post("/logout", jwtAuthMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      await appendAuditLog({
        action: "logout",
        role: normalizeRole(user.role),
        wallet: user.wallet,
        did: user.did,
        status: "success",
        details: "User logout",
      });

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to record logout" });
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

      let identity = await getIdentityByWallet(address);
      const wasNewIdentity = !identity || !identity.did;
      if (!identity || !identity.did) {
        const ensured = await ensureDidForWallet(agent, address);
        const did = String(ensured.identifier?.did || "").trim();
        if (!did) {
          return res.status(500).json({ error: "Failed to create DID mapping for this wallet" });
        }
        identity = await upsertIdentity(address, did, normalizeRole(identity?.role));
      }

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
      const updated = await setRole(identity.wallet, allowedRole);

      if (allowedRole === "doctor") {
        await upsertDoctorProfile({
          did: updated.did,
          wallet: updated.wallet,
          displayName: licenseRecord.fullName,
          specialty: licenseRecord.specialty,
          legalName: licenseRecord.fullName,
          legalNameVerified: Boolean(licenseRecord.fullName),
          professionalId: licenseRecord.professionalId,
        });
      } else {
        await upsertVerifierProfile({
          did: updated.did,
          wallet: updated.wallet,
          fullName: licenseRecord.fullName,
          legalName: licenseRecord.fullName,
          legalNameVerified: Boolean(licenseRecord.fullName),
          professionalId: licenseRecord.professionalId,
          specialty: licenseRecord.specialty,
          licenseType: licenseRecord.licenseType,
        });
      }

      if (wasNewIdentity) {
        await fundWalletIfNeeded(updated.wallet, "auth:professional-access registration");
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

  // Authenticated professional profile for current wallet (doctor/verifier).
  router.get("/professional/me", jwtAuthMiddleware, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.wallet) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const role = String(user.role || "").toLowerCase();
      if (role !== "doctor" && role !== "verifier") {
        return res.status(403).json({ error: "Professional role required" });
      }

      const wallet = String(user.wallet || "").trim().toLowerCase();
      const records = await listMinistryLicenseRecords();
      const record = records.find(
        (entry) => String(entry.linkedWallet || "").trim().toLowerCase() === wallet,
      );

      const doctorProfile = role === "doctor" ? await getDoctorProfileByDid(String(user.did || "").trim()) : null;
      const verifierProfile = role === "verifier" ? await getVerifierProfileByDid(String(user.did || "").trim()) : null;

      if (!record && !doctorProfile && !verifierProfile) {
        return res.status(404).json({ error: "Professional profile not found for this wallet" });
      }

      const fullName =
        String(
          doctorProfile?.displayName ||
            doctorProfile?.legalName ||
            verifierProfile?.fullName ||
            verifierProfile?.legalName ||
            record?.fullName ||
            "",
        ).trim() || "Unknown Professional";

      const resolvedProfessionalId =
        String(
          doctorProfile?.professionalId ||
            verifierProfile?.professionalId ||
            record?.professionalId ||
            "",
        ).trim() || "N/A";

      const specialty =
        String(
          doctorProfile?.specialty || verifierProfile?.specialty || record?.specialty || "",
        ).trim();

      const licenseType =
        String(verifierProfile?.licenseType || record?.licenseType || "").trim();

      const status = String(record?.status || "active").trim().toLowerCase();

      const validUntil = String(record?.validUntil || "").trim();

      return res.json({
        success: true,
        profile: {
          fullName,
          professionalId: resolvedProfessionalId,
          role: String(record?.role || role).trim().toLowerCase(),
          licenseType,
          specialty,
          status,
          validUntil,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to load professional profile" });
    }
  });

  // SSE endpoint for real-time credential updates
  // Requires JWT authentication (supports Authorization header or ?token=)
  router.get("/events", jwtAuthMiddleware, (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || !user.wallet) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      console.log(`[SSE] New client connection for wallet ${user.wallet}`);

      // Register this connection
      const cleanup = registerSseConnection(user.wallet, res);

      // Send initial connection confirmation
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ wallet: user.wallet, connectedAt: new Date().toISOString() })}\n\n`);

      // Handle client disconnect
      req.on("close", () => {
        cleanup();
      });
    } catch (error: any) {
      console.error("[SSE] Connection error:", error);
      res.status(500).json({ error: "SSE connection failed" });
    }
  });

  return router;
}