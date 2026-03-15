import { promises as fs } from 'fs'
import path from 'path'

type CredentialRecord = {
	subjectId: string
	credentialType: string
	issuedAt: string
	credential: any
}

type CredentialStore = {
	credentials: CredentialRecord[]
}

const dataDir = path.join(process.cwd(), 'src', 'data')
const storePath = path.join(dataDir, 'issued-credentials.json')

async function ensureStoreExists() {
	await fs.mkdir(dataDir, { recursive: true })
	try {
		await fs.access(storePath)
	} catch {
		const initial: CredentialStore = { credentials: [] }
		await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf8')
	}
}

async function readStore(): Promise<CredentialStore> {
	await ensureStoreExists()
	const raw = await fs.readFile(storePath, 'utf8')
	const parsed = JSON.parse(raw) as CredentialStore
	return {
		credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
	}
}

async function writeStore(store: CredentialStore) {
	await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function saveIssuedCredential(subjectId: string, credentialType: string, credential: any) {
	const store = await readStore()
	store.credentials.unshift({
		subjectId: String(subjectId || '').toLowerCase(),
		credentialType,
		issuedAt: new Date().toISOString(),
		credential,
	})
	await writeStore(store)
}

export async function listIssuedCredentialsBySubject(subjectId: string) {
	const target = String(subjectId || '').toLowerCase()
	const store = await readStore()
	return store.credentials.filter((entry) => entry.subjectId === target)
}

export async function hasCredentialType(subjectId: string, credentialType: string) {
	const target = String(subjectId || '').toLowerCase()
	const store = await readStore()
	return store.credentials.some(
		(entry) => entry.subjectId === target && entry.credentialType === credentialType,
	)
}
