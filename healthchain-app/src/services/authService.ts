import axios from 'axios';

// Determine backend API base dynamically so the frontend served on a device
// will call the host machine's backend. Keeps localhost for desktop dev.
const API_BASE = (() => {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const hostname = String(window.location.hostname || '').trim();
      const protocol = window.location.protocol || 'http:';
      // If frontend is served via an IP (e.g. 10.x.x.x) the backend is expected
      // to be reachable on the same host at port 3001. Keep localhost for local dev.
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `${protocol}//${hostname}:3001`;
      }
    }
  } catch (err) {
    // fall through to default
  }
  return 'http://localhost:3001';
})();
const TOKEN_KEY = 'hc_jwt_token';
const WALLET_KEY = 'hc_wallet';
const ROLE_KEY = 'hc_role';
const DID_KEY = 'hc_did';
const PDPA_CONSENT_VERSION = 'v1';
const PDPA_CONSENT_KEY = `hc_pdpa_consent_${PDPA_CONSENT_VERSION}`;
const PDPA_CONSENT_AT_KEY = `hc_pdpa_consent_at_${PDPA_CONSENT_VERSION}`;

export type AuthResponse = {
  success: boolean;
  token: string;
  address: string;
  did: string;
  role: 'patient' | 'doctor' | 'verifier' | 'admin';
  expiresIn: string;
  didCreated?: boolean;
  firstRegistration?: boolean;
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

export function hasPdpaConsent(): boolean {
  return localStorage.getItem(PDPA_CONSENT_KEY) === 'accepted';
}

export function setPdpaConsentAccepted() {
  localStorage.setItem(PDPA_CONSENT_KEY, 'accepted');
  localStorage.setItem(PDPA_CONSENT_AT_KEY, new Date().toISOString());
}

export async function loginWithJWT(
  address: string,
  signature: string,
  message: string,
  professionalId?: string
): Promise<AuthResponse> {
  const trimmedProfessionalId = String(professionalId || '').trim();
  const response = await axios.post(`${API_BASE}/auth/login-jwt`, {
    address,
    signature,
    message,
    professionalId: trimmedProfessionalId || undefined,
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

export async function logoutWithAudit() {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Logout should still clear local session even if audit endpoint fails.
  }
  logout();
}

export async function denyRoleAccess(input: {
  requiredRole: 'patient' | 'doctor' | 'verifier' | 'admin';
  requestedPath: string;
}) {
  try {
    await apiClient.post('/auth/access-denied', {
      requiredRole: input.requiredRole,
      requestedPath: input.requestedPath,
    });
  } catch {
    // Denied-access logging should not block the redirect/logout flow.
  }

  await logoutWithAudit();
  window.location.href = '/login?error=access-denied';
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
