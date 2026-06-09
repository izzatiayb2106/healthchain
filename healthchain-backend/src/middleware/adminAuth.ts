import { NextFunction, Request, Response } from 'express'
import { getIdentityByWallet, getSystemAdminWallet } from '../services/authServices'
import { extractTokenFromHeader, verifyToken } from '../services/jwtService'

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = String(req.header('Authorization') || '').trim()
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authentication token' })
    }

    const token = extractTokenFromHeader(authHeader)
    if (!token) {
      return res.status(401).json({ error: 'Invalid Authorization header format. Use: Bearer <token>' })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    req.user = payload

    const wallet = String(payload.wallet || '').trim().toLowerCase()
    if (!wallet) {
      return res.status(401).json({ error: 'Invalid token payload' })
    }

    const identity = await getIdentityByWallet(wallet)
    if (!identity || identity.role !== 'admin' || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' })
    }

    if (identity.locked) {
      return res.status(423).json({ error: 'This admin account is locked' })
    }

    const superadminWallet = await getSystemAdminWallet()
    if (superadminWallet && wallet !== superadminWallet) {
      return res.status(403).json({ error: 'Only superadmin can perform this action' })
    }

    next()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Admin authentication failed' })
  }
}
