import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useLocation, useNavigate } from "react-router-dom";
import "./login.css";
import { hasPdpaConsent, loginWithJWT, logout, setPdpaConsentAccepted } from "../../services/authService";
import ProfessionalAccessForm from "../../components/ui/ProfessionalAccessForm";
import healthchainLogo from "../../assets/healthchain.svg";
import PDPAConsentModal from "../../components/ui/PDPAConsentModal";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const Login: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPdpaModal, setShowPdpaModal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("error") === "access-denied") {
      setError("You do not have access to this page.");
    }
  }, [location.search]);

  const routeByRole = (role: string) => {
    if (role === "doctor") return "/doctor";
    if (role === "verifier") return "/verifier";
    if (role === "admin") return "/admin";
    return "/patient";
  };

  const handlePdpaAccept = () => {
    setPdpaConsentAccepted();
    setShowPdpaModal(false);
    const destination = pendingRoute;
    setPendingRoute(null);
    if (destination) {
      navigate(destination);
    }
  };

  const handlePdpaDecline = () => {
    logout();
    setShowPdpaModal(false);
    setPendingRoute(null);
    setAccount(null);
    setError("PDPA consent is required to continue using the system.");
  };

  const connectWallet = async () => {
    if (isLoading) return;

    try {
      setIsLoading(true);
      setError(null);

      if (!window.ethereum) {
        setError("Please install MetaMask");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setAccount(address);

      // Sign ONE message only, then get JWT token
      const message = `Login to HealthChain\nWallet: ${address}\nTimestamp: ${new Date().toISOString()}`;
      const signature = await signer.signMessage(message);

      // Exchange signature for JWT token
      const authResult = await loginWithJWT(address, signature, message);

      console.log("✅ Logged in with JWT token, expires in:", authResult.expiresIn);

      const targetRoute = routeByRole(authResult.role);
      const requiresPdpaConsent =
        (authResult.role === "patient" || authResult.role === "doctor") &&
        Boolean(authResult.didCreated) &&
        !hasPdpaConsent();

      if (requiresPdpaConsent) {
        setPendingRoute(targetRoute);
        setShowPdpaModal(true);
        return;
      }

      // Navigate based on role
      navigate(targetRoute);
    } catch (err: any) {
      console.error(err);

      // MetaMask/Ethers rejection code for user-cancelled action
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        setError("Wallet request was rejected. Please approve it in MetaMask.");
        return;
      }

      const backendDetail = err?.response?.data?.error || err?.response?.data?.details;
      if (backendDetail) {
        setError(`Wallet/auth failed: ${backendDetail}`);
        return;
      }

      setError(err?.message || "Wallet connection or authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img className="login-logo" src={healthchainLogo} alt="HealthChain" />
          <h1>HealthChain</h1>
        </div>

        {error && <div className="error">{error}</div>}

        <button onClick={connectWallet} className="btn primary" disabled={isLoading}>
          {isLoading ? "Waiting for MetaMask..." : "Connect with MetaMask"}
        </button>

        {account && <p>Connected: {account}</p>}

        <ProfessionalAccessForm />
      </div>

      <PDPAConsentModal
        open={showPdpaModal}
        onAccept={handlePdpaAccept}
        onDecline={handlePdpaDecline}
      />
    </div>
  );
};

export default Login;