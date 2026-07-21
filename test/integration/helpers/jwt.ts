import { importPKCS8, SignJWT } from "jose";

// Test RSA private key — corresponds to the public key in vitest.integration.config.mts.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDkN9mHWhKsncrs
FVNnFAeBo1NcS7/WNN+g8jChNFYJsrPLbbRRr7PQLmL6gvGej0rGEyeycL1Vin87
ZFQ+QopsPhZjVMIJnhYg1t/9rSPOMaJ25ML+EIJnJ6XwpAv1wbCsbTXM5msGmjIm
tYaHqfeqMYzvRh0433NVAFs+wsFMiPCFfdHZLSOxqYLz6m1L9/yBUAmoQaky5YsW
aCcTD77LGLRUb9AJgVKbsH1JIUVK5X39A7LfmW0U06Ym0ByHfDLle9q84cmYuFgO
s18QMpshdtS+dN03TXVUCPi+01gLTutgjyMlEyodiDY75z3bG40KxNszLvEAhMX9
ScEZBQLlAgMBAAECggEAISoTkLWQcqjAkSO9OcTBnX9yUP6KC3MmD1G6quZ73U9s
jNKtqlQ97XIcPJrUSW4518R3V5lGDl0Axcz76AtL6dRw9PDffL3OKeoH5WmogyGX
4i62vmyAQsTSesCgI0/JIJmDQLo4Ud6NDK6C9QqIXOF0AV5/RyFDtZXGbL2pEPms
NOXsLeAcpZ7sdgVMqUjpik59KYr7jJx7HP+iV2O1iHHdsBOq443Vc3VMcoEWtbNP
HogeEP0Xe1XcFT7DtfR8tnlRoEe2S2SDntVURNoPKztBZyVedPD/Si1r9dq8Zlhk
F+yuJCpRua0dUKOa2Ifzqj+1clpZM7KDbmlz00E6cQKBgQD2Nj+NDSP+H7J5pVqI
FEqOjPcl61Y6cDexHI6faFq50bVT/Re+fJNyCGRIGbaKpJxlLSG8uZ49VyGwooRt
yK+L0i5JtE8U4K0lDwJ0N92jkC8Vg4FUe8mPcxn6WPaP2Z9mDqh40gPkefoNqoqI
KBUqZnJ9Laf+V6dVZU618Z60UQKBgQDtSnmqRLMfdk2rP3muRaxfWI/7OUG3LFE+
Re1pgbM2vRlDnwtF2L0d0hpr57TU+/4Q1vIe3nSeUj09p1MYkscfzwiCOgDaJZC/
CrabQu4JHoEErz9tcNYtvPLjPdNrvolfbIFKrqem5DaQHen6mKQJ+OWZH2lZ8gij
twzuw0vkVQKBgQDpERU7mpLVvn+ec46tfjfNlVdnh80KaKvvdo70Cz7G4+L4bH8L
jLWuno7/SYfo2kZJ6F0lX7iRbGex40Xk/rJec0np70tlAgIlMH4sMa4XZSeM//1v
UfbNWjHfMFPGfEVNwNZt+LBCmczBHw0gMoFGr8/0+0EpnSQDzHCj/uMy4QKBgQC3
4Mtw/zWS/tjnCBQh0MnnRLimI9Nhv0zhpcx4wtH+bADE3t0cbfz2u9ZPockGdpOF
txr+gsH54Z6lRSFmXG9DneppB8ubQBrvf7zLicztch7mY2sSQqsl3FKXd1R7HLZV
JL74AWnXMOd7PEMRNvF+7Mn2o1m/IohBXVr/NoV71QKBgBnVUlG02lN6HmO/bgEk
SelEexyOpXxfxcULOGGq89ine1Ow1O3JfBw4f1dEyLUt1M5hNcFXnJGpKj2I2rN2
Xw4XJzO9lrXliHNMFpTaYIIYCkiBfDdENfMbHXGE18DY01O39ZZfy5rlLW8QqQPc
zxSGX5+Frn9UKZn5zQMboEea
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
