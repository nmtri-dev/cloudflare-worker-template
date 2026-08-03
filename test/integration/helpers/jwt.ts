import { importPKCS8, SignJWT } from "jose";

// Test RSA private key — corresponds to the public key in vitest.integration.config.mts.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC53e2daHhcRVSw
D3nbFZXLpIHu88V/UY7121IWykMmGrF4R+s19x89CPqIb3ssCMV/X90h7/SBbD+U
NvpTCs4fHV7PSwMV0tgzkYzVD2p62YRFw2KG/PwzFaO+HG2h6VqaPSOafO6CMX8z
V+WtrDYpdvQHKiumLiOyuySPNrr4pGDE//fIbnvOettWepDIjeoYFozP+ZEu2Jrn
iKq9rf/ufMJJT4JuxtJv550jCog7JC/12DVlfOLGzFRfyzZqF6jT9pnz7qE4+inU
K0T4ptqaevFDWOdORa8JmAb801LToUb0HoCXRrY1cY9sM1kiTJJRgntdEBRfFF57
U1NtaK0XAgMBAAECggEAAL0gA+4R2QM6e9frf0+mtByHZqrPuF8RyZo/RynYGuxp
1NBw+f96W65xVguPmGY2JznHLzei7ktoJCKW26+1df7GpzSmU2v/0R0y5647evrq
HZgO3O09Rte4lVoiY3SeNoGdBwnZVuDMmxc28R7hLiGFOzrOCV9y90g9akzJK5n2
iWQ/j3L3zw1oyHmfHminW42mPrVj1ahl+qcp5z+QJWtyHCR0xibSEqc2WDjMemE/
7j6Q9ADnSX3QInXBPFTayjPPazGrTJgYhylo+3UfEP+qx+i4o3y/t3K/Y5bk9/bt
87XrkaetA1/tqTk0gzOd3d6pd+6mHunULokzSpNEkQKBgQDbTXzg0Oqsgv0jyE4+
qOJ3JNTdlu+E17mor5DDUkEpRojZgSRNvHTw+6bs2xFeqscoZUf7/TdsFIaA78Sf
ou1F5UN3yIedcFUUC4sIK5gGW2RjQvMTcm2hxOLPERXzCAhGV4aPjcSm0VZ3nk4v
S8K+GyFNNMA4vsD/tA6VfwydKQKBgQDY+B1lhLZtLq1EgMy55lO2o+mvNESHo0OM
ZPwjR4md+Q55EatHlnwaElzsmirg2PjMsladHzjJCwn6i9W3hiGsGaJuuHM0usO6
+86NVYJpsNmj9JggTxQmQok4jkQL6pzuoEihN+PhDUOiUuYbGMGDMr7Gs1CnxThk
d2O6Gp4APwKBgAlelidExcH5FregpzcmIAbXHAEbocAbN2NtnNG7ge0xhkdErThl
BNoG5mrYMTXKNhgTu6+YcfW8KsL3e38WhuyljuxfNOwVEI16sMX4ltYusWtMQPZj
vStcLhSKtlVb0n6u3qDjfbNi3j7eFJkQs5FLt3CFAHFsNPK3zqe0deWBAoGAHqZe
MLsgsifH3kd7pD8/UCuzlUaC785GeozBeZJfhGtsefnfAkvl2CED84CL0huUegYv
ah7A/NWMYVJjrHtMQm2UnqN70tUXVVDBCwIrXBbZh+nDm7zQEd+QVubyAeTwql0G
JZAppt8i0Ml5LBbBL3F5tcQa/rhDkR20ftPHwi0CgYB03ikoURcAypOxTlngNiVa
k4x/JUc7ry+rOwBbO0pNmGdxJhoVNPEAm0RbfJZpneQboYpuX3qcUsYm1KTwpmLe
Bmh2g8ehZYbdzfap7DSedPUIv7FAv4D8oc23guBvakYWeXNSIAZQ80d80jYkze3k
9Y5vPKsh66yuXj4VPgxyNA==
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
