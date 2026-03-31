import { promises as fs } from "fs";
import path from "path";

export type PatientProfile = {
  did: string;
  wallet: string;
  fullName: string;
  dateOfBirth: string;
  bloodType: string;
  phone: string;
  email: string;
  emergencyContact: string;
  encryptionPublicKey?: string;
  createdAt: string;
  updatedAt: string;
};

type PatientProfileStore = {
  profiles: PatientProfile[];
};

const dataDir = path.join(process.cwd(), "src", "data");
const storePath = path.join(dataDir, "patient-profiles.json");

function normalizeWallet(wallet: string) {
  return String(wallet || "").trim().toLowerCase();
}

function normalizeDid(did: string) {
  return String(did || "").trim();
}

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: PatientProfileStore = { profiles: [] };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<PatientProfileStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw) as PatientProfileStore;
  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
  };
}

async function writeStore(store: PatientProfileStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getPatientProfileByDid(did: string) {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;
  const store = await readStore();
  return store.profiles.find((entry) => entry.did === targetDid) || null;
}

export async function getPatientProfileByWallet(wallet: string) {
  const targetWallet = normalizeWallet(wallet);
  if (!targetWallet) return null;
  const store = await readStore();
  return store.profiles.find((entry) => normalizeWallet(entry.wallet) === targetWallet) || null;
}

export async function upsertPatientProfile(input: {
  did: string;
  wallet: string;
  fullName?: string;
  dateOfBirth?: string;
  bloodType?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  encryptionPublicKey?: string;
}) {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const existing = store.profiles.find((entry) => entry.did === did);

  if (existing) {
    existing.wallet = wallet;
    if (typeof input.fullName === "string") existing.fullName = input.fullName.trim();
    if (typeof input.dateOfBirth === "string") existing.dateOfBirth = input.dateOfBirth.trim();
    if (typeof input.bloodType === "string") existing.bloodType = input.bloodType.trim();
    if (typeof input.phone === "string") existing.phone = input.phone.trim();
    if (typeof input.email === "string") existing.email = input.email.trim();
    if (typeof input.emergencyContact === "string") existing.emergencyContact = input.emergencyContact.trim();
    if (typeof input.encryptionPublicKey === "string") existing.encryptionPublicKey = input.encryptionPublicKey.trim();
    existing.updatedAt = now;
    await writeStore(store);
    return existing;
  }

  const created: PatientProfile = {
    did,
    wallet,
    fullName: String(input.fullName || "").trim(),
    dateOfBirth: String(input.dateOfBirth || "").trim(),
    bloodType: String(input.bloodType || "").trim(),
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    emergencyContact: String(input.emergencyContact || "").trim(),
    encryptionPublicKey: String(input.encryptionPublicKey || "").trim(),
    createdAt: now,
    updatedAt: now,
  };

  store.profiles.unshift(created);
  await writeStore(store);
  return created;
}
