import { getIdentityMappingRepo } from '../db';
import { IdentityMapping as DBIdentityMapping } from '../db/entities/IdentityMappingEntity';
import { getPatientProfileByDid } from './patientProfileService';
import { getDoctorProfileByDid } from './doctorProfileService';
import { getVerifierProfileByDid } from './doctorProfileService';

export type UserRole = 'pending' | 'patient' | 'doctor' | 'verifier' | 'admin'

type IdentityRecord = {
	id?: string
	wallet: string
	did: string
	role: UserRole
	locked: boolean
	lockReason?: string
	lockedAt?: string
	createdAt: string
	updatedAt: string
	displayName?: string
	pdpaConsentAccepted?: boolean
	pdpaConsentAt?: string
	pdpaConsentVersion?: string
}

function normalizeWallet(wallet: string) {
	return wallet.trim().toLowerCase()
}

// Convert database entity to API format
function dbIdentityToAPI(dbIdentity: DBIdentityMapping): IdentityRecord {
	return {
		id: dbIdentity.id,
		wallet: dbIdentity.wallet,
		did: dbIdentity.did,
		role: dbIdentity.role,
		locked: dbIdentity.locked,
		lockReason: dbIdentity.lockReason || undefined,
		lockedAt: dbIdentity.lockedAt ? dbIdentity.lockedAt.toISOString() : undefined,
		createdAt: dbIdentity.createdAt.toISOString(),
		updatedAt: dbIdentity.updatedAt.toISOString(),
		pdpaConsentAccepted: Boolean(dbIdentity.pdpaConsentAccepted),
		pdpaConsentAt: dbIdentity.pdpaConsentAt ? dbIdentity.pdpaConsentAt.toISOString() : undefined,
		pdpaConsentVersion: dbIdentity.pdpaConsentVersion || undefined,
	}
}

export async function getIdentityByWallet(wallet: string): Promise<IdentityRecord | null> {
	const normalized = normalizeWallet(wallet)
	const repo = getIdentityMappingRepo()
	const identity = await repo.findOne({ where: { wallet: normalized } })
	return identity ? dbIdentityToAPI(identity) : null
}

export async function getIdentityByDid(did: string): Promise<IdentityRecord | null> {
	const target = String(did || '').trim()
	const repo = getIdentityMappingRepo()
	const identity = await repo.findOne({ where: { did: target } })
	return identity ? dbIdentityToAPI(identity) : null
}

export async function upsertIdentity(wallet: string, did: string, role: UserRole = 'pending'): Promise<IdentityRecord> {
	const normalizedWallet = normalizeWallet(wallet)
	const repo = getIdentityMappingRepo()

	let existing = await repo.findOne({ where: { wallet: normalizedWallet } })
	if (existing) {
		existing.did = did
		existing.updatedAt = new Date()
		const saved = await repo.save(existing)
		return dbIdentityToAPI(saved)
	}

	const created = repo.create({
		wallet: normalizedWallet,
		did,
		role,
		locked: false,
	})
	const saved = await repo.save(created)
	return dbIdentityToAPI(saved)
}

export async function setRole(wallet: string, role: UserRole): Promise<IdentityRecord> {
	const normalizedWallet = normalizeWallet(wallet)
	const repo = getIdentityMappingRepo()
	const existing = await repo.findOne({ where: { wallet: normalizedWallet } })
	if (!existing) {
		throw new Error('Identity not found')
	}
	existing.role = role
	existing.updatedAt = new Date()
	const saved = await repo.save(existing)
	return dbIdentityToAPI(saved)
}

export async function listIdentities(): Promise<IdentityRecord[]> {
	const repo = getIdentityMappingRepo()
	const identities = await repo.find()

	// Enrich each identity with a displayName when available
	const mapped = await Promise.all(
		identities.map(async (db) => {
			const base = dbIdentityToAPI(db);
			let name: string | undefined = undefined;
			try {
				// Try patient profile first
				const p = await getPatientProfileByDid(base.did);
				if (p?.fullName) {
					name = p.fullName;
				} else {
					// Try doctor profile
					const d = await getDoctorProfileByDid(base.did);
					if (d?.displayName) {
						name = d.displayName;
					} else {
						// Try verifier profile (fullName)
						try {
							const v = await getVerifierProfileByDid(base.did);
							if (v?.fullName) name = v.fullName;
						} catch (_) {
							// ignore
						}
					}
				}
			} catch (err) {
				// ignore profile fetch errors
			}
			return { ...base, displayName: name };
		})
	);

	return mapped
}

export async function setIdentityLock(wallet: string, locked: boolean, reason?: string): Promise<IdentityRecord> {
	const normalizedWallet = normalizeWallet(wallet)
	const repo = getIdentityMappingRepo()
	const existing = await repo.findOne({ where: { wallet: normalizedWallet } })
	if (!existing) {
		throw new Error('Identity not found')
	}

	existing.locked = Boolean(locked)
	existing.lockReason = locked ? String(reason || '').trim() || 'Locked by admin' : undefined
	existing.lockedAt = locked ? new Date() : undefined
	existing.updatedAt = new Date()

	const saved = await repo.save(existing)
	return dbIdentityToAPI(saved)
}

export async function setPdpaConsent(wallet: string, version?: string): Promise<IdentityRecord> {
	const normalizedWallet = normalizeWallet(wallet)
	const repo = getIdentityMappingRepo()
	const existing = await repo.findOne({ where: { wallet: normalizedWallet } })
	if (!existing) {
		throw new Error('Identity not found')
	}

	existing.pdpaConsentAccepted = true
	existing.pdpaConsentAt = new Date()
	existing.pdpaConsentVersion = version ? String(version).trim() : undefined
	existing.updatedAt = new Date()

	const saved = await repo.save(existing)
	return dbIdentityToAPI(saved)
}

export async function isIdentityLocked(wallet: string): Promise<boolean> {
	const identity = await getIdentityByWallet(wallet)
	return Boolean(identity?.locked)
}

// Note: caDid and systemAdminWallet are stored in environment variables or could be stored separately
// Keeping these methods for API compatibility but they use env vars
export async function getCaDid(): Promise<string | null> {
	return process.env.CA_DID || null
}

export async function setCaDid(caDid: string): Promise<string> {
	// In production, this should be stored in a config table or environment
	// For now, just return the value
	return caDid
}

export async function getSystemAdminWallet(): Promise<string | null> {
	return process.env.SUPERADMIN_WALLET ? normalizeWallet(process.env.SUPERADMIN_WALLET) : null
}

export async function setSystemAdminWallet(wallet: string): Promise<string> {
	// In production, this should be stored in a config table
	// For now, just return the normalized value
	return normalizeWallet(wallet)
}

// Note: Doctor requests functionality should be migrated to a separate DoctorRequest table in the database if needed
// For now, keeping placeholder functions for API compatibility
export async function createDoctorRequest(wallet: string, did: string, licenseUrl: string) {
	throw new Error('Doctor requests need to be migrated to database');
}

export async function listDoctorRequests() {
	throw new Error('Doctor requests need to be migrated to database');
}

export async function getDoctorRequest(wallet: string) {
	throw new Error('Doctor requests need to be migrated to database');
}

export async function setDoctorRequestStatus(wallet: string, status: 'pending' | 'approved' | 'rejected') {
	throw new Error('Doctor requests need to be migrated to database');
}
