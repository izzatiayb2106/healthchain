import express from "express";
import { verifyToken, extractTokenFromHeader, type JwtPayload } from "../services/jwtService";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function jwtAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.header("Authorization");
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";

  let token: string | null = null;
  if (authHeader) {
    token = extractTokenFromHeader(authHeader);
    if (!token) {
      return res.status(401).json({ error: "Invalid Authorization header format. Use: Bearer <token>" });
    }
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }

    next();
  };
}
