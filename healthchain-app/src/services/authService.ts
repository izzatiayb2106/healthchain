import axios from 'axios';

const API_BASE = 'http://localhost:3001';
const TOKEN_KEY = 'hc_jwt_token';
const WALLET_KEY = 'hc_wallet';
const ROLE_KEY = 'hc_role';
const DID_KEY = 'hc_did';

export type AuthResponse = {
  success: boolean;
  token: string;
  address: string;
  did: string;
  role: 'patient' | 'doctor' | 'verifier' | 'admin';
  expiresIn: string;
};

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredWallet(): string | null {
  return localStorage.getItem(WALLET_KEY);
}

export function getStoredRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

export function getStoredDid(): string | null {
  return localStorage.getItem(DID_KEY);
}

export async function loginWithJWT(
  address: string,
  signature: string,
  message: string
): Promise<AuthResponse> {
  const response = await axios.post(`${API_BASE}/auth/login-jwt`, {
    address,
    signature,
    message,
  });

  const { token, role, did } = response.data;

  // Store token and user info
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(WALLET_KEY, address);
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(DID_KEY, did);

  return response.data;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(DID_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) {
    throw new Error('No authentication token found');
  }

  return {
    'Authorization': `Bearer ${token}`,
  };
}

// Reusable axios instance with JWT
export const apiClient = axios.create({
  baseURL: API_BASE,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401 Unauthorized, user needs to re-login
    if (error.response?.status === 401) {
      logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
