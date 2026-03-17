import fs from "fs";
import path from "path";

const PENDING_PATIENTS_FILE = path.join(__dirname, "../data/doctor-pending-patients.json");

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

function ensureFile() {
  if (!fs.existsSync(PENDING_PATIENTS_FILE)) {
    fs.writeFileSync(PENDING_PATIENTS_FILE, JSON.stringify([], null, 2));
  }
}

function readFile() {
  ensureFile();
  const data = fs.readFileSync(PENDING_PATIENTS_FILE, "utf8");
  return JSON.parse(data) as DoctorPendingPatients[];
}

function writeFile(data: DoctorPendingPatients[]) {
  fs.writeFileSync(PENDING_PATIENTS_FILE, JSON.stringify(data, null, 2));
}

export function getPendingPatientsByDoctorDid(doctorDid: string): DoctorPendingPatients | null {
  const all = readFile();
  return all.find((d) => d.doctorDid === doctorDid) || null;
}

export function addPendingPatient(
  doctorDid: string,
  doctorWallet: string,
  patientWallet: string,
  patientDid: string
): DoctorPendingPatients {
  const all = readFile();
  let doctorRecord = all.find((d) => d.doctorDid === doctorDid);

  if (!doctorRecord) {
    doctorRecord = {
      doctorDid,
      doctorWallet,
      patients: [],
      updatedAt: new Date().toISOString(),
    };
    all.push(doctorRecord);
  }

  // Check if patient already exists
  const existingIndex = doctorRecord.patients.findIndex((p) => p.patientWallet === patientWallet);
  if (existingIndex === -1) {
    doctorRecord.patients.push({
      patientWallet,
      patientDid,
      addedAt: new Date().toISOString(),
    });
  }

  doctorRecord.updatedAt = new Date().toISOString();
  writeFile(all);
  return doctorRecord;
}

export function removePendingPatient(doctorDid: string, patientWallet: string): DoctorPendingPatients | null {
  const all = readFile();
  const doctorRecord = all.find((d) => d.doctorDid === doctorDid);

  if (doctorRecord) {
    doctorRecord.patients = doctorRecord.patients.filter((p) => p.patientWallet !== patientWallet);
    doctorRecord.updatedAt = new Date().toISOString();
    writeFile(all);
  }

  return doctorRecord || null;
}
