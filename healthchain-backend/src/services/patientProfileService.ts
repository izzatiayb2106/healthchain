import { getPatientProfileRepo } from '../db';
import { PatientProfile as DBPatientProfile } from '../db/entities/PatientProfileEntity';

export type PatientProfile = {
  id?: string;
  did: string;
  wallet: string;
  fullName: string;
  dateOfBirth: string;
  bloodType: string;
  phone: string;
  email: string;
  emergencyContact?: string;
  encryptionPublicKey?: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeWallet(wallet: string) {
  return String(wallet || "").trim().toLowerCase();
}

function normalizeDid(did: string) {
  return String(did || "").trim();
}

// Convert database entity to API format
function dbPatientProfileToAPI(dbProfile: DBPatientProfile): PatientProfile {
  return {
    id: dbProfile.id,
    did: dbProfile.did,
    wallet: dbProfile.wallet,
    fullName: dbProfile.fullName,
    dateOfBirth: dbProfile.dateOfBirth,
    bloodType: dbProfile.bloodType,
    phone: dbProfile.phone,
    email: dbProfile.email,
    emergencyContact: dbProfile.emergencyContact,
    encryptionPublicKey: dbProfile.encryptionPublicKey,
    createdAt: dbProfile.createdAt.toISOString(),
    updatedAt: dbProfile.updatedAt.toISOString(),
  };
}

export async function getPatientProfileByDid(did: string): Promise<PatientProfile | null> {
  const targetDid = normalizeDid(did);
  if (!targetDid) return null;

  const repo = getPatientProfileRepo();
  const profile = await repo.findOne({ where: { did: targetDid } });
  
  return profile ? dbPatientProfileToAPI(profile) : null;
}

export async function getPatientProfileByWallet(wallet: string): Promise<PatientProfile | null> {
  const targetWallet = normalizeWallet(wallet);
  if (!targetWallet) return null;

  const repo = getPatientProfileRepo();
  const profile = await repo.findOne({ where: { wallet: targetWallet } });
  
  return profile ? dbPatientProfileToAPI(profile) : null;
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
}): Promise<PatientProfile> {
  const did = normalizeDid(input.did);
  const wallet = normalizeWallet(input.wallet);
  if (!did || !wallet) {
    throw new Error("did and wallet are required");
  }

  const repo = getPatientProfileRepo();
  let profile = await repo.findOne({ where: { did } });

  if (profile) {
    profile.wallet = wallet;
    if (typeof input.fullName === "string") profile.fullName = input.fullName.trim();
    if (typeof input.dateOfBirth === "string") profile.dateOfBirth = input.dateOfBirth.trim();
    if (typeof input.bloodType === "string") profile.bloodType = input.bloodType.trim();
    if (typeof input.phone === "string") profile.phone = input.phone.trim();
    if (typeof input.email === "string") profile.email = input.email.trim();
    if (typeof input.emergencyContact === "string") profile.emergencyContact = input.emergencyContact.trim();
    if (typeof input.encryptionPublicKey === "string") profile.encryptionPublicKey = input.encryptionPublicKey.trim();
    profile.updatedAt = new Date();
  } else {
    profile = repo.create({
      did,
      wallet,
      fullName: String(input.fullName || "").trim(),
      dateOfBirth: String(input.dateOfBirth || "").trim(),
      bloodType: String(input.bloodType || "").trim(),
      phone: String(input.phone || "").trim(),
      email: String(input.email || "").trim(),
      emergencyContact: String(input.emergencyContact || "").trim(),
      encryptionPublicKey: String(input.encryptionPublicKey || "").trim(),
    });
  }

  const saved = await repo.save(profile);
  return dbPatientProfileToAPI(saved);
}
