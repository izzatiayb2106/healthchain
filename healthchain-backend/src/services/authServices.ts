import { promises as fs } from 'fs'
import path from 'path'

export type UserRole = 'pending' | 'patient' | 'doctor' | 'verifier' | 'admin'

type IdentityRecord = {
	wallet: string
	did: string
	role: UserRole
	createdAt: string
	updatedAt: string
}

type IdentityStore = {
	caDid: string | null
	systemAdminWallet: string | null
	doctorRequests: DoctorRequest[]
	identities: IdentityRecord[]
}

type DoctorRequestStatus = 'pending' | 'approved' | 'rejected'

type DoctorRequest = {
	wallet: string
	did: string
	licenseUrl: string
	status: DoctorRequestStatus
	createdAt: string
	updatedAt: string
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'identity-mappings.json')

function normalizeWallet(wallet: string) {
	return wallet.trim().toLowerCase()
}

async function ensureStoreExists() {
	await fs.mkdir(dataDir, { recursive: true })
	try {
		await fs.access(storePath)
	} catch {
		const initial: IdentityStore = {
			caDid: process.env.CA_DID || null,
			systemAdminWallet: process.env.SUPERADMIN_WALLET ? normalizeWallet(process.env.SUPERADMIN_WALLET) : null,
			doctorRequests: [],
			identities: [],
		}
		await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
	}
}

async function readStore(): Promise<IdentityStore> {
	await ensureStoreExists()
	const raw = await fs.readFile(storePath, 'utf8')
	const parsed = JSON.parse(raw) as IdentityStore
	return {
		caDid: parsed.caDid || process.env.CA_DID || null,
		systemAdminWallet:
			parsed.systemAdminWallet ||
			(process.env.SUPERADMIN_WALLET ? normalizeWallet(process.env.SUPERADMIN_WALLET) : null),
		doctorRequests: Array.isArray(parsed.doctorRequests) ? parsed.doctorRequests : [],
		identities: Array.isArray(parsed.identities) ? parsed.identities : [],
	}
}

async function writeStore(store: IdentityStore) {
	await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function getIdentityByWallet(wallet: string) {
	const normalized = normalizeWallet(wallet)
	const store = await readStore()
	return store.identities.find((entry) => entry.wallet === normalized) || null
}

export async function getIdentityByDid(did: string) {
	const target = String(did || '').trim()
	const store = await readStore()
	return store.identities.find((entry) => entry.did === target) || null
}

export async function upsertIdentity(wallet: string, did: string, role: UserRole = 'pending') {
	const normalizedWallet = normalizeWallet(wallet)
	const now = new Date().toISOString()
	const store = await readStore()

	const existing = store.identities.find((entry) => entry.wallet === normalizedWallet)
	if (existing) {
		existing.did = did
		existing.updatedAt = now
		await writeStore(store)
		return existing
	}

	const created: IdentityRecord = {
		wallet: normalizedWallet,
		did,
		role,
		createdAt: now,
		updatedAt: now,
	}
	store.identities.push(created)
	await writeStore(store)
	return created
}

export async function setRole(wallet: string, role: UserRole) {
	const normalizedWallet = normalizeWallet(wallet)
	const store = await readStore()
	const existing = store.identities.find((entry) => entry.wallet === normalizedWallet)
	if (!existing) {
		throw new Error('Identity not found')
	}
	existing.role = role
	existing.updatedAt = new Date().toISOString()
	await writeStore(store)
	return existing
}

export async function listIdentities() {
	const store = await readStore()
	return store.identities
}

export async function getCaDid() {
	const store = await readStore()
	return store.caDid
}

export async function setCaDid(caDid: string) {
	const store = await readStore()
	store.caDid = caDid
	await writeStore(store)
	return store.caDid
}

export async function getSystemAdminWallet() {
	const store = await readStore()
	return store.systemAdminWallet
}

export async function setSystemAdminWallet(wallet: string) {
	const store = await readStore()
	store.systemAdminWallet = normalizeWallet(wallet)
	await writeStore(store)
	return store.systemAdminWallet
}

export async function createDoctorRequest(wallet: string, did: string, licenseUrl: string) {
	const store = await readStore()
	const normalizedWallet = normalizeWallet(wallet)
	const now = new Date().toISOString()

	const existing = store.doctorRequests.find((req) => req.wallet === normalizedWallet)
	if (existing) {
		existing.did = did
		existing.licenseUrl = licenseUrl
		existing.status = 'pending'
		existing.updatedAt = now
		await writeStore(store)
		return existing
	}

	const created: DoctorRequest = {
		wallet: normalizedWallet,
		did,
		licenseUrl,
		status: 'pending',
		createdAt: now,
		updatedAt: now,
	}
	store.doctorRequests.unshift(created)
	await writeStore(store)
	return created
}

export async function listDoctorRequests() {
	const store = await readStore()
	return store.doctorRequests
}

export async function getDoctorRequest(wallet: string) {
	const store = await readStore()
	const normalizedWallet = normalizeWallet(wallet)
	return store.doctorRequests.find((req) => req.wallet === normalizedWallet) || null
}

export async function setDoctorRequestStatus(wallet: string, status: DoctorRequestStatus) {
	const store = await readStore()
	const normalizedWallet = normalizeWallet(wallet)
	const existing = store.doctorRequests.find((req) => req.wallet === normalizedWallet)
	if (!existing) {
		throw new Error('Doctor request not found')
	}
	existing.status = status
	existing.updatedAt = new Date().toISOString()
	await writeStore(store)
	return existing
}
