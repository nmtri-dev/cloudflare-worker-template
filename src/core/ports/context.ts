export interface AppVariables {
  requestId: string;
  principalId: string;
  principalType: string;
  principalRoles: string[];
}

export class AppContext {
  constructor(public variables: AppVariables) {}
}
