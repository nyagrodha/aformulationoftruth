export type ServiceErrorCode =
  | 'USER_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'RESET_INVALID'
  | 'RESET_EXPIRED';

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ServiceError';
  }
}
