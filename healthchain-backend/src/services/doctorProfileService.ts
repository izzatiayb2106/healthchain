import { promises as fs } from "fs";
import path from "path";

export type DoctorProfile = {
  did: string;
  wallet: string;
  displayName: string;
  specialty: string;
  hospitalOrClinic: string;
  licenseNumber: string;
  avatarUrl: string;
  legalName: string;
  legalNameVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type DoctorProfileStore = {
  profiles: DoctorProfile[];
};

const dataDir = path.join(process.cwd(), "src", "data");
const storePath = path.join(dataDir, "doctor-profiles.json");

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
    const initial: DoctorProfileStore = { profiles: [] };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<DoctorProfileStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw) as DoctorProfileStore;
  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
  };
}

async function writeStore(store: DoctorProfileStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getDoctorProfileByDid(did: string) {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;
  const store = await readStore();
  return store.profiles.find((profile) => profile.did === targetDid) || null;
}

export async function upsertDoctorProfile(input: {
  did: string;
  wallet: string;
  displayName?: string;
  specialty?: string;
  hospitalOrClinic?: string;
  licenseNumber?: string;
  avatarUrl?: string;
  legalName?: string;
  legalNameVerified?: boolean;
}) {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const now = new Date().toISOString();
  const store = await readStore();
  const existing = store.profiles.find((profile) => profile.did === did);

  if (existing) {
    existing.wallet = wallet;
    if (typeof input.displayName === "string") existing.displayName = input.displayName.trim();
    if (typeof input.specialty === "string") existing.specialty = input.specialty.trim();
    if (typeof input.hospitalOrClinic === "string") existing.hospitalOrClinic = input.hospitalOrClinic.trim();
    if (typeof input.licenseNumber === "string") existing.licenseNumber = input.licenseNumber.trim();
    if (typeof input.avatarUrl === "string") existing.avatarUrl = input.avatarUrl.trim();
    if (typeof input.legalName === "string") existing.legalName = input.legalName.trim();
    if (typeof input.legalNameVerified === "boolean") existing.legalNameVerified = input.legalNameVerified;
    existing.updatedAt = now;
    await writeStore(store);
    return existing;
  }

  const created: DoctorProfile = {
    did,
    wallet,
    displayName: String(input.displayName || "").trim(),
    specialty: String(input.specialty || "").trim(),
    hospitalOrClinic: String(input.hospitalOrClinic || "").trim(),
    licenseNumber: String(input.licenseNumber || "").trim(),
    avatarUrl: String(input.avatarUrl || "").trim(),
    legalName: String(input.legalName || "").trim(),
    legalNameVerified: Boolean(input.legalNameVerified),
    createdAt: now,
    updatedAt: now,
  };

  store.profiles.unshift(created);
  await writeStore(store);
  return created;
}
