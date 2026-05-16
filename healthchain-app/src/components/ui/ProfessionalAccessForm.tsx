import React, { useState } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import {
  apiClient,
  hasPdpaConsent,
  loginWithJWT,
  logout,
  setPdpaConsentAccepted,
} from "../../services/authService";
import PDPAConsentModal from "./PDPAConsentModal";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const ProfessionalAccessForm: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [professionalId, setProfessionalId] = useState("");
  const [requestedRole, setRequestedRole] = useState<"doctor" | "verifier">("doctor");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPdpaModal, setShowPdpaModal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const routeByRole = (role: string) => {
    if (role === "doctor") return "/doctor";
    if (role === "verifier") return "/verifier";
    if (role === "admin") return "/admin";
    return "/patient";
  };

  const submitProfessionalAccess = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (!window.ethereum) {
        setError("MetaMask is required to submit a verified professional access application.");
        return;
      }

      const trimmedProfessionalId = professionalId.trim();
      if (!trimmedProfessionalId) {
        setError("Professional ID is required.");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const message = `Professional access application for ${address} at ${new Date().toISOString()}`;
      const signature = await signer.signMessage(message);

      await apiClient.post("/auth/professional/access", {
        address,
        professionalId: trimmedProfessionalId,
        requestedRole,
        message,
        signature,
      });

      const authResult = await loginWithJWT(address, signature, message, trimmedProfessionalId);
      const targetRoute = routeByRole(authResult.role);
      const requiresPdpaConsent =
        authResult.role === "doctor" && Boolean(authResult.firstRegistration ?? authResult.didCreated);

      if (requiresPdpaConsent) {
        setPendingRoute(targetRoute);
        setShowPdpaModal(true);
        return;
      }

      navigate(targetRoute);
      setProfessionalId("");
    } catch (error: any) {
      const details = error?.response?.data?.details || error?.response?.data?.error;
      setError(details || "Professional access request failed. Please verify your Professional ID and wallet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePdpaAccept = () => {
    (async () => {
      try {
        await apiClient.post('/auth/pdpa-consent', { version: 'v1' });
      } catch (err) {
        // Continue even if server-side recording fails; local consent still set for UX
      }
      setPdpaConsentAccepted();
      const destination = pendingRoute;
      setShowPdpaModal(false);
      setPendingRoute(null);
      if (destination) {
        navigate(destination);
      }
    })();
  };

  const handlePdpaDecline = () => {
    logout();
    setShowPdpaModal(false);
    setPendingRoute(null);
    setError("PDPA consent is required to continue using the system.");
  };

  return (
    <section className="professional-access-card">
      <button
        type="button"
        className="btn secondary professional-access-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? "Hide Professional Login or Registration" : "Professional Access"}
      </button>

      {isOpen ? (
        <div className="professional-access-panel">
          <p>
            Doctor/verifier users should enter Professional ID and role, then connect with MetaMask. New wallets are auto-registered.
          </p>

          <form className="professional-access-form" onSubmit={submitProfessionalAccess}>
            <label htmlFor="professionalId">Medical license or Professional ID</label>
            <input
              id="professionalId"
              type="text"
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              placeholder="e.g. MOH-123456"
              required
            />

            <label htmlFor="requestedRole">Requested role</label>
            <select
              id="requestedRole"
              value={requestedRole}
              onChange={(event) => setRequestedRole(event.target.value as "doctor" | "verifier")}
            >
              <option value="doctor">Doctor</option>
              <option value="verifier">Verifier</option>
            </select>

            {error ? <div className="professional-access-error">{error}</div> : null}

            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? "Connecting with MetaMask..." : "Connect with MetaMask"}
            </button>
          </form>
        </div>
      ) : null}

      <PDPAConsentModal
        open={showPdpaModal}
        onAccept={handlePdpaAccept}
        onDecline={handlePdpaDecline}
      />
    </section>
  );
};

export default ProfessionalAccessForm;