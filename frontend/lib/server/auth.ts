import jwt from "jsonwebtoken";

function getJwtPassword(): string {
  const password = process.env.JWT_PASSWORD;
  if (process.env.NODE_ENV === "production" && !password) {
    throw new Error("JWT_PASSWORD must be set in production");
  }

  return password || "dev-only-secret-change-in-production";
}

export function getAuthenticatedUserId(request: Request): number | null {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, getJwtPassword()) as { id: number };
    return payload.id;
  } catch {
    return null;
  }
}

export function createToken(userId: number): string {
  return jwt.sign({ id: userId }, getJwtPassword());
}
