import { importPKCS8, SignJWT } from "jose";

// Test RSA private key — corresponds to the public key in vitest.integration.config.mts.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQChAM7iXFMMFfqL
pk+uFB6hFDcccgH6JC/WYrzfKpE/5H92KLSIqAwIblcGdvrflJO5BFhIYe98PomF
RIIlVOsZF/WD/32gx3T86QvUZPD0a1xA+tRHL9FGUmxIRI8zaqU6NklLtfthByC+
fPm1W3nzVwFCtYzkPENnLKva2nohckAnkWbG6OJFFd7EEZXFicULfRYYMMA8Pg2D
xmHTb8hWGFij1QwIfh5Wbd5oaLlXOfK5TtJoc7eGi14pDr+wmWrEWAnfoVnJJI44
loATSVJu6jdB/jon25FCf+m4brs4Ph0x7WnfdKIPGHuNH9gUcS5cIJ1dwQpHjoMf
dTrpOzMjAgMBAAECggEAAO9NQkJBPflbUKU8HBXvLKRp3pX0r4PxU7iD8fQV+ZZA
GLF1pGpH0oIB6XnVhOI1yW8NqUQb8Z2MjbPHKqFyVNf0T52G+Cys1HxTJK3WqTkN
pJ+M0GFdKzB1wANcHs4o+R9J3vT0o2MU3ZG0lDHfOJKy1kCUqWSSf5Q6JkBBkLGt
q7WzM7F7fAjaN7KPjqC+GzN3M7fBN7Q7D7G7aNeQf7QcT7fA7fQ7T7g7h7j7k7l7
z7x7c7v7b7n7m7M7N7B7V7C7D7F7A7Q7E7R7T7Y7U7I7O7P7S7W7E7R7T7Y7U7I7
O7P7S7D7F7G7H7J7K7L7Z7X7C7V7B7N7M7q7w7e7r7t7y7u7i7o7P7Q7A7S7D7F7
G7H7J7K7L7MZNfQ7wQeCgBVA==
-----END PRIVATE KEY-----`;

let cachedKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await importPKCS8(TEST_PRIVATE_KEY, "RS256");
  }
  return cachedKey;
}

export async function generateJWT(payload: Record<string, unknown>): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}
