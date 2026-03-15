import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import "./admin.css";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type UserRole = "pending" | "patient" | "doctor" | "verifier" | "admin";

type IdentityMapping = {
  wallet: string;
  did: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

type DoctorRequest = {
  wallet: string;
  did: string;
  licenseUrl: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

const roleOptions: UserRole[] = ["pending", "patient", "doctor", "verifier", "admin"];

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<IdentityMapping[]>([]);
  const [doctorRequests, setDoctorRequests] = useState<DoctorRequest[]>([]);
  const [selectedRoleByWallet, setSelectedRoleByWallet] = useState<Record<string, UserRole>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [updatingWallet, setUpdatingWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAccess = useMemo(() => {
    return (localStorage.getItem("hc_role") || "").toLowerCase() === "admin";
  }, []);

  const createAdminHeaders = async () => {
    const wallet = (localStorage.getItem("hc_wallet") || "").toLowerCase();
    if (!wallet || !window.ethereum) {
      throw new Error("Missing admin wallet session or MetaMask provider");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const message = "HealthChain Admin Authorization";
    const signature = await signer.signMessage(message);

    return {
      "x-admin-wallet": wallet,
      "x-admin-message": message,
      "x-admin-signature": signature,
    };
  };

  const loadMappings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const headers = await createAdminHeaders();
      const res = await axios.get("http://localhost:3001/did/mapping/all", { headers });
      const identities: IdentityMapping[] = res.data?.identities || [];
      setRows(identities);

      const nextSelected: Record<string, UserRole> = {};
      identities.forEach((item) => {
        nextSelected[item.wallet] = item.role;
      });
      setSelectedRoleByWallet(nextSelected);

      const doctorReqRes = await axios.get("http://localhost:3001/did/doctor/requests", { headers });
      setDoctorRequests(doctorReqRes.data?.requests || []);
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to load identity mappings";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) {
      navigate("/login");
      return;
    }
    loadMappings();
  }, [canAccess, navigate]);

  const updateRole = async (wallet: string) => {
    const role = selectedRoleByWallet[wallet];
    if (!role) return;

    try {
      setUpdatingWallet(wallet);
      setError(null);
      const headers = await createAdminHeaders();
      const res = await axios.put(`http://localhost:3001/did/mapping/${encodeURIComponent(wallet)}/role`, {
        role,
      }, { headers });

      setRows((prev) =>
        prev.map((item) => (item.wallet === wallet ? { ...item, role: res.data.role, updatedAt: res.data.updatedAt } : item))
      );
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to update role";
      setError(message);
    } finally {
      setUpdatingWallet(null);
    }
  };

  const logout = () => {
    localStorage.removeItem("hc_role");
    localStorage.removeItem("hc_wallet");
    localStorage.removeItem("hc_did");
    navigate("/login");
  };

  const approveDoctor = async (wallet: string) => {
    try {
      setUpdatingWallet(wallet);
      setError(null);
      const headers = await createAdminHeaders();
      await axios.post(`http://localhost:3001/did/doctor/approve/${encodeURIComponent(wallet)}`, {}, { headers });
      await loadMappings();
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to approve doctor request";
      setError(message);
    } finally {
      setUpdatingWallet(null);
    }
  };

  const rejectDoctor = async (wallet: string) => {
    try {
      setUpdatingWallet(wallet);
      setError(null);
      const headers = await createAdminHeaders();
      await axios.post(`http://localhost:3001/did/doctor/reject/${encodeURIComponent(wallet)}`, {}, { headers });
      await loadMappings();
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to reject doctor request";
      setError(message);
    } finally {
      setUpdatingWallet(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-wrap">
        <header className="admin-header">
          <div className="admin-title">
            <h1>Admin Dashboard</h1>
            <p>Manage wallet to DID mappings and approve user roles.</p>
          </div>
          <div className="admin-actions">
            <button className="btn refresh" onClick={loadMappings} disabled={isLoading || !!updatingWallet}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button className="btn logout" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        {error ? <div className="admin-error">{error}</div> : null}

        <div className="admin-table-wrap">
          {rows.length === 0 && !isLoading ? (
            <div className="empty">No identity mappings found.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>DID</th>
                  <th>Current Role</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Approve / Change Role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.wallet}>
                    <td className="wallet" title={row.wallet}>{row.wallet}</td>
                    <td className="did" title={row.did}>{row.did}</td>
                    <td>
                      <span className={`badge ${row.role}`}>{row.role}</span>
                    </td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{new Date(row.updatedAt).toLocaleString()}</td>
                    <td>
                      <div className="role-form">
                        <select
                          value={selectedRoleByWallet[row.wallet] || row.role}
                          onChange={(e) =>
                            setSelectedRoleByWallet((prev) => ({
                              ...prev,
                              [row.wallet]: e.target.value as UserRole,
                            }))
                          }
                          disabled={updatingWallet === row.wallet}
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => updateRole(row.wallet)} disabled={updatingWallet === row.wallet}>
                          {updatingWallet === row.wallet ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h2 className="section-title">Doctor License Review</h2>
        <div className="admin-table-wrap">
          {doctorRequests.length === 0 && !isLoading ? (
            <div className="empty">No doctor requests found.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>DID</th>
                  <th>License</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {doctorRequests.map((req) => (
                  <tr key={req.wallet}>
                    <td className="wallet" title={req.wallet}>{req.wallet}</td>
                    <td className="did" title={req.did}>{req.did}</td>
                    <td><a href={req.licenseUrl} target="_blank" rel="noreferrer">View license</a></td>
                    <td><span className={`badge ${req.status}`}>{req.status}</span></td>
                    <td>{new Date(req.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="role-form">
                        <button onClick={() => approveDoctor(req.wallet)} disabled={updatingWallet === req.wallet || req.status !== "pending"}>
                          Approve
                        </button>
                        <button onClick={() => rejectDoctor(req.wallet)} disabled={updatingWallet === req.wallet || req.status !== "pending"}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
