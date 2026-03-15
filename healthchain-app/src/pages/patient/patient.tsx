import React, { useState } from 'react';
import './patient.css';

type Appointment = {
	id: number;
	date: string;
	clinic: string;
	status: 'upcoming' | 'completed' | 'cancelled' | 'requested';
};

const PatientDashboard: React.FC = () => {
	const [appointments, setAppointments] = useState<Appointment[]>([
		{ id: 1, date: '2025-12-01', clinic: 'Downtown Clinic', status: 'upcoming' },
		{ id: 2, date: '2025-10-15', clinic: 'Northside Hospital', status: 'completed' },
	]);

	const handleLogout = () => {
		// replace with real logout flow
		alert('Logout not implemented');
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
