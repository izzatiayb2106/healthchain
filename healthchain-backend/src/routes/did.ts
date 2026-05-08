import express from "express";
import { ensureDidForWallet } from "../services/didService";
import {
  createDoctorRequest,
  getCaDid,
  getDoctorRequest,
  getIdentityByWallet,
  listDoctorRequests,
  listIdentities,
  setIdentityLock,
  setCaDid,
  setDoctorRequestStatus,
  setRole,
  setSystemAdminWallet,
  upsertIdentity,
  UserRole,
} from "../services/authServices";
import { requireAdmin } from "../middleware/adminAuth";
import { appendAuditLog, listAuditLogs } from "../services/auditLogService";
import { fundWalletIfNeeded } from "../services/walletFundingService";

export default function didRoutes(agent: any) {
  const router = express.Router();
  const roleSet = new Set<UserRole>(['pending', 'patient', 'doctor', 'verifier', 'admin'])

  router.post("/create", async (req, res) => {
    try {
      const address = String(req.body.address || '').trim()
      const existing = await getIdentityByWallet(address)
      const ensured = await ensureDidForWallet(agent, address)
      const mapped = await upsertIdentity(address, String(ensured.identifier?.did || ''), existing?.role || 'pending')
      if (!existing) {
        await fundWalletIfNeeded(mapped.wallet, 'did:create registration')
      }

      res.json(ensured.identifier);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "DID creation failed" });
    }
  });

  router.post("/ensure", async (req, res) => {
    try {
      const address = String(req.body.address || "").trim();
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      const existing = await getIdentityByWallet(address)
      const ensured = await ensureDidForWallet(agent, address)
      const mapped = await upsertIdentity(address, String(ensured.identifier?.did || ''), existing?.role || 'pending')
      if (!existing) {
        await fundWalletIfNeeded(mapped.wallet, 'did:ensure registration')
      }

      return res.status(ensured.created ? 201 : 200).json({
        created: ensured.created,
        identifier: ensured.identifier,
        mapping: mapped,
      })
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to ensure DID",
        details: error?.message || "Unknown error",
      });
    }
  });

  router.get('/mapping/all', requireAdmin, async (_req, res) => {
    try {
      const identities = await listIdentities()
      res.json({ total: identities.length, identities })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Failed to list mappings' })
    }
  })

  router.get('/mapping/:wallet', async (req, res) => {
    try {
      const identity = await getIdentityByWallet(String(req.params.wallet || ''))
      if (!identity) {
        return res.status(404).json({ error: 'Identity mapping not found' })
      }
      res.json(identity)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Failed to load mapping' })
    }
  })

  router.put('/mapping/:wallet/role', requireAdmin, async (req, res) => {
    try {
      const role = String(req.body.role || '').toLowerCase() as UserRole
      if (!roleSet.has(role)) {
        return res.status(400).json({ error: 'Invalid role' })
      }
      const updated = await setRole(String(req.params.wallet || ''), role)
      res.json(updated)
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: error?.message || 'Failed to update role' })
    }
  })

  router.put('/mapping/:wallet/lock', requireAdmin, async (req, res) => {
    try {
      const wallet = String(req.params.wallet || '').trim()
      const reason = String(req.body.reason || '').trim()
      const identity = await getIdentityByWallet(wallet)
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found' })
      }
      if (identity.role === 'admin') {
        return res.status(400).json({ error: 'Admin account cannot be locked' })
      }

      const updated = await setIdentityLock(wallet, true, reason || 'Locked by admin')
      await appendAuditLog({
        action: 'lock_user',
        role: 'admin',
        wallet: String(req.header('x-admin-wallet') || '').trim().toLowerCase() || 'unknown',
        status: 'success',
        details: `Locked ${updated.wallet}`,
        metadata: { targetWallet: updated.wallet, reason: updated.lockReason || null },
      })

      return res.json(updated)
    } catch (error: any) {
      console.error(error)
      return res.status(500).json({ error: error?.message || 'Failed to lock user' })
    }
  })

  router.put('/mapping/:wallet/unlock', requireAdmin, async (req, res) => {
    try {
      const wallet = String(req.params.wallet || '').trim()
      const identity = await getIdentityByWallet(wallet)
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found' })
      }

      const updated = await setIdentityLock(wallet, false)
      await appendAuditLog({
        action: 'unlock_user',
        role: 'admin',
        wallet: String(req.header('x-admin-wallet') || '').trim().toLowerCase() || 'unknown',
        status: 'success',
        details: `Unlocked ${updated.wallet}`,
        metadata: { targetWallet: updated.wallet },
      })

      return res.json(updated)
    } catch (error: any) {
      console.error(error)
      return res.status(500).json({ error: error?.message || 'Failed to unlock user' })
    }
  })

  router.get('/audit/logs', requireAdmin, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 200)
      const role = String(req.query.role || '').trim() || undefined
      const action = String(req.query.action || '').trim() || undefined
      const wallet = String(req.query.wallet || '').trim() || undefined

      const logs = await listAuditLogs({ limit, role, action, wallet })
      return res.json({ total: logs.length, logs })
    } catch (error: any) {
      console.error(error)
      return res.status(500).json({ error: error?.message || 'Failed to load audit logs' })
    }
  })

  router.post('/ca/register', requireAdmin, async (req, res) => {
    try {
      const address = String(req.body.address || '').trim()
      if (!address) {
        return res.status(400).json({ error: 'Address is required' })
      }

      const existing = await getIdentityByWallet(address)
      const ensured = await ensureDidForWallet(agent, address)
      const did = String(ensured.identifier?.did || '')
      const mapped = await upsertIdentity(address, did, 'doctor')
      const roleUpdated = await setRole(mapped.wallet, 'doctor')
      await setCaDid(did)
      if (!existing) {
        await fundWalletIfNeeded(mapped.wallet, 'did:ca-register')
      }

      res.json({
        caDid: did,
        mapping: roleUpdated,
        didCreated: ensured.created,
      })
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: error?.message || 'Failed to register CA DID' })
    }
  })

  router.get('/ca/current', async (_req, res) => {
    try {
      const caDid = await getCaDid()
      res.json({ caDid })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Failed to load CA DID' })
    }
  })

  router.post('/system-admin/register', requireAdmin, async (req, res) => {
    try {
      const address = String(req.body.address || '').trim()
      if (!address) {
        return res.status(400).json({ error: 'Address is required' })
      }

      const existing = await getIdentityByWallet(address)
      const ensured = await ensureDidForWallet(agent, address)
      const did = String(ensured.identifier?.did || '')
      await upsertIdentity(address, did, 'admin')
      await setRole(address, 'admin')
      const superadminWallet = await setSystemAdminWallet(address)
      if (!existing) {
        await fundWalletIfNeeded(address, 'did:system-admin-register')
      }
      res.json({ superadminWallet, did, didCreated: ensured.created })
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: error?.message || 'Failed to register system admin' })
    }
  })

  router.post('/doctor/register', async (req, res) => {
    try {
      const address = String(req.body.address || '').trim()
      const licenseUrl = String(req.body.licenseUrl || '').trim()

      if (!address || !licenseUrl) {
        return res.status(400).json({ error: 'Address and licenseUrl are required' })
      }

      const existing = await getIdentityByWallet(address)
      const ensured = await ensureDidForWallet(agent, address)
      const did = String(ensured.identifier?.did || '')
      await upsertIdentity(address, did, 'pending')
      const request = await createDoctorRequest(address, did, licenseUrl)
      if (!existing) {
        await fundWalletIfNeeded(address, 'did:doctor-register')
      }

      res.status(201).json({ request, didCreated: ensured.created })
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: error?.message || 'Doctor registration failed' })
    }
  })

  router.get('/doctor/requests', requireAdmin, async (_req, res) => {
    try {
      const requests = (await listDoctorRequests()) as any
      res.json({ total: requests?.length || 0, requests: requests || [] })
    } catch (error: any) {
      // Return 501 if doctor requests not implemented
      if (error?.message?.includes('migrated')) {
        return res.status(501).json({ error: error.message })
      }
      console.error(error)
      res.status(500).json({ error: 'Failed to load doctor requests' })
    }
  })

  router.post('/doctor/approve/:wallet', requireAdmin, async (req, res) => {
    try {
      const wallet = String(req.params.wallet || '').trim()
      const request = (await getDoctorRequest(wallet)) as any
      if (!request) {
        return res.status(404).json({ error: 'Doctor request not found' })
      }

      const caDid = await getCaDid()
      if (!caDid) {
        return res.status(500).json({ error: 'CA DID is not configured. Register one with /did/ca/register' })
      }

      await setRole(wallet, 'doctor')
      await setDoctorRequestStatus(wallet, 'approved')

      res.json({ success: true, wallet, did: 'did:pending', caDid })
    } catch (error: any) {
      // Return 501 if doctor requests not implemented
      if (error?.message?.includes('migrated')) {
        return res.status(501).json({ error: error.message })
      }
      console.error(error)
      res.status(500).json({ error: error?.message || 'Failed to approve doctor request' })
    }
  })

  router.post('/doctor/reject/:wallet', requireAdmin, async (req, res) => {
    try {
      const wallet = String(req.params.wallet || '').trim()
      await setDoctorRequestStatus(wallet, 'rejected')
      await setRole(wallet, 'pending')
      res.json({ success: true, wallet })
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: error?.message || 'Failed to reject doctor request' })
    }
  })

  router.get('/:id', async (req, res) => {
    try {
      const did = await agent.didManagerGet({
        did: req.params.id,
      })

      res.json(did)
    } catch (error) {
      console.error(error)
      res.status(404).json({ error: 'DID not found' })
    }
  })

  return router;
}