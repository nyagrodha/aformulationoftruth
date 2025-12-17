export type ServiceErrorCode =
  | 'USER_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'RESET_INVALID'
  | 'RESET_EXPIRED'
  | 'OTP_NOT_CONFIGURED'
  | 'OTP_INVALID_EMAIL'
  | 'OTP_INVALID_PHONE'
  | 'OTP_INVALID_CODE'
  | 'OTP_SEND_FAILED'
  | 'OTP_VERIFY_FAILED'
  | 'OTP_RATE_LIMITED'
  | 'OTP_EXPIRED';

export class ServiceError extends Error {
  public statusCode: number;

  constructor(public code: ServiceErrorCode, message?: string, statusCode: number = 400) {
    super(message ?? code);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}
