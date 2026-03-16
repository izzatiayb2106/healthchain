import React, { useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import './patient.css';

declare global {
	interface Window {
		ethereum?: any;
	}
}

type Appointment = {
	id: number;
	date: string;
	clinic: string;
	status: 'upcoming' | 'completed' | 'cancelled' | 'requested';
};

const PatientDashboard: React.FC = () => {
	const [showDoctorApply, setShowDoctorApply] = useState(false);
	const [professionalId, setProfessionalId] = useState('');
	const [credentialJwt, setCredentialJwt] = useState('');
	const [applyError, setApplyError] = useState<string | null>(null);
	const [applySuccess, setApplySuccess] = useState<string | null>(null);
	const [isApplying, setIsApplying] = useState(false);

	const [appointments, setAppointments] = useState<Appointment[]>([
		{ id: 1, date: '2025-12-01', clinic: 'Downtown Clinic', status: 'upcoming' },
		{ id: 2, date: '2025-10-15', clinic: 'Northside Hospital', status: 'completed' },
	]);

	const handleLogout = () => {
		localStorage.removeItem('hc_wallet');
		localStorage.removeItem('hc_did');
		localStorage.removeItem('hc_role');
		window.location.href = '/login';
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

	const requestAppointment = () => {
		const nextId = appointments.length ? Math.max(...appointments.map(a => a.id)) + 1 : 1;
		const newAppt: Appointment = {
			id: nextId,
			date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // one week out
			clinic: 'Primary Care',
			status: 'requested',
		};
		setAppointments(prev => [newAppt, ...prev]);
	};

	const cancelAppointment = (id: number) => {
		setAppointments(prev => prev.map(a => (a.id === id ? { ...a, status: 'cancelled' } : a)));
	};

	const upcomingCount = appointments.filter(a => a.status === 'upcoming' || a.status === 'requested').length;
	const totalCount = appointments.length;

	return (
		<div className="patient-dashboard">
			<header className="patient-header">
				<h1>Patient Dashboard</h1>
				<button className="btn logout" onClick={handleLogout}>Logout</button>
			</header>

			<section className="patient-stats">
				<div className="stat">
					<div className="stat-value">{totalCount}</div>
					<div className="stat-label">Appointments</div>
				</div>
				<div className="stat">
					<div className="stat-value">{upcomingCount}</div>
					<div className="stat-label">Upcoming</div>
				</div>
				<div className="stat">
					<button className="btn request" onClick={requestAppointment}>Request Appointment</button>
				</div>
			</section>

			<section className="doctor-apply-card">
				<h2>Professional Access</h2>
				<p>
					Are you a medical professional? Apply for Doctor Access.
				</p>
				<button className="btn request" onClick={() => setShowDoctorApply(prev => !prev)}>
					{showDoctorApply ? 'Hide Doctor Application' : 'Are you a medical professional? Apply for Doctor Access.'}
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

			<section className="appointment-list">
				{appointments.map(appt => (
					<article key={appt.id} className={`appt-card ${appt.status}`}>
						<div className="appt-main">
							<h3 className="clinic-name">{appt.clinic}</h3>
							<div className="appt-date">{appt.date}</div>
						</div>
						<div className="appt-actions">
							<span className={`status-badge ${appt.status}`}>{appt.status}</span>
							{appt.status === 'upcoming' || appt.status === 'requested' ? (
								<button className="btn cancel" onClick={() => cancelAppointment(appt.id)}>Cancel</button>
							) : null}
						</div>
					</article>
				))}
			</section>

			<footer className="patient-footer">
				<small>HealthChain • Patient portal</small>
			</footer>
		</div>
	);
};

export default PatientDashboard;
