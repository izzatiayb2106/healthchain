import 'reflect-metadata';
import { DataSource, Repository } from 'typeorm';
import { Entities } from '@veramo/data-store';
import * as fs from 'fs';
import * as path from 'path';
import {
  DoctorPatient,
  DoctorProfile,
  PatientProfile,
  VerifierProfile,
  IdentityMapping,
  MinistryRegistry,
  HybridCredential,
  AuditLog,
} from './entities';

let appDataSource: DataSource;
let migrationCompleted = false;

const ENTITIES = [...Entities, DoctorPatient, DoctorProfile, PatientProfile, VerifierProfile, IdentityMapping, MinistryRegistry, HybridCredential, AuditLog];

async function purgeEphemeralHybridCredentialsIfNeeded() {
  const envPurgeFlag = process.env.PURGE_EPHEMERAL_CREDS_ON_START?.toLowerCase()?.trim() === 'true'
  
  let isLocalChain = false
  if (!envPurgeFlag) {
    // Auto-detect Hardhat by RPC chainId
    try {
      const rpcUrl = process.env.RPC_URL
      if (rpcUrl) {
        const { ethers } = await import('ethers')
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const net = await provider.getNetwork()
        isLocalChain = net.chainId === 31337n // Hardhat
      }
    } catch (err) {
      console.warn('[DB] Could not determine chainId; skipping auto-purge', err)
    }
  }

  if (envPurgeFlag || isLocalChain) {
    try {
      const hybridRepo = getHybridCredentialRepo()
      await hybridRepo.clear()
      console.log('🧹 Purged hybrid_credential table (ephemeral Hardhat session)')
    } catch (err) {
      console.error('[DB] Error purging hybrid credentials:', err)
    }
  }
}

async function purgeUnfinalizedHybridCredentialsIfNeeded() {
  const hybridRepo = getHybridCredentialRepo()
  const result = await hybridRepo
    .createQueryBuilder()
    .delete()
    .where('finalizedAt IS NULL')
    .execute()

  if (result.affected) {
    console.log(`🧹 Removed ${result.affected} unfinalized hybrid credential draft(s) from SQLite`)
  }
}

export async function initializeDatabase() {
  if (appDataSource && appDataSource.isInitialized) {
    return appDataSource;
  }

  appDataSource = new DataSource({
    type: 'sqlite',
    database: 'database.sqlite',
    synchronize: true,
    logging: false,
    entities: ENTITIES,
  });

  await appDataSource.initialize();

  // Purge ephemeral hybrid credentials at startup for local/Hardhat sessions
  await purgeEphemeralHybridCredentialsIfNeeded();
  await purgeUnfinalizedHybridCredentialsIfNeeded();
  console.log('✅ Database initialized with all entities');

  // Run initial data migration from JSON files if not already done
  if (!migrationCompleted) {
    await migrateDataFromJson();
    migrationCompleted = true;
  }

  return appDataSource;
}

