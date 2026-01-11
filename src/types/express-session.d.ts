import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfSecret?: string;
    userEmail?: string;
    userPhone?: string;
    authenticatedAt?: string;
    authMethod?: 'password' | 'magic_link' | 'otp';
  }
}
