import { getDoctorPatientRepo } from '../db';
import { DoctorPatient } from '../db/entities';

export interface PendingPatient {
  patientWallet: string;
  patientDid: string;
  addedAt: string;
}

export interface DoctorPendingPatients {
  doctorDid: string;
  doctorWallet: string;
  patients: PendingPatient[];
  updatedAt: string;
}

function normalizeWallet(wallet: string) {
  return String(wallet || "").trim().toLowerCase();
}

// Convert database records to the legacy interface format
function formatDoctorPendingPatients(records: DoctorPatient[]): DoctorPendingPatients {
  if (records.length === 0) {
    throw new Error("No records found");
  }

  const doctorDid = records[0].doctorDid;
  const doctorWallet = records[0].doctorWallet;
  const patients = records.map((r) => ({
    patientWallet: r.patientWallet,
    patientDid: r.patientDid,
    addedAt: r.addedAt.toISOString(),
  }));

  const latestUpdate = records.reduce((latest, current) => {
    return current.updatedAt > latest.updatedAt ? current : latest;
  });

  return {
    doctorDid,
    doctorWallet,
    patients,
    updatedAt: latestUpdate.updatedAt.toISOString(),
  };
}

export async function getPendingPatientsByDoctorDid(doctorDid: string): Promise<DoctorPendingPatients | null> {
  const repo = getDoctorPatientRepo();
  const records = await repo.find({ where: { doctorDid } });
  
  if (records.length === 0) return null;
  return formatDoctorPendingPatients(records);
}

export async function addPendingPatient(
  doctorDid: string,
  doctorWallet: string,
  patientWallet: string,
  patientDid: string
): Promise<DoctorPendingPatients> {
  const repo = getDoctorPatientRepo();
  const normalizedDoctorWallet = normalizeWallet(doctorWallet);
  const normalizedPatientWallet = normalizeWallet(patientWallet);

  // Check if patient already exists
  const existing = await repo.findOne({
    where: {
      doctorDid,
      patientWallet: normalizedPatientWallet,
    },
  });

  if (!existing) {
    await repo.save({
      doctorDid,
      doctorWallet: normalizedDoctorWallet,
      patientWallet: normalizedPatientWallet,
      patientDid,
      addedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Return updated records
  const records = await repo.find({ where: { doctorDid } });
  return formatDoctorPendingPatients(records);
}

export async function removePendingPatient(doctorDid: string, patientWallet: string): Promise<DoctorPendingPatients | null> {
  const repo = getDoctorPatientRepo();
  const normalizedPatientWallet = normalizeWallet(patientWallet);

  await repo.delete({
    doctorDid,
    patientWallet: normalizedPatientWallet,
  });

  // Return updated records or null if no more patients
  const records = await repo.find({ where: { doctorDid } });
  return records.length > 0 ? formatDoctorPendingPatients(records) : null;
}
