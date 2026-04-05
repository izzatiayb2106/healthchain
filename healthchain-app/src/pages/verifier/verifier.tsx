import React, { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Html5Qrcode } from 'html5-qrcode';
import { apiClient, logoutWithAudit } from '../../services/authService';
import './verifier.css';

type HybridVerifyResult = {
	valid: boolean;
	statusText: string;
	recordId: string;
	cid: string;
	payloadHash: string;
	contractAddress: string;
};

type HybridQrPayload = {
	type: 'healthchain-hybrid-record';
	contractAddress: string;
	recordId: string;
	cid: string;
	payloadHash: string;
};

type VerifierProfile = {
	fullName: string;
	professionalId: string;
};

const VerifierDashboard: React.FC = () => {
	const readerElementId = 'verifier-qr-reader';
	const scannerRef = useRef<Html5Qrcode | null>(null);

	const [tokenOrPayload, setTokenOrPayload] = useState('');
	const [verifying, setVerifying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hybridResult, setHybridResult] = useState<HybridVerifyResult | null>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [verifierProfile, setVerifierProfile] = useState<VerifierProfile | null>(null);

	const parseHybridPayload = (rawValue: string): HybridQrPayload => {
		let parsed: any;
		try {
			parsed = JSON.parse(rawValue);
		} catch {
			throw new Error('Invalid hybrid QR payload JSON.');
		}

		if (parsed?.type !== 'healthchain-hybrid-record') {
			throw new Error('Unsupported QR payload type. Use a hybrid record payload from patient dashboard.');
		}

		const contractAddress = String(parsed.contractAddress || '').trim();
		const recordId = String(parsed.recordId || '').trim();
		const cid = String(parsed.cid || '').trim();
		const payloadHash = String(parsed.payloadHash || '').trim();

		if (!contractAddress || !recordId || !cid || !payloadHash) {
			throw new Error('Hybrid payload is missing required fields: contractAddress, recordId, cid, payloadHash.');
		}

		if (!/^0x[a-fA-F0-9]{64}$/.test(payloadHash)) {
			throw new Error('Invalid payloadHash format. Expected 0x-prefixed 64 hex characters.');
		}

		try {
			void BigInt(recordId);
		} catch {
			throw new Error('Invalid recordId. It must be a numeric string.');
		}

		return {
			type: 'healthchain-hybrid-record',
			contractAddress,
			recordId,
			cid,
			payloadHash,
		};
	};
 
	const handleLogout = async () => {
		await logoutWithAudit();
		window.location.href = '/login';
	};

	const verifyQrValue = async (rawValue: string) => {
		if (verifying) return;

		const value = rawValue.trim();
		if (!value) {
			setError('Please paste a hybrid QR payload.');
			return;
		}

		try {
			setVerifying(true);
			setError(null);
			setHybridResult(null);

			const parsed = parseHybridPayload(value);
			if (!(window as any).ethereum) {
				throw new Error('MetaMask is required to approve verification.');
			}

			const provider = new ethers.BrowserProvider((window as any).ethereum);
			await provider.send('eth_requestAccounts', []);
			const signer = await provider.getSigner();
			const address = String(await signer.getAddress()).toLowerCase();

			const message = [
				'HealthChain Verifier Approval',
				`Action: verify hybrid credential`,
				`Contract: ${parsed.contractAddress}`,
				`Record ID: ${parsed.recordId}`,
				`CID: ${parsed.cid}`,
				`Payload Hash: ${parsed.payloadHash}`,
				`Timestamp: ${new Date().toISOString()}`,
			].join('\n');

			const signature = await signer.signMessage(message);

			const response = await apiClient.post('/credential/hybrid/verify', {
				address,
				message,
				signature,
				payload: parsed,
			});

			const valid = Boolean(response.data?.valid);
			const statusText = String(response.data?.statusText || (valid ? 'Verified Valid' : 'Verification Failed'));

			setHybridResult({
				valid,
				statusText,
				recordId: String(response.data?.recordId || parsed.recordId),
				cid: String(response.data?.cid || parsed.cid),
				payloadHash: String(response.data?.payloadHash || parsed.payloadHash),
				contractAddress: String(response.data?.contractAddress || parsed.contractAddress),
			});
		} catch (err: any) {
			const detail =
				err?.response?.data?.error ||
				(err?.code === 4001
					? 'Verification approval was rejected in MetaMask.'
					: err?.message) ||
				'Failed to verify hybrid credential payload';
			setError(detail);
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

		void (async () => {
			try {
				const response = await apiClient.get('/auth/professional/me');
				const profile = response.data?.profile;
				setVerifierProfile({
					fullName: String(profile?.fullName || '').trim() || 'Unknown Verifier',
					professionalId: String(profile?.professionalId || '').trim() || 'N/A',
				});
			} catch {
				setVerifierProfile(null);
			}
		})();

		return () => {
			void stopScanner();
		};
	}, []);

	return (
		<div className="verifier-dashboard">
			<header className="verifier-header">
				<div className="verifier-heading">
					<h1>Verifier Dashboard</h1>
					{verifierProfile ? (
						<div className="verifier-identity">
							<span className="verifier-identity-name">{verifierProfile.fullName}</span>
							<span className="verifier-identity-id">Professional ID: {verifierProfile.professionalId}</span>
						</div>
					) : null}
				</div>
				<button className="btn logout" onClick={handleLogout}>Logout</button>
			</header>

			<section className="verifier-panel">
				<h2>Verify Credential QR</h2>
				<p>Scan or paste hybrid QR payload. Verification requires verifier role and MetaMask signature approval.</p>
				<div className="scanner-actions">
					<button className="btn approve" type="button" onClick={() => void startScanner()} disabled={isScanning || verifying}>
						{isScanning ? 'Scanner Running...' : 'Scan'}
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
						placeholder='Paste payload e.g. {"type":"healthchain-hybrid-record","contractAddress":"0x...","recordId":"1","cid":"...","payloadHash":"0x..."}'
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
							<div><strong>Status:</strong> {hybridResult.statusText}</div>
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

			<footer className="verifier-footer">
				<small>HealthChain • Verifier portal</small>
			</footer>
		</div>
	);
};

export default VerifierDashboard;