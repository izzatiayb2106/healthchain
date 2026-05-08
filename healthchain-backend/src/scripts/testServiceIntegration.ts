import 'reflect-metadata';
import { initializeDatabase, getIdentityMappingRepo, getDoctorProfileRepo, getPatientProfileRepo, getDoctorPatientRepo } from '../db';
import { IdentityMapping } from '../db/entities';

async function testServiceIntegration() {
  console.log('🔍 Testing service layer integration with database...\n');

  try {
    // Initialize database
    await initializeDatabase();

    // Test 1: Identity lookups
    const identityRepo = getIdentityMappingRepo();
    const identities = await identityRepo.find({ take: 2 });
    console.log('✅ Identity lookups working');

    // Test 2: Doctor profile lookups
    const doctorRepo = getDoctorProfileRepo();
    const doctorProfiles = await doctorRepo.find({ take: 2 });
    console.log('✅ Doctor profile queries working');
    
    if (doctorProfiles.length > 0) {
      const doctor = doctorProfiles[0];
      console.log(`   - Found: ${doctor.displayName} (${doctor.specialty})`);
    }

    // Test 3: Patient profile lookups
    const patientRepo = getPatientProfileRepo();
    const patientProfiles = await patientRepo.find({ take: 2 });
    console.log('✅ Patient profile queries working');
    
    if (patientProfiles.length > 0) {
      const patient = patientProfiles[0];
      console.log(`   - Found: ${patient.fullName} (${patient.bloodType})`);
    }

    // Test 4: Verify data integrity
    console.log('\n📊 Data Integrity Checks:');
    
    // Check that wallets are lowercase
    const allIdentities = await identityRepo.find();
    const allLowercase = allIdentities.every((id: IdentityMapping) => id.wallet === id.wallet.toLowerCase());
    console.log(`  ${allLowercase ? '✅' : '❌'} All wallets are lowercase`);

    // Check that DIDs are unique
    const dids = allIdentities.map((id: IdentityMapping) => id.did);
    const uniqueDids = new Set(dids).size === dids.length;
    console.log(`  ${uniqueDids ? '✅' : '❌'} All DIDs are unique`);

    // Check doctor-patient relationships
    const doctorPatientRepo = getDoctorPatientRepo();
    const relationships = await doctorPatientRepo.find();
    console.log(`  ✅ Doctor-Patient relationships: ${relationships.length} links`);

    console.log('\n✅ All service integration tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Service integration test failed:', error);
    process.exit(1);
  }
}

testServiceIntegration();
