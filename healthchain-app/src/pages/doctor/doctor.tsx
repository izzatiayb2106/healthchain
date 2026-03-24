import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import './doctor.css';

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

type PendingPatient = {
    patientWallet: string;
    patientDid: string;
    addedAt: string;
};

type IssuedCredentialEntry = {
    issuedAt: string;
    credentialType: string;
    issuerDid: string;
    credential: any;
};

const initialVaccineForm = {
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

    const [showIssueCredentialModal, setShowIssueCredentialModal] = useState(false);
    const [vaccineForm, setVaccineForm] = useState(initialVaccineForm);
    const [manualPatientWallet, setManualPatientWallet] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<{ wallet: string; did: string } | null>(null);
    const [pendingPatients, setPendingPatients] = useState<PendingPatient[]>([]);
    const [credentialLoading, setCredentialLoading] = useState(false);
    const [credentialError, setCredentialError] = useState<string | null>(null);
    const [resolvingWallet, setResolvingWallet] = useState(false);
    const [removingPatientWallet, setRemovingPatientWallet] = useState<string | null>(null);
    const [selectedPatientCredentials, setSelectedPatientCredentials] = useState<IssuedCredentialEntry[]>([]);
    const [patientCredentialsLoading, setPatientCredentialsLoading] = useState(false);
    const [patientCredentialsError, setPatientCredentialsError] = useState<string | null>(null);

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

    const loadPendingPatients = async () => {
        try {
            const headers = await buildAuthHeaders();
            const response = await axios.get('http://localhost:3001/doctor/pending-patients/me', { headers });
            setPendingPatients(response.data?.pendingPatients || []);
        } catch (error: any) {
            console.error('Failed to load pending patients:', error);
        }
    };

    const parseCredentialSubject = (credential: any) => {
        try {
            if (typeof credential === 'string') {
                const payload = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                return payload?.vc?.credentialSubject || null;
            }
            return credential?.credentialSubject || credential?.vc?.credentialSubject || null;
        } catch {
            return null;
        }
    };

    const loadPatientCredentials = async (patient: { wallet: string; did: string }) => {
        try {
            setPatientCredentialsLoading(true);
            setPatientCredentialsError(null);
            const headers = await buildAuthHeaders();
            const response = await axios.get(
                `http://localhost:3001/doctor/patient-credentials/${encodeURIComponent(patient.did)}`,
                { headers }
            );
            setSelectedPatientCredentials(Array.isArray(response.data?.credentials) ? response.data.credentials : []);
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to load patient credentials';
            setPatientCredentialsError(detail);
            setSelectedPatientCredentials([]);
        } finally {
            setPatientCredentialsLoading(false);
        }
    };

    const prefillPatientForm = async (patient: { wallet: string; did: string }) => {
        setSelectedPatient(patient);
        setVaccineForm(initialVaccineForm);
        void loadPatientCredentials(patient);

        try {
            const headers = await buildAuthHeaders();
            const response = await axios.get(
                `http://localhost:3001/doctor/patient-profile/${encodeURIComponent(patient.did)}`,
                { headers }
            );
            const profileFromPatient = response.data?.profile;

            setVaccineForm((prev) => ({
                ...prev,
                patientName: String(profileFromPatient?.fullName || ''),
                patientDob: String(profileFromPatient?.dateOfBirth || ''),
            }));
        } catch {
            // Fallback: keep fields editable and blank if profile is unavailable.
        }
    };

    const resolvePatientWallet = async () => {
        const wallet = manualPatientWallet.trim().toLowerCase();
        if (!wallet) {
            setCredentialError('Please enter a wallet address');
            return;
        }

        try {
            setResolvingWallet(true);
            setCredentialError(null);
            const headers = await buildAuthHeaders();

            const response = await axios.post(
                'http://localhost:3001/doctor/pending-patients',
                { patientWallet: wallet, patientDid: wallet },
                { headers }
            );

            const patients = response.data?.pendingPatients?.patients || [];
            const found = patients.find((p: any) => p.patientWallet === wallet);
            if (found) {
                await prefillPatientForm({ wallet: found.patientWallet, did: found.patientDid });
                setPendingPatients(patients);
                setManualPatientWallet('');
            }
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to resolve patient';
            setCredentialError(detail);
        } finally {
            setResolvingWallet(false);
        }
    };

    const removePatient = async (patientWallet: string) => {
        const wallet = String(patientWallet || '').trim().toLowerCase();
        if (!wallet) return;

        const shouldRemove = window.confirm('Remove this patient from your list?');
        if (!shouldRemove) return;

        try {
            setRemovingPatientWallet(wallet);
            setCredentialError(null);
            const headers = await buildAuthHeaders();
            const response = await axios.delete(
                `http://localhost:3001/doctor/pending-patients/${encodeURIComponent(wallet)}`,
                { headers }
            );

            const updatedPatients = response.data?.pendingPatients || [];
            setPendingPatients(updatedPatients);

            if (selectedPatient?.wallet === wallet) {
                setSelectedPatient(null);
                setShowIssueCredentialModal(false);
                setVaccineForm(initialVaccineForm);
                setSelectedPatientCredentials([]);
                setPatientCredentialsError(null);
            }
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to remove patient';
            setCredentialError(detail);
        } finally {
            setRemovingPatientWallet(null);
        }
    };

    const issueCredentialFromModal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) {
            setCredentialError('Please select a patient');
            return;
        }

        try {
            setCredentialLoading(true);
            setCredentialError(null);
            const headers = await buildAuthHeaders();

            const response = await axios.post(
                'http://localhost:3001/credential/issue',
                {
                    subjectDid: selectedPatient.did,
                    subjectWallet: selectedPatient.wallet,
                    credentialType: 'VaccinationCredential',
                    name: vaccineForm.patientName,
                    role: 'patient',
                    credentialDetails: {
                        patientName: vaccineForm.patientName,
                        patientDob: vaccineForm.patientDob,
                        vaccineType: vaccineForm.vaccineType,
                        manufacturer: vaccineForm.manufacturer,
                        batchNumber: vaccineForm.batchNumber,
                        doseNumber: vaccineForm.doseNumber,
                        dateAdministered: vaccineForm.dateAdministered,
                        nextDoseDate: vaccineForm.nextDoseDate,
                        notes: vaccineForm.notes,
                    },
                },
                { headers }
            );
            alert(`Credential issued successfully!\n\nIssued to: ${response.data?.issuedTo}\nCredential type: ${response.data?.credentialType}`);
            setVaccineForm(initialVaccineForm);
            setShowIssueCredentialModal(false);
            await loadPatientCredentials(selectedPatient);
        } catch (error: any) {
            const detail = error?.response?.data?.error || error?.message || 'Failed to issue credential';
            setCredentialError(detail);
        } finally {
            setCredentialLoading(false);
        }
    };

    useEffect(() => {
        const role = String(localStorage.getItem('hc_role') || '').toLowerCase();
        if (role !== 'doctor') {
            window.location.href = '/login';
            return;
        }

        void loadProfile();
        void loadPendingPatients();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('hc_wallet');
        localStorage.removeItem('hc_did');
        localStorage.removeItem('hc_role');
        window.location.href = '/login';
    };

    const handleOnboardingInput = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const handleEditProfileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const handleVaccineFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setVaccineForm((prev) => ({
            ...prev,
            [name]: name === 'doseNumber' ? parseInt(value, 10) || 1 : value,
        }));
    };

    const handleCancelIssueCredentialModal = () => {
        setVaccineForm(initialVaccineForm);
        setShowIssueCredentialModal(false);
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
                        <input id="displayName" name="displayName" type="text" value={onboardingForm.displayName} onChange={handleOnboardingInput} required />

                        <label htmlFor="specialty">Specialty *</label>
                        <input id="specialty" name="specialty" type="text" value={onboardingForm.specialty} onChange={handleOnboardingInput} placeholder="e.g. Internal Medicine" required />

                        <label htmlFor="hospitalOrClinic">Hospital or clinic *</label>
                        <input id="hospitalOrClinic" name="hospitalOrClinic" type="text" value={onboardingForm.hospitalOrClinic} onChange={handleOnboardingInput} required />

                        <label htmlFor="licenseNumber">License number (optional)</label>
                        <input id="licenseNumber" name="licenseNumber" type="text" value={onboardingForm.licenseNumber} onChange={handleOnboardingInput} />

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
                                    <img src={onboardingForm.avatarUrl} alt="Avatar preview" className="avatar-preview" onError={() => setOnboardingAvatarPreviewError(true)} />
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
                        <input id="editDisplayName" name="displayName" type="text" value={editProfileForm.displayName} onChange={handleEditProfileInput} required />

                        <label htmlFor="editSpecialty">Specialty *</label>
                        <input id="editSpecialty" name="specialty" type="text" value={editProfileForm.specialty} onChange={handleEditProfileInput} required />

                        <label htmlFor="editHospitalOrClinic">Hospital or clinic *</label>
                        <input id="editHospitalOrClinic" name="hospitalOrClinic" type="text" value={editProfileForm.hospitalOrClinic} onChange={handleEditProfileInput} required />

                        <label htmlFor="editLicenseNumber">License number (optional)</label>
                        <input id="editLicenseNumber" name="licenseNumber" type="text" value={editProfileForm.licenseNumber} onChange={handleEditProfileInput} />

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
                                    <img src={editProfileForm.avatarUrl} alt="Avatar preview" className="avatar-preview" onError={() => setEditAvatarPreviewError(true)} />
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

            <section className="credential-issuance-section">
                <h2>Issue Credentials</h2>

                <div className="manual-patient-input">
                    <h3>Manually add patient by wallet</h3>
                    <div className="manual-input-form">
                        <input
                            type="text"
                            placeholder="Paste patient wallet address here..."
                            value={manualPatientWallet}
                            onChange={(e) => setManualPatientWallet(e.target.value)}
                            disabled={resolvingWallet}
                        />
                        <button className="btn" onClick={resolvePatientWallet} disabled={resolvingWallet || !manualPatientWallet.trim()}>
                            {resolvingWallet ? 'Resolving...' : 'Add Patient'}
                        </button>
                    </div>
                </div>

                {credentialError ? <div className="credential-error">{credentialError}</div> : null}

                {pendingPatients.length > 0 ? (
                    <div className="pending-patients-section">
                        <h3>Patients ({pendingPatients.length})</h3>
                        <div className="patients-list">
                            {pendingPatients.map((patient) => (
                                <div
                                    key={patient.patientWallet}
                                    className={`patient-card ${selectedPatient?.wallet === patient.patientWallet ? 'selected' : ''}`}
                                    onClick={() => {
                                        void prefillPatientForm({ wallet: patient.patientWallet, did: patient.patientDid });
                                    }}
                                >
                                    <div className="patient-card-actions">
                                        <button
                                            type="button"
                                            className="btn btn-danger small-remove"
                                            disabled={removingPatientWallet === patient.patientWallet}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void removePatient(patient.patientWallet);
                                            }}
                                        >
                                            {removingPatientWallet === patient.patientWallet ? 'Removing...' : 'Remove'}
                                        </button>
                                    </div>
                                    <div className="patient-info">
                                        <strong>Wallet:</strong> {patient.patientWallet.substring(0, 10)}...
                                    </div>
                                    <div className="patient-info">
                                        <strong>DID:</strong> {patient.patientDid.substring(0, 20)}...
                                    </div>
                                    <div className="patient-info">
                                        <strong>Added:</strong> {new Date(patient.addedAt).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {selectedPatient ? (
                    <div className="credential-form-section">
                        <button className="btn" onClick={() => setShowIssueCredentialModal(true)} disabled={credentialLoading}>
                            Issue Credential
                        </button>

                        <div className="doctor-issued-credentials-section">
                            <h3>Credentials Issued</h3>
                            {patientCredentialsError ? <div className="credential-error">{patientCredentialsError}</div> : null}
                            {patientCredentialsLoading ? <p>Loading credentials...</p> : null}
                            {!patientCredentialsLoading && selectedPatientCredentials.length === 0 ? (
                                <p>No credentials issued to this patient by you yet.</p>
                            ) : null}

                            {selectedPatientCredentials.map((entry, index) => {
                                const subject = parseCredentialSubject(entry.credential);
                                return (
                                    <article key={`${entry.issuedAt}-${index}`} className="doctor-credential-card">
                                        <h4>{entry.credentialType}</h4>
                                        <p><strong>Issued:</strong> {new Date(entry.issuedAt).toLocaleString()}</p>
                                        <p><strong>Vaccine Type:</strong> {subject?.vaccineType ? String(subject.vaccineType) : 'Not specified'}</p>
                                        <p><strong>Dose Number:</strong> {subject?.doseNumber ? String(subject.doseNumber) : 'Not specified'}</p>
                                        <p><strong>Date Administered:</strong> {subject?.dateAdministered ? String(subject.dateAdministered) : 'Not specified'}</p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </section>

            {showIssueCredentialModal && selectedPatient ? (
                <div className="modal-overlay">
                    <div className="vaccine-form-modal">
                        <h2>Issue Vaccination Credential</h2>
                        <p>Issuing to wallet: {selectedPatient.wallet}</p>
                        <form onSubmit={issueCredentialFromModal} className="vaccine-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="issuePatientName">Patient Name *</label>
                                    <input type="text" id="issuePatientName" name="patientName" value={vaccineForm.patientName} onChange={handleVaccineFormChange} required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="issuePatientDob">Date of Birth *</label>
                                    <input type="date" id="issuePatientDob" name="patientDob" value={vaccineForm.patientDob} onChange={handleVaccineFormChange} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="issueVaccineType">Vaccine Type *</label>
                                    <select id="issueVaccineType" name="vaccineType" value={vaccineForm.vaccineType} onChange={handleVaccineFormChange} required>
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
                                    <label htmlFor="issueManufacturer">Manufacturer *</label>
                                    <input type="text" id="issueManufacturer" name="manufacturer" value={vaccineForm.manufacturer} onChange={handleVaccineFormChange} placeholder="e.g., Pfizer, Moderna" required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="issueBatchNumber">Batch/Lot Number *</label>
                                    <input type="text" id="issueBatchNumber" name="batchNumber" value={vaccineForm.batchNumber} onChange={handleVaccineFormChange} required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="issueDoseNumber">Dose Number *</label>
                                    <input type="number" id="issueDoseNumber" name="doseNumber" value={vaccineForm.doseNumber} onChange={handleVaccineFormChange} min="1" max="10" required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="issueDateAdministered">Date Administered *</label>
                                    <input type="date" id="issueDateAdministered" name="dateAdministered" value={vaccineForm.dateAdministered} onChange={handleVaccineFormChange} required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="issueNextDoseDate">Next Dose Date</label>
                                    <input type="date" id="issueNextDoseDate" name="nextDoseDate" value={vaccineForm.nextDoseDate} onChange={handleVaccineFormChange} />
                                </div>
                            </div>

                            <div className="form-group full-width">
                                <label htmlFor="issueNotes">Additional Notes</label>
                                <textarea id="issueNotes" name="notes" value={vaccineForm.notes} onChange={handleVaccineFormChange} rows={3} placeholder="Any additional information..." />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={handleCancelIssueCredentialModal} disabled={credentialLoading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn" disabled={credentialLoading}>
                                    {credentialLoading ? 'Issuing...' : 'Issue Credential'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <footer className="doctor-footer">
				<small>HealthChain • Doctor portal</small>
			</footer>
        </div>
    );
};

export default DoctorDashboard;