export interface JWTClaims {
  jti: string;
  iss: string;
  aud: string;
  sub: string;
  nbf: number;
  iat: number;
  exp: number;
}

export interface AccessTokenClaims extends JWTClaims {
  principal_type: string;
  principal_roles: string[];
}
