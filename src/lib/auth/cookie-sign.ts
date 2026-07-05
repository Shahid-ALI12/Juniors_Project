// Cookie signing utilities for Edge runtime (middleware compatible)
// Uses Web Crypto API — works in Next.js Edge middleware

function getSecret(): string {
  const secret = process.env.CUSTOMER_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CUSTOMER_TOKEN_SECRET must be set in production");
    }
    // Dev-only fallback — never use in production
    return "dev-only-fallback-secret-do-not-use-in-production";
  }
  return secret;
}

export interface CustomerPayload {
  id: string;
  name: string;
  email: string;
  subscription_end: string;
  is_active: boolean;
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function signCustomerToken(payload: CustomerPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const encoded = btoa(json);
  const signature = await hmacSha256(encoded, getSecret());
  return `${encoded}.${signature}`;
}

export async function verifyCustomerToken(
  token: string
): Promise<CustomerPayload | null> {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const encoded = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expected = await hmacSha256(encoded, getSecret());
    if (signature !== expected) return null;

    const json = atob(encoded);
    const payload = JSON.parse(json) as CustomerPayload;

    // Validate required fields
    if (!payload.id || !payload.email || !payload.subscription_end) return null;

    return payload;
  } catch {
    return null;
  }
}

export const CUSTOMER_COOKIE_NAME = "customer_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days