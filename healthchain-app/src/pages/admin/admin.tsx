import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, logoutWithAudit } from "../../services/authService";
import healthchainLogo from "../../assets/healthchain.svg";
import "./admin.css";

type UserRole = "pending" | "patient" | "doctor" | "verifier" | "admin";

type IdentityMapping = {
  wallet: string;
  did: string;
  role: UserRole;
  locked: boolean;
  lockReason?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type AuditAction =
  | "login"
  | "logout"
  | "access_denied"
  | "credential_issuance"
  | "credential_decryption"
  | "verification"
  | "lock_user"
  | "unlock_user";

type AuditLogEntry = {
  id: string;
  timestamp: string;
  action: AuditAction;
  role: UserRole | "system";
  wallet: string;
  did?: string;
  status: "success" | "failed";
  details?: string;
  metadata?: Record<string, unknown>;
};

const roleOptions: UserRole[] = ["pending", "patient", "doctor", "verifier", "admin"];
const auditActionOptions: Array<AuditAction | ""> = [
  "",
  "login",
  "logout",
  "access_denied",
  "credential_issuance",
  "credential_decryption",
  "verification",
  "lock_user",
  "unlock_user",
];

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<"identity" | "audit">("identity");
  const [rows, setRows] = useState<IdentityMapping[]>([]);
  const [selectedRoleByWallet, setSelectedRoleByWallet] = useState<Record<string, UserRole>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [updatingWallet, setUpdatingWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>("");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");

  const canAccess = useMemo(() => {
    return (localStorage.getItem("hc_role") || "").toLowerCase() === "admin";
  }, []);

  const loadMappings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get("/did/mapping/all");
      const identities: IdentityMapping[] = res.data?.identities || [];
      setRows(identities);

      const nextSelected: Record<string, UserRole> = {};
      identities.forEach((item) => {
        nextSelected[item.wallet] = item.role;
      });
      setSelectedRoleByWallet(nextSelected);

      await loadAuditLogs();
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to load identity mappings";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "300");
      if (auditRoleFilter) params.set("role", auditRoleFilter);
      if (auditActionFilter) params.set("action", auditActionFilter);

      const response = await apiClient.get(`/did/audit/logs?${params.toString()}`);
      setAuditLogs(Array.isArray(response.data?.logs) ? response.data.logs : []);
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to load audit logs";
      setError(message);
    } finally {
      setAuditLoading(false);
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
      const res = await apiClient.put(`/did/mapping/${encodeURIComponent(wallet)}/role`, {
        role,
      });

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

  const logout = async () => {
    await logoutWithAudit();
    navigate("/login");
  };

  const lockUser = async (wallet: string) => {
    try {
      setUpdatingWallet(wallet);
      setError(null);
      const reason = window.prompt("Lock reason (optional):") || "";
      await apiClient.put(`/did/mapping/${encodeURIComponent(wallet)}/lock`, { reason });
      await loadMappings();
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to lock user";
      setError(message);
    } finally {
      setUpdatingWallet(null);
    }
  };

  const unlockUser = async (wallet: string) => {
    try {
      setUpdatingWallet(wallet);
      setError(null);
      await apiClient.put(`/did/mapping/${encodeURIComponent(wallet)}/unlock`);
      await loadMappings();
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.error || "Failed to unlock user";
      setError(message);
    } finally {
      setUpdatingWallet(null);
    }
  };

  const refreshCurrentSection = async () => {
    if (activeSection === "audit") {
      await loadAuditLogs();
      return;
    }
    await loadMappings();
  };

  return (
    <div className="admin-page">
      <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        <aside className={`admin-sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <button
            className="sidebar-toggle"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? "x" : "≡"}
          </button>
          <div className="sidebar-brand">
            <img src={healthchainLogo} alt="HealthChain" className="sidebar-logo" />
            <div className="sidebar-brand-text">
              <strong>HealthChain</strong>
              <span>Admin Portal</span>
            </div>
          </div>
          <nav className="sidebar-nav">
            <button
              className={`sidebar-link ${activeSection === "identity" ? "active" : ""}`}
              onClick={() => setActiveSection("identity")}
              title="Identity Access"
              aria-label="Identity Access"
            >
              <span className="sidebar-link-icon">IA</span>
              <span className="sidebar-link-label">Identity Access</span>
            </button>
            <button
              className={`sidebar-link ${activeSection === "audit" ? "active" : ""}`}
              onClick={() => setActiveSection("audit")}
              title="Audit Log"
              aria-label="Audit Log"
            >
              <span className="sidebar-link-icon">AL</span>
              <span className="sidebar-link-label">Audit Log</span>
            </button>
          </nav>
        </aside>

        <main className="admin-main">
      <div className="admin-wrap">
        <header className="admin-header">
          <div className="admin-title">
            <h1>Admin Dashboard</h1>
            <p>Manage identity access, lock state, and full role audit visibility.</p>
          </div>
          <div className="admin-actions">
            <button className="btn refresh" onClick={() => void refreshCurrentSection()} disabled={isLoading || auditLoading || !!updatingWallet}>
              {(isLoading || auditLoading) ? "Refreshing..." : "Refresh"}
            </button>
            <button className="btn logout" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        {error ? <div className="admin-error">{error}</div> : null}

        {activeSection === "identity" ? (
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
                  <th>Lock State</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Role Management</th>
                  <th>Access Control</th>
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
                    <td>
                      <span className={`badge ${row.locked ? "locked" : "unlocked"}`}>
                        {row.locked ? "locked" : "active"}
                      </span>
                      {row.locked && row.lockReason ? (
                        <div className="lock-reason" title={row.lockReason}>{row.lockReason}</div>
                      ) : null}
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
                    <td>
                      <div className="role-form">
                        {row.locked ? (
                          <button
                            className="unlock-btn"
                            onClick={() => unlockUser(row.wallet)}
                            disabled={updatingWallet === row.wallet || row.role === "admin"}
                          >
                            {updatingWallet === row.wallet ? "Working..." : "Unlock"}
                          </button>
                        ) : (
                          <button
                            className="lock-btn"
                            onClick={() => lockUser(row.wallet)}
                            disabled={updatingWallet === row.wallet || row.role === "admin"}
                          >
                            {updatingWallet === row.wallet ? "Working..." : "Lock"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        ) : null}

        {activeSection === "audit" ? (
        <h2 className="section-title">Audit Log</h2>
        ) : null}
        {activeSection === "audit" ? (
        <div className="audit-controls">
          <label>
            Role
            <select value={auditRoleFilter} onChange={(e) => setAuditRoleFilter(e.target.value)}>
              <option value="">All</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>
          <label>
            Action
            <select value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)}>
              {auditActionOptions.map((action) => (
                <option key={action || "all"} value={action}>
                  {action || "All"}
                </option>
              ))}
            </select>
          </label>
          <button className="btn refresh" onClick={() => void loadAuditLogs()} disabled={auditLoading || !!updatingWallet}>
            {auditLoading ? "Loading..." : "Load Logs"}
          </button>
        </div>
        ) : null}

        {activeSection === "audit" ? (
        <div className="admin-table-wrap">
          {auditLogs.length === 0 && !auditLoading ? (
            <div className="empty">No audit logs found for selected filters.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Role</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td><span className="badge neutral">{entry.action}</span></td>
                    <td><span className={`badge ${entry.role}`}>{entry.role}</span></td>
                    <td className="wallet" title={entry.wallet}>{entry.wallet}</td>
                    <td>
                      <span className={`badge ${entry.status === "success" ? "approved" : "rejected"}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td>{entry.details || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        ) : null}
      </div>
      </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
