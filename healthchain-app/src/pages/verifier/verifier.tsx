import React, { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { apiClient, logoutWithAudit } from '../../services/authService';
import './verifier.css';

type HybridVerifyResult = {
	valid: boolean;
	expired: boolean;
	tampered?: boolean;
	statusText: string;
	recordId: string;
	cid: string;
	payloadHash: string;
	contractAddress: string;
	expirationDate?: string | null;
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
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [verifierProfile, setVerifierProfile] = useState<VerifierProfile | null>(null);

	useEffect(() => {
		const token = String(localStorage.getItem('hc_jwt_token') || '').trim();
		if (!token) {
			return;
		}

		try {
			const eventSource = new EventSource(`http://localhost:3001/auth/events?token=${encodeURIComponent(token)}`);

			const handleAccountLocked = async () => {
				console.log('[SSE] Received account-locked event, logging out verifier...');
				await logoutWithAudit();
				window.location.href = '/login?error=account-locked';
			};

			eventSource.addEventListener('account-locked', handleAccountLocked as EventListener);

			return () => {
				eventSource.removeEventListener('account-locked', handleAccountLocked as EventListener);
				eventSource.close();
			};
		} catch (error) {
			console.error('[SSE] Failed to set up lock listener:', error);
		}
	}, []);

	const parseHybridPayload = (rawValue: string): HybridQrPayload => {
		let parsed: any;
		try {
			parsed = JSON.parse(rawValue);
		} catch {
			throw new Error('Invalid hybrid QR payload JSON.');
		}

		// Support both compact format (t='hc-hybrid') and full format (type='healthchain-hybrid-record')
		const isCompact = parsed?.t === 'hc-hybrid';
		const isFull = parsed?.type === 'healthchain-hybrid-record';
		
		if (!isCompact && !isFull) {
			throw new Error('Unsupported QR payload type. Use a hybrid record payload from patient dashboard.');
		}

		// Map compact keys to full format
		const contractAddress = String(parsed.a || parsed.contractAddress || '').trim();
		const recordId = String(parsed.r || parsed.recordId || '').trim();
		const cid = String(parsed.c || parsed.cid || '').trim();
		const payloadHash = String(parsed.h || parsed.payloadHash || '').trim();

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
			const expired = Boolean(response.data?.expired);
			const tampered = Boolean(response.data?.tampered);
			const statusText = String(response.data?.statusText || (valid ? 'Verified Valid' : 'Verification Failed'));

			setHybridResult({
				valid,
				expired,
				tampered,
				statusText,
				recordId: String(response.data?.recordId || parsed.recordId),
				cid: String(response.data?.cid || parsed.cid),
				payloadHash: String(response.data?.payloadHash || parsed.payloadHash),
				contractAddress: String(response.data?.contractAddress || parsed.contractAddress),
				expirationDate: response.data?.expirationDate ? String(response.data.expirationDate) : null,
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

	const getVerificationStatusClass = (result: HybridVerifyResult) => {
		if (result.tampered) {
			return 'verification-status verification-status-tampered';
		}
		if (!result.valid) {
			return 'verification-status verification-status-failed';
		}
		if (result.expired) {
			return 'verification-status verification-status-expired';
		}
		return 'verification-status verification-status-valid';
	};

	const getVerificationBadgeClass = (result: HybridVerifyResult) => {
		if (result.tampered) {
			return 'badge badge-tampered';
		}
		if (!result.valid) {
			return 'badge badge-failed';
		}
		if (result.expired) {
			return 'badge badge-expired';
		}
		return 'badge badge-valid';
	};

	const getVerificationBadgeLabel = (result: HybridVerifyResult) => {
		if (result.tampered) {
			return 'Tampered';
		}
		if (!result.valid) {
			return 'Failed';
		}
		if (result.expired) {
			return 'Expired';
		}
		return 'Verified';
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

			const readerElement = document.getElementById(readerElementId);
			const readerWidth = Math.max(320, readerElement?.clientWidth || 0);
			const qrboxSize = Math.max(220, Math.min(360, Math.floor(readerWidth * 0.72)));
			readerElement?.style.setProperty('--qr-frame-size', `${qrboxSize}px`);

			const scanner = new Html5Qrcode(readerElementId);
			scannerRef.current = scanner;

			await scanner.start(
				{ deviceId: { exact: cameras[0].id } },
				{ fps: 15, qrbox: { width: qrboxSize, height: qrboxSize }, aspectRatio: 1.0 },
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

	const handleFileInputClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		setScanError(null);
		console.log('Uploaded QR file name:', file.name);
		console.log('Uploaded QR file type:', file.type || 'unknown');
		console.log('Uploaded QR file size:', file.size);
		let imageUrl = '';
		try {
			imageUrl = URL.createObjectURL(file);
			const image = new Image();
			image.decoding = 'async';
			const imageLoaded = new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error('Unable to load uploaded QR image.'));
			});
			image.src = imageUrl;
			await imageLoaded;
			console.log('Loaded QR image dimensions:', image.naturalWidth, image.naturalHeight);

			const padding = 48;
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth + padding * 2;
			canvas.height = image.naturalHeight + padding * 2;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				throw new Error('Unable to create canvas context.');
			}

			// Keep original size and add a white quiet-zone border around the image.
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, padding, padding, image.naturalWidth, image.naturalHeight);

			// Convert to high-contrast black and white to improve decoder reliability.
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const data = imageData.data;
			for (let i = 0; i < data.length; i += 4) {
				const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
				const bw = gray > 150 ? 255 : 0;
				data[i] = bw;
				data[i + 1] = bw;
				data[i + 2] = bw;
				data[i + 3] = 255;
			}
			ctx.putImageData(imageData, 0, 0);

			let decodedText = '';
			try {
				const qrReader = new BrowserQRCodeReader();
				const result = await qrReader.decodeFromCanvas(canvas);
				decodedText = result.getText();
				console.log('ZXing succeeded');
			} catch (zxingErr) {
				console.warn('ZXing decode failed, trying jsQR fallback:', zxingErr);
				const fallbackData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const jsqrResult = jsQR(fallbackData.data, fallbackData.width, fallbackData.height, {
					inversionAttempts: 'attemptBoth',
				});
				if (!jsqrResult?.data) {
					throw zxingErr;
				}
				decodedText = jsqrResult.data;
				console.log('jsQR fallback succeeded');
			}

			console.log('Decoded QR payload:', decodedText);
			setTokenOrPayload(decodedText);
			await verifyQrValue(decodedText);
		} catch (err: any) {
			console.error('QR decode error:', err);
			setScanError(err?.message || 'Failed to scan uploaded image.');
		} finally {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
			// clear the input so same file can be chosen again
			input.value = '';
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
				<p>Scan or paste QR payload.</p>
				<div className="scanner-actions">
					<button className="btn approve" type="button" onClick={() => void startScanner()} disabled={isScanning || verifying}>
						{isScanning ? 'Scanner Running...' : 'Scan'}
					</button>
					<button className="btn" type="button" onClick={handleFileInputClick} disabled={verifying}>
						Upload / Take Photo
					</button>
					<input
						type="file"
						accept="image/*"
						capture="environment"
						ref={fileInputRef}
						onChange={handleFileChange}
						style={{ display: 'none' }}
					/>
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
						placeholder='Paste QR payload.'
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
					<article className={`claim-card ${hybridResult.valid && !hybridResult.expired && !hybridResult.tampered ? 'approved' : ''}`}>
						<div className="claim-main claim-main-column">
							<h3 className="patient-name">On-Chain Validation</h3>
							<div className={getVerificationStatusClass(hybridResult)}>
								<strong>Status:</strong> {hybridResult.statusText}
							</div>
							<div><strong>Record ID:</strong> {hybridResult.recordId}</div>
							<div><strong>CID:</strong> {hybridResult.cid}</div>
							<div><strong>Hash:</strong> {hybridResult.payloadHash}</div>
							{hybridResult.expirationDate ? (
								<div><strong>Expiration:</strong> {new Date(hybridResult.expirationDate).toLocaleString()}</div>
							) : null}
							<div><strong>Contract:</strong> {hybridResult.contractAddress}</div>
						</div>
						<div className="claim-actions">
							<span className={getVerificationBadgeClass(hybridResult)}>
								{getVerificationBadgeLabel(hybridResult)}
							</span>
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