// apps/backend/src/types/session.d.ts
import "express-session";
declare module "express-session" {
  interface SessionData {
    questionOrder?: number[];
    currentQuestionIndex?: number;
    userId?: string;
  }
}
