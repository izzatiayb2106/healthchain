import React, { useState } from 'react';
import './verifier.css';

type Claim = { id: number; patient: string; amount: number; approved?: boolean };

const VerifierDashboard: React.FC = () => {
	const [claims, setClaims] = useState<Claim[]>([
		{ id: 1, patient: 'Jane Smith', amount: 2500 },
		{ id: 2, patient: 'Bob Lee', amount: 1800 },
		{ id: 3, patient: 'Alice Johnson', amount: 3200 },
	]);
 
	const handleLogout = () => {
		// replace with real logout flow
		alert('Logout not implemented');
	};

	const approveClaim = (id: number) => {
		setClaims(prev => prev.map(c => (c.id === id ? { ...c, approved: true } : c)));
	};

	const approvedCount = claims.filter(c => c.approved).length;
	const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);

	return (
		<div className="verifier-dashboard">
			<header className="verifier-header">
				<h1>Verifier Dashboard</h1>
				<button className="btn logout" onClick={handleLogout}>Logout</button>
			</header>

			<section className="verifier-stats">
				<div className="stat">
					<div className="stat-value">{claims.length}</div>
					<div className="stat-label">Total Claims</div>
				</div>
				<div className="stat">
					<div className="stat-value">{approvedCount}</div>
					<div className="stat-label">Approved</div>
				</div>
				<div className="stat">
					<div className="stat-value">${totalAmount.toLocaleString()}</div>
					<div className="stat-label">Total Amount</div>
				</div>
			</section>

			<section className="claim-list">
				{claims.map(claim => (
					<article key={claim.id} className={`claim-card ${claim.approved ? 'approved' : ''}`}>
						<div className="claim-main">
							<h3 className="patient-name">{claim.patient}</h3>
							<div className="claim-amount">${claim.amount.toLocaleString()}</div>
						</div>
						<div className="claim-actions">
							{claim.approved ? (
								<span className="badge">Approved</span>
							) : (
								<button className="btn approve" onClick={() => approveClaim(claim.id)}>Approve</button>
							)}
						</div>
					</article>
				))}
			</section>

			<footer className="verifier-footer">
				<small>HealthChain • Verifier portal</small>
			</footer>
		</div>
	);
};

export default VerifierDashboard;