export function getDataSource(): DataSource {
  if (!appDataSource || !appDataSource.isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return appDataSource;
}

// Repository getters
export function getDoctorPatientRepo(): Repository<DoctorPatient> {
  return getDataSource().getRepository(DoctorPatient);
}

export function getDoctorProfileRepo(): Repository<DoctorProfile> {
  return getDataSource().getRepository(DoctorProfile);
}

export function getPatientProfileRepo(): Repository<PatientProfile> {
  return getDataSource().getRepository(PatientProfile);
}

export function getVerifierProfileRepo(): Repository<VerifierProfile> {
  return getDataSource().getRepository(VerifierProfile);
}

export function getIdentityMappingRepo(): Repository<IdentityMapping> {
  return getDataSource().getRepository(IdentityMapping);
}

export function getMinistryRegistryRepo(): Repository<MinistryRegistry> {
  return getDataSource().getRepository(MinistryRegistry);
}

export function getHybridCredentialRepo(): Repository<HybridCredential> {
  return getDataSource().getRepository(HybridCredential);
}

export function getAuditLogRepo(): Repository<AuditLog> {
  return getDataSource().getRepository(AuditLog);
}

// Data migration from JSON to database
async function migrateDataFromJson() {
  try {
    const dataPath = path.join(__dirname, '../data');

    // Check if data has already been migrated (look for at least one identity)
    const identityRepo = getDoctorPatientRepo(); // Use any repo to check if data exists
    const existingCount = await getIdentityMappingRepo().count();
    
    if (existingCount > 0) {
      console.log('📊 Data already migrated to database, skipping JSON import');
      return;
    }

    console.log('🔄 Migrating data from JSON files to database...');

    // 1. Migrate identity mappings
    const identityMappingsFile = path.join(dataPath, 'identity-mappings.json');
    if (fs.existsSync(identityMappingsFile)) {
      const data = JSON.parse(fs.readFileSync(identityMappingsFile, 'utf-8'));
      const identityRepo = getIdentityMappingRepo();
      
      for (const identity of data.identities) {
        const existing = await identityRepo.findOne({ where: { wallet: identity.wallet.toLowerCase() } });
        if (!existing) {
          await identityRepo.save({
            wallet: identity.wallet.toLowerCase(),
            did: identity.did,
            role: identity.role,
            locked: identity.locked || false,
            lockReason: identity.lockReason || null,
            lockedAt: identity.lockedAt ? new Date(identity.lockedAt) : null,
            createdAt: new Date(identity.createdAt),
            updatedAt: new Date(identity.updatedAt),
          });
        }
      }
      console.log(`✅ Migrated ${data.identities.length} identity mappings`);
    }

    // 2. Migrate doctor profiles
    const doctorProfilesFile = path.join(dataPath, 'doctor-profiles.json');
    if (fs.existsSync(doctorProfilesFile)) {
      const data = JSON.parse(fs.readFileSync(doctorProfilesFile, 'utf-8'));
      const doctorRepo = getDoctorProfileRepo();
      
      for (const profile of data.profiles) {
        const existing = await doctorRepo.findOne({ where: { did: profile.did } });
        if (!existing) {
          await doctorRepo.save({
            did: profile.did,
            wallet: profile.wallet.toLowerCase(),
            displayName: profile.displayName,
            specialty: profile.specialty,
            hospitalOrClinic: profile.hospitalOrClinic,
            professionalId: profile.professionalId,
            licenseNumber: profile.licenseNumber || null,
            avatarUrl: profile.avatarUrl || '',
            legalName: profile.legalName,
            legalNameVerified: profile.legalNameVerified || false,
            createdAt: new Date(profile.createdAt),
            updatedAt: new Date(profile.updatedAt),
          });
        }
      }
      console.log(`✅ Migrated ${data.profiles.length} doctor profiles`);
    }

    // 3. Migrate patient profiles
    const patientProfilesFile = path.join(dataPath, 'patient-profiles.json');
    if (fs.existsSync(patientProfilesFile)) {
      const data = JSON.parse(fs.readFileSync(patientProfilesFile, 'utf-8'));
      const patientRepo = getPatientProfileRepo();
      
      for (const profile of data.profiles) {
        const existing = await patientRepo.findOne({ where: { did: profile.did } });
        if (!existing) {
          await patientRepo.save({
            did: profile.did,
            wallet: profile.wallet.toLowerCase(),
            fullName: profile.fullName,
            dateOfBirth: profile.dateOfBirth,
            bloodType: profile.bloodType,
            phone: profile.phone,
            email: profile.email,
            emergencyContact: profile.emergencyContact || '',
            encryptionPublicKey: profile.encryptionPublicKey || null,
            createdAt: new Date(profile.createdAt),
            updatedAt: new Date(profile.updatedAt),
          });
        }
      }
      console.log(`✅ Migrated ${data.profiles.length} patient profiles`);
    }

    // 4. Migrate verifier profiles
    const verifierProfilesFile = path.join(dataPath, 'verifier-profiles.json');
    if (fs.existsSync(verifierProfilesFile)) {
      const data = JSON.parse(fs.readFileSync(verifierProfilesFile, 'utf-8'));
      const verifierRepo = getVerifierProfileRepo();
      
      for (const profile of data.profiles) {
        const existing = await verifierRepo.findOne({ where: { did: profile.did } });
        if (!existing) {
          await verifierRepo.save({
            did: profile.did,
            wallet: profile.wallet.toLowerCase(),
            fullName: profile.fullName,
            professionalId: profile.professionalId,
            specialty: profile.specialty,
            licenseType: profile.licenseType,
            legalName: profile.legalName,
            legalNameVerified: profile.legalNameVerified || false,
            createdAt: new Date(profile.createdAt),
            updatedAt: new Date(profile.updatedAt),
          });
        }
      }
      console.log(`✅ Migrated ${data.profiles.length} verifier profiles`);
    }

    // 5. Migrate doctor-pending-patients
    const doctorPatientsFile = path.join(dataPath, 'doctor-pending-patients.json');
    if (fs.existsSync(doctorPatientsFile)) {
      const data = JSON.parse(fs.readFileSync(doctorPatientsFile, 'utf-8'));
      const doctorPatientRepo = getDoctorPatientRepo();
      
      for (const record of Array.isArray(data) ? data : [data]) {
        for (const patient of record.patients) {
          const existing = await doctorPatientRepo.findOne({
            where: {
              doctorDid: record.doctorDid,
              patientWallet: patient.patientWallet,
            },
          });
          if (!existing) {
            await doctorPatientRepo.save({
              doctorDid: record.doctorDid,
              doctorWallet: record.doctorWallet.toLowerCase(),
              patientWallet: patient.patientWallet.toLowerCase(),
              patientDid: patient.patientDid,
              addedAt: new Date(patient.addedAt),
              updatedAt: new Date(record.updatedAt),
            });
          }
        }
      }
      console.log(`✅ Migrated doctor-pending-patients`);
    }

    // 6. Migrate ministry license registry
    const ministryFile = path.join(dataPath, 'ministry-license-registry.json');
    if (fs.existsSync(ministryFile)) {
      const data = JSON.parse(fs.readFileSync(ministryFile, 'utf-8'));
      const ministryRepo = getMinistryRegistryRepo();
      
      for (const record of data.records) {
        const professionalId = String(record.professionalId || '').trim();
        const linkedWallet = String(record.linkedWallet || '').trim().toLowerCase();
        const existing = await ministryRepo
          .createQueryBuilder('m')
          .where('LOWER(m.professionalId) = :pid', { pid: professionalId.toLowerCase() })
          .getOne();
        if (!existing) {
          await ministryRepo.save({
            professionalId,
            fullName: record.fullName,
            licenseType: record.licenseType,
            specialty: record.specialty,
            status: record.status || 'active',
            role: record.role,
            validUntil: new Date(record.validUntil),
            linkedWallet,
          });
        }
      }
      console.log(`✅ Migrated ${data.records.length} ministry registry records`);
    }

    // 7. Migrate hybrid credentials
    const hybridCredFile = path.join(dataPath, 'hybrid-credentials.json');
    if (fs.existsSync(hybridCredFile)) {
      const data = JSON.parse(fs.readFileSync(hybridCredFile, 'utf-8'));
      const hybridRepo = getHybridCredentialRepo();
      
      for (const record of data.records) {
        const existing = await hybridRepo.findOne({ where: { cid: record.cid } });
        if (!existing) {
          await hybridRepo.save({
            cid: record.cid,
            payloadHash: record.payloadHash,
            encryptedCredentialHex: record.encryptedCredentialHex,
            subjectDid: record.subjectDid,
            subjectWallet: record.subjectWallet.toLowerCase(),
            issuerDid: record.issuerDid,
            credentialType: record.credentialType,
            issuedAt: new Date(record.issuedAt),
            expirationDate: record.expirationDate ? new Date(record.expirationDate) : null,
            storageMode: record.storageMode,
          });
        }
      }
      console.log(`✅ Migrated ${data.records.length} hybrid credentials`);
    }

    // 8. Migrate audit logs
    const auditFile = path.join(dataPath, 'audit-log.json');
    if (fs.existsSync(auditFile)) {
      const data = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
      const auditRepo = getAuditLogRepo();
      
      for (const log of data.logs) {
        const existing = await auditRepo.findOne({ where: { id: log.id } });
        if (!existing) {
          await auditRepo.save({
            id: log.id,
            timestamp: new Date(log.timestamp),
            action: log.action,
            role: log.role,
            wallet: log.wallet,
            did: log.did,
            status: log.status,
            details: log.details || null,
            metadata: log.metadata ? JSON.stringify(log.metadata) : null,
          });
        }
      }
      console.log(`✅ Migrated ${data.logs.length} audit logs`);
    }

    console.log('✅ Data migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during data migration:', error);
    throw error;
  }
}
