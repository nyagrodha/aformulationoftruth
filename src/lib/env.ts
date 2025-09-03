import { z } from "zod";

export const Env = z.object({
  NODE_ENV: z.enum(["development","test","production"]).default("development"),
  PORT: z.string().regex(/^\d+$/).default("3000"),
  SESSION_SECRET: z.string().min(16),
  // Google bits are optional in dev when using mock
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional()
});

export type EnvType = z.infer<typeof Env>;

export function loadEnv() {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error("Invalid environment: " + issues);
  }
  return parsed.data;
}
