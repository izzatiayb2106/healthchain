import jwt from "jsonwebtoken";

const JWT_SECRET = String(process.env.JWT_SECRET || "healthchain-dev-secret-change-in-prod").trim();
const JWT_EXPIRY = "7d"; // 7 days

export type JwtPayload = {
  wallet: string;
  did: string;
  role: "patient" | "doctor" | "verifier" | "admin";
  iat?: number;
  exp?: number;
};

export function generateToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    console.error("Token verification failed:", (error as any)?.message);
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}
