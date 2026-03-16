import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import axios from 'axios';
import { ethers } from 'ethers';
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

type DoctorProfile = {
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
    const [profile, setProfile] = useState<DoctorProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [savingEditProfile, setSavingEditProfile] = useState(false);
    const [onboardingForm, setOnboardingForm] = useState({
        displayName: '',
        specialty: '',
        hospitalOrClinic: '',
        licenseNumber: '',
        avatarUrl: '',
    });
    const [editProfileForm, setEditProfileForm] = useState({
        displayName: '',
        specialty: '',
        hospitalOrClinic: '',
        licenseNumber: '',
        avatarUrl: '',
    });
    const [onboardingAvatarPreviewError, setOnboardingAvatarPreviewError] = useState(false);
    const [editAvatarPreviewError, setEditAvatarPreviewError] = useState(false);

    const isValidAvatarUrl = (value: string) => {
        if (!value.trim()) return true;
        try {
            const parsed = new URL(value.trim());
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const hydrateProfileForms = (loadedProfile: DoctorProfile) => {
        const next = {
            displayName: loadedProfile.displayName || loadedProfile.legalName || '',
            specialty: loadedProfile.specialty || '',
            hospitalOrClinic: loadedProfile.hospitalOrClinic || '',
            licenseNumber: loadedProfile.licenseNumber || '',
            avatarUrl: loadedProfile.avatarUrl || '',
        };
        setOnboardingForm(next);
        setEditProfileForm(next);
        setOnboardingAvatarPreviewError(false);
        setEditAvatarPreviewError(false);
    };

    const buildAuthHeaders = async () => {
        const wallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
        if (!wallet) {
            throw new Error('No wallet found. Please log in again.');
        }

        if (!(window as any).ethereum) {
            throw new Error('MetaMask is required to authenticate this action.');
        }

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        await provider.send('eth_requestAccounts', []);
        const signer = await provider.getSigner();
        const activeWallet = (await signer.getAddress()).toLowerCase();
        if (activeWallet !== wallet) {
            throw new Error('Please switch MetaMask to the same wallet used at login.');
        }

        const message = `Doctor profile auth for ${wallet} at ${new Date().toISOString()}`;
        const signature = await signer.signMessage(message);

        return {
            'x-user-wallet': wallet,
            'x-user-message': message,
            'x-user-signature': signature,
        };
    };

    const loadProfile = async () => {
        try {
            setProfileLoading(true);
            setProfileError(null);

            const headers = await buildAuthHeaders();
            const response = await axios.get('http://localhost:3001/doctor/profile/me', { headers });
            const loadedProfile = response.data?.profile as DoctorProfile;
            const needsOnboarding = Boolean(response.data?.needsOnboarding);

            setProfile(loadedProfile);
            hydrateProfileForms(loadedProfile);
            setShowOnboarding(needsOnboarding);
            setShowEditProfile(false);
        } catch (error: any) {
            if (error?.response?.status === 404) {
                setShowOnboarding(true);
                return;
            }

            const detail = error?.response?.data?.error || error?.message || 'Failed to load doctor profile';
            setProfileError(detail);
        } finally {
            setProfileLoading(false);
        }
    };

    // Fetch certificates from Firebase on component mount
    useEffect(() => {
        const role = String(localStorage.getItem('hc_role') || '').toLowerCase();
        if (role !== 'doctor') {
            window.location.href = '/login';
            return;
        }

        void loadProfile();

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
        localStorage.removeItem('hc_wallet');
        localStorage.removeItem('hc_did');
        localStorage.removeItem('hc_role');
        window.location.href = '/login';
    };

    const handleOnboardingInput = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const { name, value } = event.target;
        setOnboardingForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleOnboardingSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (savingProfile) return;

        if (!isValidAvatarUrl(onboardingForm.avatarUrl)) {
            setProfileError('Avatar URL must start with http:// or https://');
            return;
        }

        try {
            setSavingProfile(true);
            setProfileError(null);

            const headers = await buildAuthHeaders();
            const response = await axios.post(
                'http://localhost:3001/doctor/profile/me',
                {
                    displayName: onboardingForm.displayName,
                    specialty: onboardingForm.specialty,
                    hospitalOrClinic: onboardingForm.hospitalOrClinic,
                    licenseNumber: onboardingForm.licenseNumber,
                    avatarUrl: onboardingForm.avatarUrl,
                },
                { headers }
            );

            const saved = response.data?.profile as DoctorProfile;
            setProfile(saved);
            hydrateProfileForms(saved);
            setShowOnboarding(false);
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to save doctor profile';
            setProfileError(detail);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleEditProfileInput = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const { name, value } = event.target;
        setEditProfileForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleEditProfileSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (savingEditProfile) return;

        if (!isValidAvatarUrl(editProfileForm.avatarUrl)) {
            setProfileError('Avatar URL must start with http:// or https://');
            return;
        }

        try {
            setSavingEditProfile(true);
            setProfileError(null);
            const headers = await buildAuthHeaders();
            const response = await axios.put(
                'http://localhost:3001/doctor/profile/me',
                {
                    displayName: editProfileForm.displayName,
                    specialty: editProfileForm.specialty,
                    hospitalOrClinic: editProfileForm.hospitalOrClinic,
                    licenseNumber: editProfileForm.licenseNumber,
                    avatarUrl: editProfileForm.avatarUrl,
                },
                { headers }
            );

            const updated = response.data?.profile as DoctorProfile;
            setProfile(updated);
            hydrateProfileForms(updated);
            setShowEditProfile(false);
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to update doctor profile';
            setProfileError(detail);
        } finally {
            setSavingEditProfile(false);
        }
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
                <h1 className="dd-title">{profile?.displayName ? `Welcome, Dr. ${profile.displayName}` : 'Doctor Dashboard'}</h1>
                <button className="btn" onClick={handleLogout}>Logout</button>
            </header>

            {profileError ? <div className="doctor-error">{profileError}</div> : null}

            {profileLoading ? (
                <section className="doctor-info">
                    <strong>Loading profile...</strong>
                </section>
            ) : null}

            {showOnboarding ? (
                <section className="doctor-onboarding">
                    <h2>Complete your doctor profile</h2>
                    <p>This one-time setup personalizes your dashboard and is linked to your DID.</p>
                    <form onSubmit={handleOnboardingSubmit} className="doctor-onboarding-form">
                        <label htmlFor="displayName">Display name *</label>
                        <input
                            id="displayName"
                            name="displayName"
                            type="text"
                            value={onboardingForm.displayName}
                            onChange={handleOnboardingInput}
                            required
                        />

                        <label htmlFor="specialty">Specialty *</label>
                        <input
                            id="specialty"
                            name="specialty"
                            type="text"
                            value={onboardingForm.specialty}
                            onChange={handleOnboardingInput}
                            placeholder="e.g. Internal Medicine"
                            required
                        />

                        <label htmlFor="hospitalOrClinic">Hospital or clinic *</label>
                        <input
                            id="hospitalOrClinic"
                            name="hospitalOrClinic"
                            type="text"
                            value={onboardingForm.hospitalOrClinic}
                            onChange={handleOnboardingInput}
                            required
                        />

                        <label htmlFor="licenseNumber">License number (optional)</label>
                        <input
                            id="licenseNumber"
                            name="licenseNumber"
                            type="text"
                            value={onboardingForm.licenseNumber}
                            onChange={handleOnboardingInput}
                        />

                        <label htmlFor="avatarUrl">Avatar URL (optional)</label>
                        <input
                            id="avatarUrl"
                            name="avatarUrl"
                            type="url"
                            value={onboardingForm.avatarUrl}
                            onChange={(event) => {
                                setOnboardingAvatarPreviewError(false);
                                handleOnboardingInput(event);
                            }}
                            placeholder="https://..."
                        />

                        {onboardingForm.avatarUrl && !isValidAvatarUrl(onboardingForm.avatarUrl) ? (
                            <div className="doctor-inline-error">Avatar URL must start with http:// or https://</div>
                        ) : null}

                        {onboardingForm.avatarUrl && isValidAvatarUrl(onboardingForm.avatarUrl) ? (
                            <div className="avatar-preview-wrap">
                                {!onboardingAvatarPreviewError ? (
                                    <img
                                        src={onboardingForm.avatarUrl}
                                        alt="Avatar preview"
                                        className="avatar-preview"
                                        onError={() => setOnboardingAvatarPreviewError(true)}
                                    />
                                ) : (
                                    <div className="doctor-inline-error">Could not load this avatar image URL.</div>
                                )}
                            </div>
                        ) : null}

                        <button className="btn" type="submit" disabled={savingProfile}>
                            {savingProfile ? 'Saving profile...' : 'Save profile'}
                        </button>
                    </form>
                </section>
            ) : null}

            <section className="doctor-info">
                <strong>Doctor:</strong> {profile?.displayName ? `Dr. ${profile.displayName}` : 'Profile not set'}
                {profile?.avatarUrl ? (
                    <div className="avatar-preview-wrap">
                        <img src={profile.avatarUrl} alt="Doctor avatar" className="avatar-preview" />
                    </div>
                ) : null}
                {profile?.specialty ? <div><strong>Specialty:</strong> {profile.specialty}</div> : null}
                {profile?.hospitalOrClinic ? <div><strong>Hospital/Clinic:</strong> {profile.hospitalOrClinic}</div> : null}
                {profile?.legalNameVerified && profile?.legalName ? <div><strong>Verified legal name:</strong> {profile.legalName}</div> : null}
                {!showOnboarding && profile ? (
                    <div className="doctor-profile-actions">
                        <button className="btn" onClick={() => setShowEditProfile((prev) => !prev)}>
                            {showEditProfile ? 'Close Edit Profile' : 'Edit Profile'}
                        </button>
                    </div>
                ) : null}
            </section>

            {showEditProfile && profile ? (
                <section className="doctor-onboarding">
                    <h2>Edit profile</h2>
                    <p>Update your personalized dashboard details.</p>
                    <form onSubmit={handleEditProfileSubmit} className="doctor-onboarding-form">
                        <label htmlFor="editDisplayName">Display name *</label>
                        <input
                            id="editDisplayName"
                            name="displayName"
                            type="text"
                            value={editProfileForm.displayName}
                            onChange={handleEditProfileInput}
                            required
                        />

                        <label htmlFor="editSpecialty">Specialty *</label>
                        <input
                            id="editSpecialty"
                            name="specialty"
                            type="text"
                            value={editProfileForm.specialty}
                            onChange={handleEditProfileInput}
                            required
                        />

                        <label htmlFor="editHospitalOrClinic">Hospital or clinic *</label>
                        <input
                            id="editHospitalOrClinic"
                            name="hospitalOrClinic"
                            type="text"
                            value={editProfileForm.hospitalOrClinic}
                            onChange={handleEditProfileInput}
                            required
                        />

                        <label htmlFor="editLicenseNumber">License number (optional)</label>
                        <input
                            id="editLicenseNumber"
                            name="licenseNumber"
                            type="text"
                            value={editProfileForm.licenseNumber}
                            onChange={handleEditProfileInput}
                        />

                        <label htmlFor="editAvatarUrl">Avatar URL (optional)</label>
                        <input
                            id="editAvatarUrl"
                            name="avatarUrl"
                            type="url"
                            value={editProfileForm.avatarUrl}
                            onChange={(event) => {
                                setEditAvatarPreviewError(false);
                                handleEditProfileInput(event);
                            }}
                            placeholder="https://..."
                        />

                        {editProfileForm.avatarUrl && !isValidAvatarUrl(editProfileForm.avatarUrl) ? (
                            <div className="doctor-inline-error">Avatar URL must start with http:// or https://</div>
                        ) : null}

                        {editProfileForm.avatarUrl && isValidAvatarUrl(editProfileForm.avatarUrl) ? (
                            <div className="avatar-preview-wrap">
                                {!editAvatarPreviewError ? (
                                    <img
                                        src={editProfileForm.avatarUrl}
                                        alt="Avatar preview"
                                        className="avatar-preview"
                                        onError={() => setEditAvatarPreviewError(true)}
                                    />
                                ) : (
                                    <div className="doctor-inline-error">Could not load this avatar image URL.</div>
                                )}
                            </div>
                        ) : null}

                        <button className="btn" type="submit" disabled={savingEditProfile}>
                            {savingEditProfile ? 'Updating profile...' : 'Update profile'}
                        </button>
                    </form>
                </section>
            ) : null}

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