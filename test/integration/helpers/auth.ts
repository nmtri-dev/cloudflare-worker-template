import { generateJWT } from "./jwt";

export async function getAuthorizationHeader(
  principalType: string = "user",
  principalRoles: string[] = ["admin"],
): Promise<string> {
  const token = await generateJWT({ principalType, principalRoles });
  return `Bearer ${token}`;
}
