import { promises as fs } from "fs";
import path from "path";

export type DoctorProfile = {
  did: string;
  wallet: string;
  displayName: string;
  specialty: string;
  hospitalOrClinic: string;
  professionalId: string;
  licenseNumber?: string;
  avatarUrl: string;
  legalName: string;
  legalNameVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type DoctorProfileStore = {
  profiles: DoctorProfile[];
};

export type VerifierProfile = {
  did: string;
  wallet: string;
  fullName: string;
  professionalId: string;
  specialty: string;
  licenseType: string;
  legalName: string;
  legalNameVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

type VerifierProfileStore = {
  profiles: VerifierProfile[];
};

const dataDir = path.join(process.cwd(), "src", "data");
const storePath = path.join(dataDir, "doctor-profiles.json");
const verifierStorePath = path.join(dataDir, "verifier-profiles.json");

function normalizeWallet(wallet: string) {
  return String(wallet || "").trim().toLowerCase();
}

function normalizeDid(did: string) {
  return String(did || "").trim();
}

function normalizeProfessionalId(value: string) {
  return String(value || "").trim();
}

async function ensureStoreExists() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: DoctorProfileStore = { profiles: [] };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }

  try {
    await fs.access(verifierStorePath);
  } catch {
    const initial: VerifierProfileStore = { profiles: [] };
    await fs.writeFile(verifierStorePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<DoctorProfileStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw) as { profiles?: any[] };
  return {
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => ({
          ...profile,
          professionalId: normalizeProfessionalId(profile?.professionalId || profile?.licenseNumber || ""),
        }))
      : [],
  };
}

async function writeStore(store: DoctorProfileStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function readVerifierStore(): Promise<VerifierProfileStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(verifierStorePath, "utf8");
  const parsed = JSON.parse(raw) as { profiles?: any[] };
  return {
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => ({
          ...profile,
          professionalId: normalizeProfessionalId(profile?.professionalId || ""),
        }))
      : [],
  };
}

async function writeVerifierStore(store: VerifierProfileStore) {
  await fs.writeFile(verifierStorePath, JSON.stringify(store, null, 2), "utf8");
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
  professionalId?: string;
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
    if (typeof input.professionalId === "string") {
      existing.professionalId = normalizeProfessionalId(input.professionalId);
    } else if (typeof input.licenseNumber === "string") {
      existing.professionalId = normalizeProfessionalId(input.licenseNumber);
    }
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
    professionalId: normalizeProfessionalId(input.professionalId || input.licenseNumber || ""),
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

export async function getVerifierProfileByDid(did: string) {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;
  const store = await readVerifierStore();
  return store.profiles.find((profile) => profile.did === targetDid) || null;
}

export async function upsertVerifierProfile(input: {
  did: string;
  wallet: string;
  fullName?: string;
  professionalId?: string;
  specialty?: string;
  licenseType?: string;
  legalName?: string;
  legalNameVerified?: boolean;
}) {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const now = new Date().toISOString();
  const store = await readVerifierStore();
  const existing = store.profiles.find((profile) => profile.did === did);

  if (existing) {
    existing.wallet = wallet;
    if (typeof input.fullName === "string") existing.fullName = input.fullName.trim();
    if (typeof input.professionalId === "string") existing.professionalId = normalizeProfessionalId(input.professionalId);
    if (typeof input.specialty === "string") existing.specialty = input.specialty.trim();
    if (typeof input.licenseType === "string") existing.licenseType = input.licenseType.trim();
    if (typeof input.legalName === "string") existing.legalName = input.legalName.trim();
    if (typeof input.legalNameVerified === "boolean") existing.legalNameVerified = input.legalNameVerified;
    existing.updatedAt = now;
    await writeVerifierStore(store);
    return existing;
  }

  const created: VerifierProfile = {
    did,
    wallet,
    fullName: String(input.fullName || "").trim(),
    professionalId: normalizeProfessionalId(input.professionalId || ""),
    specialty: String(input.specialty || "").trim(),
    licenseType: String(input.licenseType || "").trim(),
    legalName: String(input.legalName || "").trim(),
    legalNameVerified: Boolean(input.legalNameVerified),
    createdAt: now,
    updatedAt: now,
  };

  store.profiles.unshift(created);
  await writeVerifierStore(store);
  return created;
}
