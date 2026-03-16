import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import './doctor.css';

//type Appointment = { id: number; time: string; patient: string; done?: boolean };

type VaccinationCertificate = {
    id: string;
    patientName: string;
    patientDob: string;
    vaccineType: string;
    manufacturer: string;
    batchNumber: string;
    doseNumber: number;
    dateAdministered: string;
    nextDoseDate: string;
    notes: string;
    createdAt: string;
};

const initialFormState = {
    patientName: '',
    patientDob: '',
    vaccineType: '',
    manufacturer: '',
    batchNumber: '',
    doseNumber: 1,
    dateAdministered: '',
    nextDoseDate: '',
    notes: '',
};

const DoctorDashboard: React.FC = () => {
   /* const [appointments, setAppointments] = useState<Appointment[]>([
        { id: 1, time: '09:00', patient: 'Jane Smith' },
        { id: 2, time: '10:30', patient: 'Bob Lee' },
        { id: 3, time: '13:15', patient: 'Alice Johnson' },
    ]);*/

    const [showVaccineForm, setShowVaccineForm] = useState(false);
    const [vaccineForm, setVaccineForm] = useState(initialFormState);
    const [certificates, setCertificates] = useState<VaccinationCertificate[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch certificates from Firebase on component mount
    useEffect(() => {
        const fetchCertificates = async () => {
            try {
                const certificatesRef = collection(db, 'VaccinationCertificate');
                const q = query(certificatesRef, orderBy('createdAt', 'desc'));
                const querySnapshot = await getDocs(q);
                const fetchedCertificates: VaccinationCertificate[] = [];
                querySnapshot.forEach((doc) => {
                    fetchedCertificates.push({ id: doc.id, ...doc.data() } as VaccinationCertificate);
                });
                setCertificates(fetchedCertificates);
            } catch (error) {
                console.error('Error fetching certificates:', error);
            }
        };
        fetchCertificates();
    }, []);

    const handleLogout = () => {
        // replace with real logout flow
        alert('Logout not implemented');
    };

    const handleNewNote = () => {
        // replace with real note creation flow
        alert('Create note not implemented');
    };

  /*  const toggleDone = (id: number) => {
        setAppointments(prev =>
            prev.map(a => (a.id === id ? { ...a, done: !a.done } : a))
        );
    };*/

    const handleVaccineFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setVaccineForm(prev => ({
            ...prev,
            [name]: name === 'doseNumber' ? parseInt(value) || 1 : value,
        }));
    };

    const handleSaveCertificate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const certificateData = {
                ...vaccineForm,
                createdAt: new Date().toISOString(),
            };
            const docRef = await addDoc(collection(db, 'VaccinationCertificate'), certificateData);
            const newCertificate: VaccinationCertificate = {
                id: docRef.id,
                ...vaccineForm,
                createdAt: certificateData.createdAt,
            };
            setCertificates(prev => [newCertificate, ...prev]);
            setVaccineForm(initialFormState);
            setShowVaccineForm(false);
            alert('Vaccination certificate saved successfully!');
        } catch (error) {
            console.error('Error saving certificate:', error);
            alert('Error saving certificate. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelForm = () => {
        setVaccineForm(initialFormState);
        setShowVaccineForm(false);
    };

    return (
        <div className="doctor-dashboard">
            <header className="dd-header">
                <h1 className="dd-title">Doctor Dashboard</h1>
                <button className="btn" onClick={handleLogout}>Logout</button>
            </header>

            <section className="doctor-info">
                <strong>Doctor:</strong> Dr. John Doe
            </section>

 {/*         <section className="appointments">
                <h2>Today's Appointments</h2>
                <ul className="appt-list">
                    {appointments.map(a => (
                        <li
                            key={a.id}
                            className={`appointment-item ${a.done ? 'done' : ''}`}
                        >
                            <span className="time">{a.time}</span>
                            <span className="patient">{a.patient}</span>
                            <button
                                className="btn small"
                                onClick={() => toggleDone(a.id)}
                                aria-pressed={!!a.done}
                            >
                                {a.done ? 'Undo' : 'Done'}
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
 */}
            <section className="actions">
                <button className="btn" onClick={handleNewNote}>New Note</button>
                <button className="btn" onClick={() => setShowVaccineForm(true)}>New Vaccination Certificate</button>
            </section>

            {showVaccineForm && (
                <div className="modal-overlay">
                    <div className="vaccine-form-modal">
                        <h2>Create Vaccination Certificate</h2>
                        <form onSubmit={handleSaveCertificate} className="vaccine-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="patientName">Patient Name *</label>
                                    <input
                                        type="text"
                                        id="patientName"
                                        name="patientName"
                                        value={vaccineForm.patientName}
                                        onChange={handleVaccineFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="patientDob">Date of Birth *</label>
                                    <input
                                        type="date"
                                        id="patientDob"
                                        name="patientDob"
                                        value={vaccineForm.patientDob}
                                        onChange={handleVaccineFormChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="vaccineType">Vaccine Type *</label>
                                    <select
                                        id="vaccineType"
                                        name="vaccineType"
                                        value={vaccineForm.vaccineType}
                                        onChange={handleVaccineFormChange}
                                        required
                                    >
                                        <option value="">Select vaccine</option>
                                        <option value="COVID-19">COVID-19</option>
                                        <option value="Influenza">Influenza</option>
                                        <option value="Hepatitis B">Hepatitis B</option>
                                        <option value="MMR">MMR (Measles, Mumps, Rubella)</option>
                                        <option value="Tetanus">Tetanus</option>
                                        <option value="Polio">Polio</option>
                                        <option value="HPV">HPV</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="manufacturer">Manufacturer *</label>
                                    <input
                                        type="text"
                                        id="manufacturer"
                                        name="manufacturer"
                                        value={vaccineForm.manufacturer}
                                        onChange={handleVaccineFormChange}
                                        placeholder="e.g., Pfizer, Moderna"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="batchNumber">Batch/Lot Number *</label>
                                    <input
                                        type="text"
                                        id="batchNumber"
                                        name="batchNumber"
                                        value={vaccineForm.batchNumber}
                                        onChange={handleVaccineFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="doseNumber">Dose Number *</label>
                                    <input
                                        type="number"
                                        id="doseNumber"
                                        name="doseNumber"
                                        value={vaccineForm.doseNumber}
                                        onChange={handleVaccineFormChange}
                                        min="1"
                                        max="10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="dateAdministered">Date Administered *</label>
                                    <input
                                        type="date"
                                        id="dateAdministered"
                                        name="dateAdministered"
                                        value={vaccineForm.dateAdministered}
                                        onChange={handleVaccineFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="nextDoseDate">Next Dose Date</label>
                                    <input
                                        type="date"
                                        id="nextDoseDate"
                                        name="nextDoseDate"
                                        value={vaccineForm.nextDoseDate}
                                        onChange={handleVaccineFormChange}
                                    />
                                </div>
                            </div>

                            <div className="form-group full-width">
                                <label htmlFor="notes">Additional Notes</label>
                                <textarea
                                    id="notes"
                                    name="notes"
                                    value={vaccineForm.notes}
                                    onChange={handleVaccineFormChange}
                                    rows={3}
                                    placeholder="Any additional information..."
                                />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={handleCancelForm} disabled={loading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn" disabled={loading}>
                                    {loading ? 'Saving...' : 'Save Certificate'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {certificates.length > 0 && (
                <section className="certificates-section">
                    <h2>Saved Certificates ({certificates.length})</h2>
                    <div className="certificates-list">
                        {certificates.map(cert => (
                            <div key={cert.id} className="certificate-card">
                                <div className="cert-header">
                                    <strong>{cert.patientName}</strong>
                                    <span className="cert-date">{new Date(cert.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="cert-details">
                                    <span><strong>Vaccine:</strong> {cert.vaccineType}</span>
                                    <span><strong>Dose:</strong> #{cert.doseNumber}</span>
                                    <span><strong>Manufacturer:</strong> {cert.manufacturer}</span>
                                    <span><strong>Batch:</strong> {cert.batchNumber}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default DoctorDashboard;