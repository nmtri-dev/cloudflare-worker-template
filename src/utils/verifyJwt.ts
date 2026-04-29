import { DefaultLogger } from "../adapters/secondary/loggers";
import { InternalError, JWTClaims, UnauthorizedError } from "../core/domain";
import { Logger } from "../core/ports";

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    // .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    // .replace(/-----END PRIVATE KEY-----/g, '')
    // .replace(/\s+/g, '');
    .replace(/\\n/g, "\n") // unescape if stored as single line
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "")
    .trim();

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  const logger: Logger = new DefaultLogger();

  try {
    const keyBuffer = pemToArrayBuffer(pem);
    return await crypto.subtle.importKey(
      "spki",
      keyBuffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["verify"],
    );
  } catch (error) {
    logger.error("Failed to import public key", { error });

    throw new InternalError("Failed to import public key");
  }
}

export async function verifyJwt(
  jwt: string,
  publicKeyPem: string,
): Promise<JWTClaims> {
  const logger: Logger = new DefaultLogger();

  const parts = jwt.split(".");
  if (parts.length !== 3) throw new UnauthorizedError("Invalid JWT format");

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(
      new TextDecoder().decode(base64urlToUint8Array(headerB64)),
    ) as { alg?: string };
  } catch {
    throw new UnauthorizedError("Invalid JWT header");
  }
  if (header.alg !== "RS256") {
    throw new UnauthorizedError("Unsupported JWT algorithm");
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToUint8Array(signatureB64);

  return importPublicKey(publicKeyPem).then((publicKey) => {
    return crypto.subtle
      .verify({ name: "RSASSA-PKCS1-v1_5" }, publicKey, signature, signingInput)
      .catch((error) => {
        logger.error("Error during JWT signature verification", { error });

        throw new InternalError("Error during JWT signature verification");
      })
      .then((isValid) => {
        if (!isValid) {
          logger.error("JWT signature verification failed");

          throw new UnauthorizedError("Invalid JWT signature");
        }
        logger.info("JWT signature verified successfully");

        const payloadJson = new TextDecoder().decode(
          base64urlToUint8Array(payloadB64),
        );

        let claims: JWTClaims;
        try {
          claims = JSON.parse(payloadJson) as JWTClaims;
        } catch (error) {
          logger.error("Error parsing JWT payload", { error });
          throw new UnauthorizedError("Invalid JWT payload");
        }

        const now = Math.floor(Date.now() / 1000);

        if (claims.exp < now) {
          logger.warn("JWT has expired", {
            jti: claims.jti,
            exp: claims.exp,
            now,
          });

          throw new UnauthorizedError("JWT has expired");
        }

        if (claims.nbf > now) {
          logger.warn("JWT not valid yet (nbf)", {
            jti: claims.jti,
            nbf: claims.nbf,
            now,
          });

          throw new UnauthorizedError("JWT not valid yet");
        }

        return claims;
      });
  });
}
