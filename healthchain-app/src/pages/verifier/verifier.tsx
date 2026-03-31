import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import { Html5Qrcode } from 'html5-qrcode';
import { assertCredentialRegistryDeployed, getCredentialRegistryContract } from '../../blockchain/credentialRegistry';
import './verifier.css';

type VerifiedCredential = {
	verifiedBy: string;
	subjectDid: string;
	issuedAt: string;
	credentialType: string;
	credential: any;
};

type HybridVerifyResult = {
	valid: boolean;
	recordId: string;
	cid: string;
	payloadHash: string;
	contractAddress: string;
};

const VerifierDashboard: React.FC = () => {
	const readerElementId = 'verifier-qr-reader';
	const scannerRef = useRef<Html5Qrcode | null>(null);

	const [tokenOrPayload, setTokenOrPayload] = useState('');
	const [verifying, setVerifying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<VerifiedCredential | null>(null);
	const [hybridResult, setHybridResult] = useState<HybridVerifyResult | null>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const [isScanning, setIsScanning] = useState(false);

	const buildAuthHeaders = async () => {
		const wallet = String(localStorage.getItem('hc_wallet') || '').trim().toLowerCase();
		if (!wallet) {
			throw new Error('No wallet found. Please log in again.');
		}

		if (!(window as any).ethereum) {
			throw new Error('MetaMask is required for verifier access.');
		}

		const provider = new ethers.BrowserProvider((window as any).ethereum);
		await provider.send('eth_requestAccounts', []);
		const signer = await provider.getSigner();
		const activeWallet = (await signer.getAddress()).toLowerCase();
		if (activeWallet !== wallet) {
			throw new Error('Please switch MetaMask to the same wallet used at login.');
		}

		const message = `Verifier access auth for ${wallet} at ${new Date().toISOString()}`;
		const signature = await signer.signMessage(message);

		return {
			'x-user-wallet': wallet,
			'x-user-message': message,
			'x-user-signature': signature,
		};
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
 
	const handleLogout = () => {
		localStorage.removeItem('hc_wallet');
		localStorage.removeItem('hc_did');
		localStorage.removeItem('hc_role');
		window.location.href = '/login';
	};

	const verifyQrValue = async (rawValue: string) => {
		if (verifying) return;

		const value = rawValue.trim();
		if (!value) {
			setError('Please paste scanned QR payload/token.');
			return;
		}

		try {
			setVerifying(true);
			setError(null);
			setResult(null);
			setHybridResult(null);

			try {
				const parsed = JSON.parse(value);
				if (parsed?.type === 'healthchain-hybrid-record') {
					if (!(window as any).ethereum) {
						throw new Error('MetaMask is required for on-chain verification.');
					}

					const provider = new ethers.BrowserProvider((window as any).ethereum);
					const hybridContractAddress = String(parsed.contractAddress || '').trim();
					await assertCredentialRegistryDeployed(provider, hybridContractAddress);
					const contract: any = getCredentialRegistryContract(provider, hybridContractAddress);
					const valid = await contract.verifyRecord(
						BigInt(String(parsed.recordId || '0')),
						String(parsed.cid || ''),
						String(parsed.payloadHash || '')
					);

					setHybridResult({
						valid: Boolean(valid),
						recordId: String(parsed.recordId || ''),
						cid: String(parsed.cid || ''),
						payloadHash: String(parsed.payloadHash || ''),
						contractAddress: String(parsed.contractAddress || ''),
					});
					return;
				}
			} catch {
				// Not a hybrid JSON payload, continue with session-token verification.
			}

			const headers = await buildAuthHeaders();
			const response = await axios.post(
				'http://localhost:3001/credential/qr/verify',
				{ tokenOrPayload: value },
				{ headers }
			);
			setResult(response.data as VerifiedCredential);
		} catch (err: any) {
			const detail =
				err?.response?.data?.error ||
				(err?.code === 'BAD_DATA'
					? 'Unable to read CredentialRegistry. Contract address or selected network is incorrect.'
					: err?.message) ||
				'Failed to verify credential QR';
			setError(detail);
			if (detail.toLowerCase().includes('token is invalid') || detail.toLowerCase().includes('invalid or expired')) {
				window.alert('Token invalid or expired. Please generate a new QR from the latest patient credential card.');
			}
		} finally {
			setVerifying(false);
		}
	};

	const verifyQr = async (event: React.FormEvent) => {
		event.preventDefault();
		await verifyQrValue(tokenOrPayload);
	};

	const stopScanner = async () => {
		const scanner = scannerRef.current;
		if (!scanner) {
			setIsScanning(false);
			return;
		}

		try {
			await scanner.stop();
		} catch {
			// Scanner can already be stopped; ignore stop errors.
		}

		try {
			await scanner.clear();
		} catch {
			// Ignore cleanup errors.
		}

		scannerRef.current = null;
		setIsScanning(false);
	};

	const startScanner = async () => {
		if (isScanning || scannerRef.current) return;

		try {
			setScanError(null);
			const cameras = await Html5Qrcode.getCameras();
			if (!Array.isArray(cameras) || cameras.length === 0) {
				setScanError('No camera found on this device.');
				return;
			}

			const scanner = new Html5Qrcode(readerElementId);
			scannerRef.current = scanner;

			await scanner.start(
				{ deviceId: { exact: cameras[0].id } },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				(decodedText) => {
					setTokenOrPayload(decodedText);
					void verifyQrValue(decodedText);
					void stopScanner();
				},
				() => {
					// Ignore decode misses while scanning.
				}
			);

			setIsScanning(true);
		} catch (err: any) {
			scannerRef.current = null;
			setIsScanning(false);
			setScanError(err?.message || 'Unable to start camera scanner.');
		}
	};

	useEffect(() => {
		const role = String(localStorage.getItem('hc_role') || '').toLowerCase();
		if (role !== 'verifier') {
			window.location.href = '/login';
			return;
		}

		return () => {
			void stopScanner();
		};
	}, []);

	const subject = parseCredentialSubject(result?.credential);

	return (
		<div className="verifier-dashboard">
			<header className="verifier-header">
				<h1>Verifier Dashboard</h1>
				<button className="btn logout" onClick={handleLogout}>Logout</button>
			</header>

			<section className="verifier-panel">
				<h2>Verify Credential QR</h2>
				<p>Scan using camera or paste QR text. Supports both session-token QR and hybrid on-chain QR payloads.</p>
				<div className="scanner-actions">
					<button className="btn approve" type="button" onClick={() => void startScanner()} disabled={isScanning || verifying}>
						{isScanning ? 'Scanner Running...' : 'Start Camera Scan'}
					</button>
					<button className="btn logout" type="button" onClick={() => void stopScanner()} disabled={!isScanning}>
						Stop Scan
					</button>
				</div>
				<div id={readerElementId} className="scanner-reader" />
				{scanError ? <div className="verifier-error">{scanError}</div> : null}
				<form onSubmit={verifyQr} className="verifier-redeem-form">
					<textarea
						value={tokenOrPayload}
						onChange={(event) => setTokenOrPayload(event.target.value)}
						placeholder='Paste payload e.g. {"type":"healthchain-credential-qr","token":"..."} or {"type":"healthchain-hybrid-record",...}'
						disabled={verifying}
					/>
					<button className="btn approve" type="submit" disabled={verifying}>
						{verifying ? 'Verifying...' : 'Verify QR Credential'}
					</button>
				</form>
				{error ? <div className="verifier-error">{error}</div> : null}
			</section>

			{hybridResult ? (
				<section className="claim-list">
					<article className={`claim-card ${hybridResult.valid ? 'approved' : ''}`}>
						<div className="claim-main claim-main-column">
							<h3 className="patient-name">Hybrid On-Chain Validation</h3>
							<div><strong>Status:</strong> {hybridResult.valid ? 'Verified Valid' : 'Verification Failed'}</div>
							<div><strong>Record ID:</strong> {hybridResult.recordId}</div>
							<div><strong>CID:</strong> {hybridResult.cid}</div>
							<div><strong>Hash:</strong> {hybridResult.payloadHash}</div>
							<div><strong>Contract:</strong> {hybridResult.contractAddress}</div>
						</div>
						<div className="claim-actions">
							<span className="badge">{hybridResult.valid ? 'Verified' : 'Failed'}</span>
						</div>
					</article>
				</section>
			) : null}

			{result ? (
				<section className="claim-list">
					<article className="claim-card approved">
						<div className="claim-main claim-main-column">
							<h3 className="patient-name">Credential Verified</h3>
							<div><strong>Credential Type:</strong> {result.credentialType}</div>
							<div><strong>Subject DID:</strong> {result.subjectDid}</div>
							<div><strong>Issued:</strong> {new Date(result.issuedAt).toLocaleString()}</div>
							{subject?.name ? <div><strong>Patient Name:</strong> {String(subject.name)}</div> : null}
							{subject?.vaccineType ? <div><strong>Vaccine Type:</strong> {String(subject.vaccineType)}</div> : null}
							{subject?.doseNumber ? <div><strong>Dose Number:</strong> {String(subject.doseNumber)}</div> : null}
						</div>
						<div className="claim-actions">
							<span className="badge">Verified</span>
						</div>
					</article>
				</section>
			) : null}

			<footer className="verifier-footer">
				<small>HealthChain • Verifier portal</small>
			</footer>
		</div>
	);
};

export default VerifierDashboard;