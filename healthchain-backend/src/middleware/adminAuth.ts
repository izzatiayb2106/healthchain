import { NextFunction, Request, Response } from 'express'
import { ethers } from 'ethers'
import { getIdentityByWallet, getSystemAdminWallet } from '../services/authServices'

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = String(req.header('x-admin-wallet') || '').trim().toLowerCase()
    const signature = String(req.header('x-admin-signature') || '').trim()
    const message = String(req.header('x-admin-message') || '').trim()

    if (!wallet || !signature || !message) {
      return res.status(401).json({ error: 'Missing admin authentication headers' })
    }

    const recovered = ethers.verifyMessage(message, signature).toLowerCase()
    if (recovered !== wallet) {
      return res.status(401).json({ error: 'Invalid admin signature' })
    }

    const identity = await getIdentityByWallet(wallet)
    if (!identity || identity.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' })
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
