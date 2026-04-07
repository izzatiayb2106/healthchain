import React, { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { QRCodeSVG } from 'qrcode.react';
import { apiClient, denyRoleAccess, getStoredToken, logoutWithAudit } from '../../services/authService';
import { assertCredentialRegistryDeployed, getCredentialRegistryAddress, getCredentialRegistryContract, mapChainRecordTuple, type HybridChainRecord } from '../../blockchain/credentialRegistry';
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
	encryptionPublicKey?: string;
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
	mode?: 'hybrid' | 'legacy';
	cid?: string | null;
	payloadHash?: string | null;
	recordId?: string | null;
	txHash?: string | null;
	chainId?: string | null;
	contractAddress?: string | null;
};

type QrSession = {
	qrPayload: string;
	expiresAt: string;
	expiresAtUtc?: string;
	serverNowUtc?: string;
	serverNowEpochMs?: number;
	expiresAtEpochMs?: number;
	expiresInSeconds?: number;
	issuedAt: string;
	credentialType: string;
};

type HybridDecryptedView = {
	vcJwt: string;
	payloadHash: string;
	cid: string;
};

type DecodedVcJwt = {
	issuer?: string;
	issuanceDate?: string;
	exp?: number;
	vc?: {
		type?: string[];
		credentialSubject?: Record<string, unknown>;
	};
};

const emptyProfileForm = {
	fullName: '',
	dateOfBirth: '',
	bloodType: '',
	phone: '',
	email: '',
	emergencyContact: '',
};

const CHAIN_READ_RPC_URL = String(import.meta.env.VITE_CHAIN_READ_RPC_URL || 'http://127.0.0.1:8545').trim();

