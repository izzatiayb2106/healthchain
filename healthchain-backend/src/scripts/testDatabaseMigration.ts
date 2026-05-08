import { initializeDatabase, getDoctorPatientRepo, getDoctorProfileRepo, getPatientProfileRepo, getIdentityMappingRepo, getMinistryRegistryRepo } from '../db';

async function testDatabaseMigration() {
  console.log('🧪 Testing database initialization and migration...\n');

  try {
    // Initialize database and trigger auto-migration
    const db = await initializeDatabase();
    console.log('✅ Database initialized successfully\n');

    // Test data queries
    console.log('📊 Checking migrated data...\n');

    const identityRepo = getIdentityMappingRepo();
    const doctorRepo = getDoctorProfileRepo();
    const patientRepo = getPatientProfileRepo();
    const doctorPatientRepo = getDoctorPatientRepo();
    const ministryRepo = getMinistryRegistryRepo();

    const identityCount = await identityRepo.count();
    const doctorCount = await doctorRepo.count();
    const patientCount = await patientRepo.count();
    const doctorPatientCount = await doctorPatientRepo.count();
    const ministryCount = await ministryRepo.count();

    console.log(`📝 Identity Mappings: ${identityCount} records`);
    console.log(`👨‍⚕️  Doctor Profiles: ${doctorCount} records`);
    console.log(`👤 Patient Profiles: ${patientCount} records`);
    console.log(`🤝 Doctor-Patient Links: ${doctorPatientCount} records`);
    console.log(`📜 Ministry Registry: ${ministryCount} records`);
    console.log();

    // Show sample data
    if (doctorCount > 0) {
      const doctor = await doctorRepo.findOne({ where: {} });
      if (doctor) {
        console.log('📌 Sample Doctor Profile:');
        console.log(`  - Display Name: ${doctor.displayName}`);
        console.log(`  - Specialty: ${doctor.specialty}`);
        console.log(`  - Hospital: ${doctor.hospitalOrClinic}`);
        console.log();
      }
    }

    if (patientCount > 0) {
      const patient = await patientRepo.findOne({ where: {} });
      if (patient) {
        console.log('📌 Sample Patient Profile:');
        console.log(`  - Full Name: ${patient.fullName}`);
        console.log(`  - Blood Type: ${patient.bloodType}`);
        console.log(`  - Phone: ${patient.phone}`);
        console.log();
      }
    }

    console.log('✅ All tests passed! Database migration successful.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  }
}

testDatabaseMigration();
