import React, { useState } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import "./login.css";
import axios from "axios";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const Login: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const routeByRole = (role: string) => {
    if (role === "doctor") return "/doctor";
    if (role === "patient") return "/patient";
    if (role === "verifier") return "/verifier";
    if (role === "admin") return "/admin";
    return "/login";
  };

  const authenticate = async (address: string, signer: ethers.Signer) => {
    const message = "Login to HealthChain";
    const signature = await signer.signMessage(message);

    const res = await axios.post("http://localhost:3001/auth/metamask", {
      address,
      signature,
      message,
    });

    console.log("Auth success:", res.data);
    return res.data as { success: boolean; address: string; did: string; role: string };
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
      const authResult = await authenticate(address, signer);
      const role = String(authResult?.role || "pending").toLowerCase();

      localStorage.setItem("hc_wallet", String(authResult?.address || address));
      localStorage.setItem("hc_did", String(authResult?.did || ""));
      localStorage.setItem("hc_role", role);

      if (role === "pending") {
        setError("Account is pending verification. Please wait for admin approval.");
        return;
      }

      navigate(routeByRole(role));
    } catch (err: any) {
      console.error(err);

      // MetaMask/Ethers rejection code for user-cancelled action
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        setError("Wallet request was rejected. Please approve it in MetaMask.");
        return;
      }

      const backendDetail = err?.response?.data?.details || err?.response?.data?.error;
      if (backendDetail) {
        setError(`Wallet/auth failed: ${backendDetail}`);
        return;
      }

      setError("Wallet connection or authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>HealthChain</h1>

        {error && <div className="error">{error}</div>}

        <button onClick={connectWallet} className="btn primary" disabled={isLoading}>
          {isLoading ? "Waiting for MetaMask..." : "Connect with MetaMask"}
        </button>

        {account && <p>Connected: {account}</p>}
      </div>
    </div>
  );
};

export default Login;