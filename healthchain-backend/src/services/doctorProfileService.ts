import { getDoctorProfileRepo, getVerifierProfileRepo } from '../db';
import { DoctorProfile as DBDoctorProfile } from '../db/entities/DoctorProfileEntity';
import { VerifierProfile as DBVerifierProfile } from '../db/entities/VerifierProfileEntity';

export type DoctorProfile = {
  id?: string;
  did: string;
  wallet: string;
  displayName: string;
  specialty: string;
  hospitalOrClinic: string;
  professionalId: string;
  licenseNumber?: string;
  avatarUrl?: string;
  legalName: string;
  legalNameVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VerifierProfile = {
  id?: string;
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

function normalizeWallet(wallet: string) {
  return String(wallet || "").trim().toLowerCase();
}

function normalizeDid(did: string) {
  return String(did || "").trim();
}

function normalizeProfessionalId(value: string) {
  return String(value || "").trim();
}

// Convert database entity to API format
function dbDoctorProfileToAPI(dbProfile: DBDoctorProfile): DoctorProfile {
  return {
    id: dbProfile.id,
    did: dbProfile.did,
    wallet: dbProfile.wallet,
    displayName: dbProfile.displayName,
    specialty: dbProfile.specialty,
    hospitalOrClinic: dbProfile.hospitalOrClinic,
    professionalId: dbProfile.professionalId,
    licenseNumber: dbProfile.licenseNumber,
    avatarUrl: dbProfile.avatarUrl,
    legalName: dbProfile.legalName,
    legalNameVerified: dbProfile.legalNameVerified,
    createdAt: dbProfile.createdAt.toISOString(),
    updatedAt: dbProfile.updatedAt.toISOString(),
  };
}

// Convert database entity to API format
function dbVerifierProfileToAPI(dbProfile: DBVerifierProfile): VerifierProfile {
  return {
    id: dbProfile.id,
    did: dbProfile.did,
    wallet: dbProfile.wallet,
    fullName: dbProfile.fullName,
    professionalId: dbProfile.professionalId,
    specialty: dbProfile.specialty,
    licenseType: dbProfile.licenseType,
    legalName: dbProfile.legalName,
    legalNameVerified: dbProfile.legalNameVerified,
    createdAt: dbProfile.createdAt.toISOString(),
    updatedAt: dbProfile.updatedAt.toISOString(),
  };
}

export async function getDoctorProfileByDid(did: string): Promise<DoctorProfile | null> {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;

  const repo = getDoctorProfileRepo();
  const profile = await repo.findOne({ where: { did: targetDid } });
  
  return profile ? dbDoctorProfileToAPI(profile) : null;
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
}): Promise<DoctorProfile> {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const repo = getDoctorProfileRepo();
  let profile = await repo.findOne({ where: { did } });

  if (profile) {
    profile.wallet = wallet;
    if (typeof input.displayName === "string") profile.displayName = input.displayName.trim();
    if (typeof input.specialty === "string") profile.specialty = input.specialty.trim();
    if (typeof input.hospitalOrClinic === "string") profile.hospitalOrClinic = input.hospitalOrClinic.trim();
    if (typeof input.professionalId === "string") {
      profile.professionalId = normalizeProfessionalId(input.professionalId);
    } else if (typeof input.licenseNumber === "string") {
      profile.professionalId = normalizeProfessionalId(input.licenseNumber);
    }
    if (typeof input.avatarUrl === "string") profile.avatarUrl = input.avatarUrl.trim();
    if (typeof input.legalName === "string") profile.legalName = input.legalName.trim();
    if (typeof input.legalNameVerified === "boolean") profile.legalNameVerified = input.legalNameVerified;
    profile.updatedAt = new Date();
  } else {
    profile = repo.create({
      did,
      wallet,
      displayName: String(input.displayName || "").trim(),
      specialty: String(input.specialty || "").trim(),
      hospitalOrClinic: String(input.hospitalOrClinic || "").trim(),
      professionalId: normalizeProfessionalId(input.professionalId || input.licenseNumber || ""),
      licenseNumber: String(input.licenseNumber || "").trim() || undefined,
      avatarUrl: String(input.avatarUrl || "").trim() || "",
      legalName: String(input.legalName || "").trim(),
      legalNameVerified: Boolean(input.legalNameVerified),
    });
  }

  const saved = await repo.save(profile);
  return dbDoctorProfileToAPI(saved);
}

export async function getVerifierProfileByDid(did: string): Promise<VerifierProfile | null> {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;

  const repo = getVerifierProfileRepo();
  const profile = await repo.findOne({ where: { did: targetDid } });
  
  return profile ? dbVerifierProfileToAPI(profile) : null;
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
}): Promise<VerifierProfile> {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const repo = getVerifierProfileRepo();
  let profile = await repo.findOne({ where: { did } });

  if (profile) {
    profile.wallet = wallet;
    if (typeof input.fullName === "string") profile.fullName = input.fullName.trim();
    if (typeof input.professionalId === "string") profile.professionalId = normalizeProfessionalId(input.professionalId);
    if (typeof input.specialty === "string") profile.specialty = input.specialty.trim();
    if (typeof input.licenseType === "string") profile.licenseType = input.licenseType.trim();
    if (typeof input.legalName === "string") profile.legalName = input.legalName.trim();
    if (typeof input.legalNameVerified === "boolean") profile.legalNameVerified = input.legalNameVerified;
    profile.updatedAt = new Date();
  } else {
    profile = repo.create({
      did,
      wallet,
      fullName: String(input.fullName || "").trim(),
      professionalId: normalizeProfessionalId(input.professionalId || ""),
      specialty: String(input.specialty || "").trim(),
      licenseType: String(input.licenseType || "").trim(),
      legalName: String(input.legalName || "").trim(),
      legalNameVerified: Boolean(input.legalNameVerified),
    });
  }

  const saved = await repo.save(profile);
  return dbVerifierProfileToAPI(saved);
}
