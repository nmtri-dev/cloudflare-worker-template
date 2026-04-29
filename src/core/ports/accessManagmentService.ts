export interface AccessManagementService {
  authorize(
    principalType: string,
    principalRoles: string[],
    resource: string,
    action: string,
  ): Promise<void>;
}