function normalizeHash(value: string) {
	const trimmed = String(value || '').trim().toLowerCase();
	if (!trimmed) {
		return '';
	}
	return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

async function sha256Hex(input: string) {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(String(input || ''));
	const digest = await window.crypto.subtle.digest('SHA-256', bytes);
	return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

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
	const [qrLoadingForIssuedAt, setQrLoadingForIssuedAt] = useState<string | null>(null);
	const [qrError, setQrError] = useState<string | null>(null);
	const [qrSession, setQrSession] = useState<QrSession | null>(null);
	const [qrSecondsRemaining, setQrSecondsRemaining] = useState<number>(0);
	const [hybridRecords, setHybridRecords] = useState<HybridChainRecord[]>([]);
	const [hybridLoading, setHybridLoading] = useState(false);
	const [hybridError, setHybridError] = useState<string | null>(null);
	const [selectedHybridRecordId, setSelectedHybridRecordId] = useState<string | null>(null);
	const [hybridDecrypted, setHybridDecrypted] = useState<HybridDecryptedView | null>(null);
	const [hybridQrPayload, setHybridQrPayload] = useState<string | null>(null);
	const [hybridPayloadCopyStatus, setHybridPayloadCopyStatus] = useState<string | null>(null);
	const encryptionKeyRegistrationTriedRef = useRef(false);



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

			try {
				const profileRes = await apiClient.get('/patient/profile/me');
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

			const credentialsRes = await apiClient.get('/patient/credentials/me');
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

	const registerEncryptionPublicKey = async () => {
		try {
			if (!window.ethereum) return;
			const wallet = String(localStorage.getItem('hc_wallet') || '').trim();
			if (!wallet) {
				console.warn('[ENCRYPTION] No wallet in localStorage');
				return;
			}

			const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
			const selectedAccountRaw = String(accounts?.[0] || '').trim();
			const selectedAccountLower = selectedAccountRaw.toLowerCase();
			if (!selectedAccountRaw) {
				console.warn('[ENCRYPTION] No selected MetaMask account found');
				return;
			}
			if (selectedAccountLower !== wallet.toLowerCase()) {
				console.warn('[ENCRYPTION] Selected account differs from stored wallet', {
					selectedAccount: selectedAccountRaw,
					storedWallet: wallet,
				});
			}

			console.log(`[ENCRYPTION] Getting encryption public key for wallet: ${selectedAccountRaw}`);
			const encryptionPublicKey = await window.ethereum.request({
				method: 'eth_getEncryptionPublicKey',
				params: [selectedAccountRaw],
			});

			if (!String(encryptionPublicKey || '').trim()) {
				console.warn('[ENCRYPTION] Empty encryption public key returned from MetaMask');
				return;
			}

			console.log('[ENCRYPTION] Registering encryption public key with backend');
			await apiClient.post(
				'/patient/profile/me/encryption-key',
				{ encryptionPublicKey }
			);
			console.log('[ENCRYPTION] Successfully registered encryption public key');
		} catch (error: any) {
			// User may reject permission. Hybrid issuance can be retried after consent.
			console.error('[ENCRYPTION] Failed to register encryption key:', error?.message || error);
		}
	};

	const loadHybridRecords = async () => {
		try {
			setHybridLoading(true);
			setHybridError(null);
			setHybridDecrypted(null);

			const registryAddress = getCredentialRegistryAddress();
			if (!registryAddress) {
				setHybridError('VITE_CREDENTIAL_REGISTRY_ADDRESS is not configured.');
				return;
			}

			const wallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
			if (!wallet) {
				setHybridError('No wallet found. Please log in again.');
				return;
			}

			console.log('Loading hybrid records:', { registryAddress, wallet, rpcUrl: CHAIN_READ_RPC_URL });
			
			const provider = new ethers.JsonRpcProvider(CHAIN_READ_RPC_URL);
			await assertCredentialRegistryDeployed(provider, registryAddress);
			const contract = getCredentialRegistryContract(provider);

			const count = Number(await contract.getPatientRecordCount(wallet));
			console.log('Patient record count:', count);
			
			const records: HybridChainRecord[] = [];
			for (let index = 0; index < count; index += 1) {
				try {
					const tuple = await contract.getPatientRecordAt(wallet, index);
					console.log(`Record ${index}:`, tuple);
					records.push(mapChainRecordTuple(tuple));
				} catch (recordError: any) {
					console.error(`Failed to load record ${index}:`, recordError);
				}
			}

			console.log('Loaded hybrid records:', records);
			records.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
			setHybridRecords(records);
		} catch (error: any) {
			const raw = String(error?.shortMessage || error?.message || '').toLowerCase();
			const detail =
				error?.response?.data?.error ||
				((raw.includes('unrecognized selector') || raw.includes('missing revert data') || raw.includes('call exception'))
					? 'Configured contract address does not match CredentialRegistry on this network. Redeploy, update VITE_CREDENTIAL_REGISTRY_ADDRESS, and restart frontend.'
					: null) ||
				(error?.code === 'BAD_DATA'
					? 'Unable to read CredentialRegistry. Contract address or selected network is incorrect.'
					: error?.message) ||
				'Failed to load on-chain records';
			console.error('loadHybridRecords error:', error);
			setHybridError(detail);
		} finally {
			setHybridLoading(false);
		}
	};

	const decryptHybridRecord = async (record: HybridChainRecord) => {
		try {
			setSelectedHybridRecordId(record.recordId);
			setHybridError(null);
			setHybridDecrypted(null);

			if (!window.ethereum) {
				setHybridError('MetaMask is required for decryption.');
				return;
			}

			// Check wallet
			const wallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
			if (!wallet) {
				setHybridError('No wallet found. Please log in again.');
				return;
			}
			console.log(`[DECRYPT] Decrypting for credential ${record.recordId}, wallet: ${wallet}`);

			// Get current MetaMask account
			const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
			const selectedAccountRaw = String(accounts?.[0] || '').trim();
			const currentAccount = selectedAccountRaw.toLowerCase();
			console.log(`[DECRYPT] Current MetaMask account: ${currentAccount}, expected wallet: ${wallet}`);
			
			if (currentAccount !== wallet) {
				setHybridError(
					`MetaMask account mismatch:\n` +
					`Currently selected: ${currentAccount}\n` +
					`Expected wallet: ${wallet}\n\n` +
					`Please switch to the correct account in MetaMask that matches your patient wallet.`
				);
				return;
			}

			console.log(`[DECRYPT] Fetching encrypted payload from backend (CID: ${record.cid})`);
			const payloadRes = await apiClient.get(`/credential/hybrid/cid/${encodeURIComponent(record.cid)}`);
			const encryptedCredentialHex = String(payloadRes.data?.encryptedCredentialHex || '').trim();
			const expectedHash = String(payloadRes.data?.payloadHash || record.payloadHash || '').trim();
			
			console.log('[DECRYPT] Backend response:', {
				cid: record.cid,
				hasEncryptedHex: !!encryptedCredentialHex,
				hexLength: encryptedCredentialHex?.length,
				hexStart: encryptedCredentialHex?.substring(0, 20),
				payloadHash: expectedHash,
			});
			
			if (!encryptedCredentialHex) {
				setHybridError(
					'Encrypted payload not found for selected record.\n\n' +
					'The credential may not have been properly encrypted during issuance.\n' +
					'This typically happens if:\n' +
					'• Your encryption public key was not registered\n' +
					'• The Pinata/IPFS upload failed\n' +
					'• There was a backend error during credential preparation\n\n' +
					'Solution: Request a new credential from your doctor.\n' +
					'Make sure to approve the encryption key permission when prompted.'
				);
				return;
			}
			console.log(`[DECRYPT] Got encrypted payload, hash: ${expectedHash}`);

			console.log(`[DECRYPT] Validating payload integrity locally`);
			const localHash = normalizeHash(await sha256Hex(encryptedCredentialHex));
			if (!localHash || localHash !== normalizeHash(expectedHash)) {
				setHybridError('Integrity check failed. Payload hash mismatch.');
				return;
			}

			// Validate hex format before sending to MetaMask
			if (!encryptedCredentialHex.startsWith('0x')) {
				setHybridError('Invalid encrypted data format: Missing 0x prefix. The credential may be corrupted.');
				return;
			}
			if (encryptedCredentialHex.length < 10) {
				setHybridError('Invalid encrypted data format: Data too short. The credential may be corrupted or empty.');
				return;
			}
			const isValidHex = /^0x[0-9a-fA-F]*$/.test(encryptedCredentialHex);
			if (!isValidHex) {
				setHybridError('Invalid encrypted data format: Not valid hexadecimal. The credential data may be corrupted.');
				return;
			}

			console.log(`[DECRYPT] Encrypted data format valid, requesting MetaMask to decrypt...`, {
				isHex: true,
				startsWithPrefix: true,
				length: encryptedCredentialHex.length,
			});
			
			const vcJwt = await window.ethereum.request({
				method: 'eth_decrypt',
				params: [encryptedCredentialHex, selectedAccountRaw],
			});

			if (!vcJwt) {
				setHybridError('MetaMask returned empty JWT. Decryption may have failed.');
				return;
			}

			console.log(`[DECRYPT] Successfully decrypted credential`);
			setHybridDecrypted({
				vcJwt: String(vcJwt),
				payloadHash: expectedHash,
				cid: record.cid,
			});
		} catch (error: any) {
			console.error('[DECRYPT] Decryption error:', error);
			const detail = error?.response?.data?.error || error?.message || 'Failed to decrypt on-chain record';
			setHybridError(
				`Decryption failed:\n${detail}\n\n` +
				`Check browser console ([DECRYPT] logs) for details.`
			);
		} finally {
			setSelectedHybridRecordId(null);
		}
	};

	const openHybridQr = (record: HybridChainRecord) => {
		const contractAddress = getCredentialRegistryAddress();
		if (!contractAddress) {
			setHybridError('VITE_CREDENTIAL_REGISTRY_ADDRESS is not configured.');
			return;
		}

		setHybridPayloadCopyStatus(null);
		setHybridQrPayload(JSON.stringify({
			type: 'healthchain-hybrid-record',
			contractAddress,
			recordId: record.recordId,
			cid: record.cid,
			payloadHash: record.payloadHash,
		}));
	};

	const copyHybridPayload = async () => {
		if (!hybridQrPayload) return;
		try {
			await navigator.clipboard.writeText(hybridQrPayload);
			setHybridPayloadCopyStatus('Payload copied. Paste it into verifier dashboard.');
		} catch {
			setHybridPayloadCopyStatus('Copy failed. Select and copy the payload text manually.');
		}
	};

	useEffect(() => {
		const role = String(localStorage.getItem('hc_role') || '').toLowerCase();
		if (role !== 'patient') {
			void denyRoleAccess({ requiredRole: 'patient', requestedPath: '/patient' });
			return;
		}

		void loadDashboardData();
		void loadHybridRecords();
	}, []);

	useEffect(() => {
		if (!profile || String(profile.encryptionPublicKey || '').trim()) {
			return;
		}
		if (encryptionKeyRegistrationTriedRef.current) {
			return;
		}
		encryptionKeyRegistrationTriedRef.current = true;
		void registerEncryptionPublicKey();
	}, [profile]);

	// Set up SSE connection for real-time credential updates
	useEffect(() => {
		const token = getStoredToken();
		if (!token) {
			console.log('[SSE] No JWT token available for SSE connection');
			return;
		}

		try {
			console.log('[SSE] Connecting to credential events...');
			const eventSource = new EventSource(`http://localhost:3001/auth/events?token=${encodeURIComponent(token)}`);

			const handleCredentialIssued = () => {
				console.log('[SSE] Received credential-issued event, reloading credentials...');
				void loadDashboardData();
				void loadHybridRecords();
			};

			const handleCredentialFinalized = () => {
				console.log('[SSE] Received credential-finalized event, reloading hybrid records...');
				void loadHybridRecords();
			};

			eventSource.addEventListener('credential-issued', handleCredentialIssued);
			eventSource.addEventListener('credential-finalized', handleCredentialFinalized);

			eventSource.addEventListener('error', (error: any) => {
				console.error('[SSE] Connection error:', error);
				eventSource.close();
			});

			return () => {
				console.log('[SSE] Closing connection');
				eventSource.removeEventListener('credential-issued', handleCredentialIssued);
				eventSource.removeEventListener('credential-finalized', handleCredentialFinalized);
				eventSource.close();
			};
		} catch (error) {
			console.error('[SSE] Failed to set up connection:', error);
		}
	}, []);

	useEffect(() => {
		if (!qrSession) {
			setQrSecondsRemaining(0);
			return;
		}

		const expiresAtEpochMs = Number(qrSession.expiresAtEpochMs || 0);
		const serverNowEpochMs = Number(qrSession.serverNowEpochMs || 0);
		if (!expiresAtEpochMs || !serverNowEpochMs) {
			setQrSecondsRemaining(Math.max(0, Number(qrSession.expiresInSeconds || 0)));
			return;
		}

		const clientSkewMs = serverNowEpochMs - Date.now();
		const tick = () => {
			const serverAlignedNow = Date.now() + clientSkewMs;
			setQrSecondsRemaining(Math.max(0, Math.floor((expiresAtEpochMs - serverAlignedNow) / 1000)));
		};

		tick();
		const timer = window.setInterval(tick, 1000);
		return () => window.clearInterval(timer);
	}, [qrSession]);

	const handleLogout = async () => {
		await logoutWithAudit();
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

			const payload = {
				fullName: profileForm.fullName,
				dateOfBirth: profileForm.dateOfBirth,
				bloodType: profileForm.bloodType,
				phone: profileForm.phone,
				email: profileForm.email,
				emergencyContact: profileForm.emergencyContact,
			};

			const response = mode === 'create'
				? await apiClient.post('/patient/profile/me', payload)
				: await apiClient.put('/patient/profile/me', payload);

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

	const decodeVcJwt = (jwt: string): DecodedVcJwt | null => {
		try {
			const parts = String(jwt || '').split('.');
			if (parts.length < 2) return null;
			const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
			return payload as DecodedVcJwt;
		} catch {
			return null;
		}
	};

	const openCredentialQr = async (entry: DoctorIssuedCredential) => {
		try {
			setQrError(null);
			setQrLoadingForIssuedAt(entry.issuedAt);
			const response = await apiClient.post(
				'/credential/qr/create',
				{ issuedAt: entry.issuedAt, credentialType: entry.credentialType }
			);

			setQrSession({
				qrPayload: String(response.data?.qrPayload || ''),
				expiresAt: String(response.data?.expiresAt || ''),
				expiresAtUtc: String(response.data?.expiresAtUtc || ''),
				serverNowUtc: String(response.data?.serverNowUtc || ''),
				serverNowEpochMs: Number(response.data?.serverNowEpochMs || 0),
				expiresAtEpochMs: Number(response.data?.expiresAtEpochMs || 0),
				expiresInSeconds: Number(response.data?.expiresInSeconds || 0),
				issuedAt: entry.issuedAt,
				credentialType: entry.credentialType,
			});
		} catch (error: any) {
			const detail = error?.response?.data?.error || error?.message || 'Failed to generate QR code';
			setQrError(detail);
		} finally {
			setQrLoadingForIssuedAt(null);
		}
	};

	const closeQrModal = () => {
		setQrSession(null);
		setQrSecondsRemaining(0);
	};

	const onChainCredentialKeys = new Set(
		hybridRecords.map((record) => `${String(record.cid || '').trim()}|${String(record.payloadHash || '').trim().toLowerCase()}`)
	);

	const pendingHybridCredentials = credentials.filter(
		(entry) =>
			entry.mode === 'hybrid' &&
			(!String(entry.recordId || '').trim() || !String(entry.contractAddress || '').trim()) &&
			!onChainCredentialKeys.has(
				`${String(entry.cid || '').trim()}|${String(entry.payloadHash || '').trim().toLowerCase()}`
			)
	);

	const decodedHybrid = hybridDecrypted ? decodeVcJwt(hybridDecrypted.vcJwt) : null;
	const decodedSubject = decodedHybrid?.vc?.credentialSubject || null;
	const patientName = String(decodedSubject?.patientName || decodedSubject?.name || 'N/A');
	const vaccineType = String(decodedSubject?.vaccineType || 'N/A');
	const batchNumber = String(decodedSubject?.batchNumber || 'N/A');
	const manufacturer = String(decodedSubject?.manufacturer || 'N/A');
	const hospitalOrClinic = String(decodedSubject?.hospitalOrClinic || 'N/A');
	const credentialProfessionalId = String(decodedSubject?.professionalId || decodedSubject?.licenseNumber || 'N/A');
	const expirationRaw = String(decodedSubject?.expirationDate || decodedSubject?.expirationPolicy || '').trim();
	const expirationDate = expirationRaw
		? (/^lifetime$/i.test(expirationRaw)
			? 'Lifetime'
			: (Number.isNaN(Date.parse(expirationRaw)) ? expirationRaw : new Date(expirationRaw).toLocaleString()))
		: (decodedHybrid?.exp ? new Date(decodedHybrid.exp * 1000).toLocaleString() : 'N/A');

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

			// POST to patient endpoint — authenticated as the patient themselves
			await apiClient.post(
				'/patient/register-with-doctor',
				{ doctorWallet }
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

				<div className="scanner-actions">
					<button className="btn request" type="button" onClick={() => void loadHybridRecords()} disabled={hybridLoading}>
						{hybridLoading ? 'Refreshing records...' : 'Refresh'}
					</button>
				</div>
				<p>
					<strong>On-chain:</strong> {hybridRecords.length} record(s) • <strong>Pending finalization:</strong> {pendingHybridCredentials.length}
				</p>
				{qrError ? <div className="doctor-apply-error">{qrError}</div> : null}
				{credentialsError ? <div className="doctor-apply-error">{credentialsError}</div> : null}
				{hybridError ? <div className="doctor-apply-error">{hybridError}</div> : null}
				{credentialsLoading || hybridLoading ? <p>Loading credentials...</p> : null}
				{!credentialsLoading && !hybridLoading && pendingHybridCredentials.length === 0 && hybridRecords.length === 0 ? (
					<p>No credentials found yet.</p>
				) : null}

				<div className="credential-list">
					{credentials.filter((entry) => entry.mode !== 'hybrid').map((entry, index) => {
						const subject = parseCredentialSubject(entry.credential);
						const isGeneratingQr = qrLoadingForIssuedAt === entry.issuedAt;
						const isLegacy = entry.mode !== 'hybrid';
						return (
							<article
								key={`${entry.issuedAt}-${index}`}
								className={`credential-card ${isLegacy ? 'credential-card-clickable' : ''}`}
								onClick={isLegacy ? (() => void openCredentialQr(entry)) : undefined}
							>
								<h3>{entry.credentialType}</h3>
						
								<p><strong>Issued:</strong> {new Date(entry.issuedAt).toLocaleString()}</p>
								<p><strong>Doctor:</strong> {entry.issuerName || 'Unknown doctor'}</p>
								{isLegacy ? (
									<>
										<p><strong>Vaccine Type:</strong> {subject?.vaccineType ? String(subject.vaccineType) : 'Not specified'}</p>
										{subject?.name ? <p><strong>Subject name:</strong> {String(subject.name)}</p> : null}
										<p className="credential-qr-hint">{isGeneratingQr ? 'Generating secure QR...' : 'Tap to generate verifier QR'}</p>
									</>
								) : (
									<>
										<p><strong>Record ID:</strong> {entry.recordId || 'Pending'}</p>
										<p><strong>CID:</strong> {entry.cid || 'Not available'}</p>
										<p><strong>Payload Hash:</strong> {entry.payloadHash || 'Not available'}</p>
									</>
								)}
							</article>
						);
					})}

					{pendingHybridCredentials.map((entry, index) => (
						<article key={`pending-hybrid-${entry.issuedAt}-${index}`} className="credential-card">
							<h3>{entry.credentialType}</h3>
							<p><strong>Issued:</strong> {new Date(entry.issuedAt).toLocaleString()}</p>
							<p><strong>Doctor:</strong> {entry.issuerName || 'Unknown doctor'}</p>
							<p><strong>CID:</strong> {entry.cid || 'Not available'}</p>
							<p><strong>Payload Hash:</strong> {entry.payloadHash || 'Not available'}</p>
							<p><strong>Status:</strong> Waiting for on-chain confirmation</p>
						</article>
					))}

					{hybridRecords.map((record) => {
						return (
						<article key={`hybrid-${record.recordId}`} className="credential-card">
							<h3>{record.credentialType}</h3>
							
							<p><strong>Record ID:</strong> {record.recordId}</p>
							<p><strong>CID:</strong> {record.cid}</p>
							<p><strong>Payload Hash:</strong> {record.payloadHash}</p>
							<p><strong>Issued:</strong> {new Date(record.issuedAt).toLocaleString()}</p>
							<div className="scanner-actions">
								<button
									type="button"
									className="btn request"
									onClick={() => void decryptHybridRecord(record)}
									disabled={selectedHybridRecordId === record.recordId}
								>
									{selectedHybridRecordId === record.recordId ? 'Decrypting...' : 'Decrypt with Wallet'}
								</button>
								<button type="button" className="btn request" onClick={() => openHybridQr(record)}>
									Generate Verification QR
								</button>
							</div>
						</article>
						);
					})}
				</div>
			</section>

				{hybridDecrypted ? (
					<div
						className="modal-overlay"
						onClick={() => setHybridDecrypted(null)}
					>
						<div
							className="credential-qr-modal credential-details-modal"
							onClick={(event) => event.stopPropagation()}
						>
							<div className="credential-details-header">
								<h3>Credential Details</h3>
								<button
									type="button"
									className="btn-close-details"
									onClick={() => setHybridDecrypted(null)}
									title="Close credential details"
								>
									✕
								</button>
							</div>

							<div className="credential-summary-grid">
								<div className="credential-summary-item">
									<span className="credential-summary-label">Patient Name</span>
									<span className="credential-summary-value">{patientName}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Vaccine Type</span>
									<span className="credential-summary-value">{vaccineType}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Hospital</span>
									<span className="credential-summary-value">{hospitalOrClinic}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Expiration Date</span>
									<span className="credential-summary-value">{expirationDate}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Batch Number</span>
									<span className="credential-summary-value">{batchNumber}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Manufacturer</span>
									<span className="credential-summary-value">{manufacturer}</span>
								</div>
								<div className="credential-summary-item">
									<span className="credential-summary-label">Professional ID</span>
									<span className="credential-summary-value">{credentialProfessionalId}</span>
								</div>
							</div>
						</div>
					</div>
				) : null}

			{qrSession ? (
				<div className="modal-overlay" onClick={closeQrModal}>
					<div className="credential-qr-modal" onClick={(event) => event.stopPropagation()}>
						<h2>Verifier-Only Credential QR</h2>
						<p><strong>Credential:</strong> {qrSession.credentialType}</p>
						<p><strong>Issued:</strong> {new Date(qrSession.issuedAt).toLocaleString()}</p>
						<p><strong>Expires (local):</strong> {qrSession.expiresAt ? new Date(qrSession.expiresAt).toLocaleString() : 'Soon'}</p>
						<p><strong>Expires (UTC):</strong> {qrSession.expiresAtUtc || qrSession.expiresAt || 'Soon'}</p>
						<p><strong>Server time (UTC):</strong> {qrSession.serverNowUtc || 'N/A'}</p>
						<p><strong>Remaining (seconds):</strong> {qrSecondsRemaining}</p>
						<div className="credential-qr-code-wrap">
							<QRCodeSVG value={qrSession.qrPayload} size={220} includeMargin />
						</div>
						<p className="credential-qr-note">Only users logged in with verifier role can verify this QR token. If token is expired, generate a fresh QR from this card and verify immediately.</p>
						<button type="button" className="btn request" onClick={closeQrModal}>Close</button>
					</div>
				</div>
			) : null}

			{hybridQrPayload ? (
				<div
					className="modal-overlay"
					onClick={() => {
						setHybridQrPayload(null);
						setHybridPayloadCopyStatus(null);
					}}
				>
					<div className="credential-qr-modal" onClick={(event) => event.stopPropagation()}>
						<h2>Hybrid Verification QR</h2>
						<div className="credential-qr-code-wrap">
							<QRCodeSVG value={hybridQrPayload} size={220} includeMargin />
						</div>
						<p><strong>Copyable Payload (testing):</strong></p>
						<textarea
							className="hybrid-payload-textarea"
							value={hybridQrPayload}
							readOnly
						/>
						<div className="scanner-actions" style={{ marginBottom: '8px' }}>
							<button type="button" className="btn request" onClick={() => void copyHybridPayload()}>
								Copy Payload
							</button>
						</div>
						{hybridPayloadCopyStatus ? <p className="credential-qr-note">{hybridPayloadCopyStatus}</p> : null}
						<p className="credential-qr-note">This QR includes contract address, record ID, CID, and hash for on-chain integrity validation.</p>
						<button
							type="button"
							className="btn request"
							onClick={() => {
								setHybridQrPayload(null);
								setHybridPayloadCopyStatus(null);
							}}
						>
							Close
						</button>
					</div>
				</div>
			) : null}

			<footer className="patient-footer">
				<small>HealthChain • Patient portal</small>
			</footer>
		</div>
	);
};

export default PatientDashboard;
