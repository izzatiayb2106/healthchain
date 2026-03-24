import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import './patient.css';

declare global {
	interface Window {
		ethereum?: any;
	}
}

type PatientProfile = {
	did: string;
	wallet: string;
	fullName: string;
	dateOfBirth: string;
	bloodType: string;
	phone: string;
	email: string;
	emergencyContact: string;
	createdAt: string;
	updatedAt: string;
};

type DoctorIssuedCredential = {
	issuedAt: string;
	credentialType: string;
	issuerDid: string;
	issuerName?: string;
	issuerRole: string;
	issuedByDoctor: boolean;
	credential: any;
};

const emptyProfileForm = {
	fullName: '',
	dateOfBirth: '',
	bloodType: '',
	phone: '',
	email: '',
	emergencyContact: '',
};

const PatientDashboard: React.FC = () => {
	const [profile, setProfile] = useState<PatientProfile | null>(null);
	const [profileLoading, setProfileLoading] = useState(true);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [showEditProfile, setShowEditProfile] = useState(false);
	const [profileForm, setProfileForm] = useState(emptyProfileForm);
	const [savingProfile, setSavingProfile] = useState(false);

	const [credentials, setCredentials] = useState<DoctorIssuedCredential[]>([]);
	const [credentialsLoading, setCredentialsLoading] = useState(true);
	const [credentialsError, setCredentialsError] = useState<string | null>(null);

	const [showDoctorWalletInput, setShowDoctorWalletInput] = useState(false);
	const [doctorWalletInput, setDoctorWalletInput] = useState('');
	const [registeringWithDoctor, setRegisteringWithDoctor] = useState(false);
	const [doctorRegistrationError, setDoctorRegistrationError] = useState<string | null>(null);

	const [showDoctorApply, setShowDoctorApply] = useState(false);
	const [professionalId, setProfessionalId] = useState('');
	const [credentialJwt, setCredentialJwt] = useState('');
	const [applyError, setApplyError] = useState<string | null>(null);
	const [applySuccess, setApplySuccess] = useState<string | null>(null);
	const [isApplying, setIsApplying] = useState(false);

	const buildAuthHeaders = async () => {
		const wallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
		if (!wallet) {
			throw new Error('No wallet found. Please log in again.');
		}

		if (!window.ethereum) {
			throw new Error('MetaMask is required for secure patient access.');
		}

		const provider = new ethers.BrowserProvider(window.ethereum);
		await provider.send('eth_requestAccounts', []);
		const signer = await provider.getSigner();
		const activeWallet = (await signer.getAddress()).toLowerCase();
		if (activeWallet !== wallet) {
			throw new Error('Please switch MetaMask to the same wallet used at login.');
		}

		const message = `Patient access auth for ${wallet} at ${new Date().toISOString()}`;
		const signature = await signer.signMessage(message);

		return {
			'x-user-wallet': wallet,
			'x-user-message': message,
			'x-user-signature': signature,
		};
	};

	const hydrateProfileForm = (value: PatientProfile) => {
		setProfileForm({
			fullName: value.fullName || '',
			dateOfBirth: value.dateOfBirth || '',
			bloodType: value.bloodType || '',
			phone: value.phone || '',
			email: value.email || '',
			emergencyContact: value.emergencyContact || '',
		});
	};

	const loadDashboardData = async () => {
		try {
			setProfileLoading(true);
			setCredentialsLoading(true);
			setProfileError(null);
			setCredentialsError(null);

			const headers = await buildAuthHeaders();

			try {
				const profileRes = await axios.get('http://localhost:3001/patient/profile/me', { headers });
				const loadedProfile = profileRes.data?.profile as PatientProfile;
				setProfile(loadedProfile);
				hydrateProfileForm(loadedProfile);
				setShowOnboarding(Boolean(profileRes.data?.needsOnboarding));
			} catch (error: any) {
				if (error?.response?.status === 404) {
					setShowOnboarding(true);
					setProfile(null);
					setProfileForm(emptyProfileForm);
				} else {
					throw error;
				}
			}

			const credentialsRes = await axios.get('http://localhost:3001/patient/credentials/me', { headers });
			setCredentials(Array.isArray(credentialsRes.data?.credentials) ? credentialsRes.data.credentials : []);
		} catch (error: any) {
			const detail = error?.response?.data?.error || error?.message || 'Failed to load patient dashboard';
			setProfileError(detail);
			setCredentialsError(detail);
		} finally {
			setProfileLoading(false);
			setCredentialsLoading(false);
		}
	};

	useEffect(() => {
		const role = String(localStorage.getItem('hc_role') || '').toLowerCase();
		if (role !== 'patient') {
			window.location.href = '/login';
			return;
		}

		void loadDashboardData();
	}, []);

	const handleLogout = () => {
		localStorage.removeItem('hc_wallet');
		localStorage.removeItem('hc_did');
		localStorage.removeItem('hc_role');
		window.location.href = '/login';
	};

	const handleProfileInput = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		const { name, value } = event.target;
		setProfileForm((prev) => ({ ...prev, [name]: value }));
	};

	const submitProfile = async (event: React.FormEvent, mode: 'create' | 'update') => {
		event.preventDefault();
		if (savingProfile) return;

		try {
			setSavingProfile(true);
			setProfileError(null);

			if (!profileForm.fullName.trim() || !profileForm.dateOfBirth) {
				setProfileError('Full name and date of birth are required.');
				return;
			}

			const headers = await buildAuthHeaders();
			const endpoint = 'http://localhost:3001/patient/profile/me';
			const payload = {
				fullName: profileForm.fullName,
				dateOfBirth: profileForm.dateOfBirth,
				bloodType: profileForm.bloodType,
				phone: profileForm.phone,
				email: profileForm.email,
				emergencyContact: profileForm.emergencyContact,
			};

			const response = mode === 'create'
				? await axios.post(endpoint, payload, { headers })
				: await axios.put(endpoint, payload, { headers });

			const saved = response.data?.profile as PatientProfile;
			setProfile(saved);
			hydrateProfileForm(saved);
			setShowOnboarding(false);
			setShowEditProfile(false);
		} catch (error: any) {
			const detail = error?.response?.data?.error || error?.message || 'Failed to save patient profile';
			setProfileError(detail);
		} finally {
			setSavingProfile(false);
		}
	};

	const applyForDoctorAccess = async (event: React.FormEvent) => {
		event.preventDefault();
		if (isApplying) return;

		try {
			setIsApplying(true);
			setApplyError(null);
			setApplySuccess(null);

			if (!window.ethereum) {
				setApplyError('MetaMask is required to submit a verified doctor-access application.');
				return;
			}

			if (!professionalId.trim() || !credentialJwt.trim()) {
				setApplyError('Professional ID and Verifiable Credential are required.');
				return;
			}

			const provider = new ethers.BrowserProvider(window.ethereum);
			await provider.send('eth_requestAccounts', []);
			const signer = await provider.getSigner();
			const address = await signer.getAddress();
			const did = localStorage.getItem('hc_did') || '';
			const message = `Doctor access application for ${address} at ${new Date().toISOString()}`;
			const signature = await signer.signMessage(message);

			await axios.post('http://localhost:3001/auth/doctor/apply-vc', {
				address,
				did,
				professionalId: professionalId.trim(),
				credentialJwt: credentialJwt.trim(),
				message,
				signature,
			});

			setApplySuccess('Your credential has been verified and your Doctor role is now active. Log in again to enter the Doctor dashboard.');
			setProfessionalId('');
			setCredentialJwt('');
		} catch (error: any) {
			const details = error?.response?.data?.details || error?.response?.data?.error;
			setApplyError(details || 'Doctor access request failed. Please verify your VC and try again.');
		} finally {
			setIsApplying(false);
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

	const registerWithDoctor = async (event: React.FormEvent) => {
		event.preventDefault();
		if (registeringWithDoctor) return;

		const doctorWallet = doctorWalletInput.trim().toLowerCase();
		if (!doctorWallet) {
			setDoctorRegistrationError('Please enter or scan a doctor wallet address');
			return;
		}

		try {
			setRegisteringWithDoctor(true);
			setDoctorRegistrationError(null);

			const currentWallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
			const currentDid = String(localStorage.getItem('hc_did') || '').trim();

			if (!currentWallet || !currentDid) {
				setDoctorRegistrationError('Your wallet information is missing. Please log in again.');
				return;
			}

			const headers = await buildAuthHeaders();

			// POST to patient endpoint — authenticated as the patient themselves
			await axios.post(
				'http://localhost:3001/patient/register-with-doctor',
				{ doctorWallet },
				{ headers }
			);

			alert(`Successfully registered with doctor ${doctorWallet.substring(0, 10)}...!\n\nThe doctor can now see you in their patient list and issue credentials to you.`);
			setDoctorWalletInput('');
			setShowDoctorWalletInput(false);
		} catch (error: any) {
			const detail = error?.response?.data?.error || error?.message || 'Failed to register with doctor';
			setDoctorRegistrationError(detail);
		} finally {
			setRegisteringWithDoctor(false);
		}
	};

	return (
		<div className="patient-dashboard">
			<header className="patient-header">
				<h1>{profile?.fullName ? `Welcome, ${profile.fullName}` : 'Patient Dashboard'}</h1>
				<button className="btn logout" onClick={handleLogout}>Logout</button>
			</header>

			{profileError ? <div className="patient-error">{profileError}</div> : null}

			{profileLoading ? (
				<section className="patient-card"><p>Loading your profile...</p></section>
			) : null}

			{showOnboarding ? (
				<section className="patient-card">
					<h2>Complete your patient profile</h2>
					<p>This one-time onboarding personalizes your dashboard and secures your medical credential feed.</p>
					<form className="patient-form" onSubmit={(event) => submitProfile(event, 'create')}>
						<label htmlFor="fullName">Full name *</label>
						<input id="fullName" name="fullName" value={profileForm.fullName} onChange={handleProfileInput} required />

						<label htmlFor="dateOfBirth">Date of birth *</label>
						<input id="dateOfBirth" name="dateOfBirth" type="date" value={profileForm.dateOfBirth} onChange={handleProfileInput} required />

						<label htmlFor="bloodType">Blood type</label>
						<select id="bloodType" name="bloodType" value={profileForm.bloodType} onChange={handleProfileInput}>
							<option value="">Select blood type</option>
							<option value="A+">A+</option>
							<option value="A-">A-</option>
							<option value="B+">B+</option>
							<option value="B-">B-</option>
							<option value="AB+">AB+</option>
							<option value="AB-">AB-</option>
							<option value="O+">O+</option>
							<option value="O-">O-</option>
						</select>

						<label htmlFor="phone">Phone</label>
						<input id="phone" name="phone" value={profileForm.phone} onChange={handleProfileInput} />

						<label htmlFor="email">Email</label>
						<input id="email" name="email" type="email" value={profileForm.email} onChange={handleProfileInput} />

						<label htmlFor="emergencyContact">Emergency contact</label>
						<input id="emergencyContact" name="emergencyContact" value={profileForm.emergencyContact} onChange={handleProfileInput} />

						<button className="btn request" type="submit" disabled={savingProfile}>
							{savingProfile ? 'Saving profile...' : 'Save profile'}
						</button>
					</form>
				</section>
			) : null}

			{!showOnboarding && profile ? (
				<section className="patient-card">
					<h2>My Profile</h2>
					<div className="patient-profile-grid">
						<div><strong>Name:</strong> {profile.fullName || '-'}</div>
						<div><strong>Date of birth:</strong> {profile.dateOfBirth || '-'}</div>
						<div><strong>Blood type:</strong> {profile.bloodType || '-'}</div>
						<div><strong>Phone:</strong> {profile.phone || '-'}</div>
						<div><strong>Email:</strong> {profile.email || '-'}</div>
						<div><strong>Emergency:</strong> {profile.emergencyContact || '-'}</div>
					</div>
					<button className="btn request" onClick={() => setShowEditProfile((prev) => !prev)}>
						{showEditProfile ? 'Close Profile Editor' : 'Edit Profile'}
					</button>
				</section>
			) : null}

			{showEditProfile && profile ? (
				<section className="patient-card">
					<h2>Edit Patient Profile</h2>
					<form className="patient-form" onSubmit={(event) => submitProfile(event, 'update')}>
						<label htmlFor="editFullName">Full name *</label>
						<input id="editFullName" name="fullName" value={profileForm.fullName} onChange={handleProfileInput} required />

						<label htmlFor="editDateOfBirth">Date of birth *</label>
						<input id="editDateOfBirth" name="dateOfBirth" type="date" value={profileForm.dateOfBirth} onChange={handleProfileInput} required />

						<label htmlFor="editBloodType">Blood type</label>
						<select id="editBloodType" name="bloodType" value={profileForm.bloodType} onChange={handleProfileInput}>
							<option value="">Select blood type</option>
							<option value="A+">A+</option>
							<option value="A-">A-</option>
							<option value="B+">B+</option>
							<option value="B-">B-</option>
							<option value="AB+">AB+</option>
							<option value="AB-">AB-</option>
							<option value="O+">O+</option>
							<option value="O-">O-</option>
						</select>

						<label htmlFor="editPhone">Phone</label>
						<input id="editPhone" name="phone" value={profileForm.phone} onChange={handleProfileInput} />

						<label htmlFor="editEmail">Email</label>
						<input id="editEmail" name="email" type="email" value={profileForm.email} onChange={handleProfileInput} />

						<label htmlFor="editEmergencyContact">Emergency contact</label>
						<input id="editEmergencyContact" name="emergencyContact" value={profileForm.emergencyContact} onChange={handleProfileInput} />

						<button className="btn request" type="submit" disabled={savingProfile}>
							{savingProfile ? 'Updating profile...' : 'Update profile'}
						</button>
					</form>
				</section>
			) : null}

			<section className="patient-card">
				<h2>Register with a Doctor</h2>
				<p>Scan your doctor's QR code or enter their wallet address to allow them to issue credentials to you.</p>
				<button className="btn request" onClick={() => setShowDoctorWalletInput((prev) => !prev)}>
					{showDoctorWalletInput ? 'Cancel' : 'Scan/Enter Doctor Wallet'}
				</button>

				{showDoctorWalletInput ? (
					<form className="doctor-wallet-form" onSubmit={registerWithDoctor}>
						<label htmlFor="doctorWallet">Doctor Wallet Address (from QR code scan)</label>
						<input
							id="doctorWallet"
							type="text"
							value={doctorWalletInput}
							onChange={(event) => setDoctorWalletInput(event.target.value)}
							placeholder="Paste doctor's wallet address here (or QR scan result)"
							disabled={registeringWithDoctor}
						/>
						{doctorRegistrationError ? <div className="doctor-apply-error">{doctorRegistrationError}</div> : null}
						<button type="submit" className="btn request" disabled={registeringWithDoctor || !doctorWalletInput.trim()}>
							{registeringWithDoctor ? 'Registering...' : 'Register with Doctor'}
						</button>
					</form>
				) : null}
			</section>

			<section className="patient-card">
				<h2>Vaccination Certificates</h2>
				{credentialsError ? <div className="doctor-apply-error">{credentialsError}</div> : null}
				{credentialsLoading ? <p>Loading credentials...</p> : null}
				{!credentialsLoading && credentials.length === 0 ? (
					<p>No doctor-issued credentials found yet.</p>
				) : null}

				<div className="credential-list">
					{credentials.map((entry, index) => {
						const subject = parseCredentialSubject(entry.credential);
						return (
							<article key={`${entry.issuedAt}-${index}`} className="credential-card">
								<h3>{entry.credentialType}</h3>
								<p><strong>Issued:</strong> {new Date(entry.issuedAt).toLocaleString()}</p>
								<p><strong>Doctor:</strong> {entry.issuerName || 'Unknown doctor'}</p>
								<p><strong>Vaccine Type:</strong> {subject?.vaccineType ? String(subject.vaccineType) : 'Not specified'}</p>
								{subject?.name ? <p><strong>Subject name:</strong> {String(subject.name)}</p> : null}

							</article>
						);
					})}
				</div>
			</section>

			<section className="doctor-apply-card">
				<h2>Professional Access</h2>
				<p>
					Are you a medical professional?
				</p>
				<button className="btn request" onClick={() => setShowDoctorApply(prev => !prev)}>
					{showDoctorApply ? 'Hide Doctor Application' : 'Apply for Doctor Access'}
				</button>

				{showDoctorApply ? (
					<form className="doctor-apply-form" onSubmit={applyForDoctorAccess}>
						<label htmlFor="professionalId">Medical license or employee ID</label>
						<input
							id="professionalId"
							type="text"
							value={professionalId}
							onChange={(event) => setProfessionalId(event.target.value)}
							placeholder="e.g. MOH-123456"
							required
						/>

						<label htmlFor="credentialJwt">Ministry-issued Verifiable Credential (JWT)</label>
						<textarea
							id="credentialJwt"
							value={credentialJwt}
							onChange={(event) => setCredentialJwt(event.target.value)}
							placeholder="Paste your signed VC JWT here"
							required
						/>

						{applyError ? <div className="doctor-apply-error">{applyError}</div> : null}
						{applySuccess ? <div className="doctor-apply-success">{applySuccess}</div> : null}

						<button type="submit" className="btn request" disabled={isApplying}>
							{isApplying ? 'Verifying credential...' : 'Submit Doctor Access Application'}
						</button>
					</form>
				) : null}
			</section>

			<footer className="patient-footer">
				<small>HealthChain • Patient portal</small>
			</footer>
		</div>
	);
};

export default PatientDashboard;
