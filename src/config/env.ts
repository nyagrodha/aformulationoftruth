import { config as loadEnv } from 'dotenv';
import { networkInterfaces } from 'os';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters long'),
  COOKIE_NAME: z.string().default('aform_session'),
  SESSION_MAX_AGE_MS: z.coerce.number().default(1000 * 60 * 60 * 24),
  AUTH_MODE: z.enum(['password', 'oauth', 'jwt']).default('password'),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(5),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(30),
  APP_BASE_URL: z.string().url().optional(),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return true;
      }
      const normalized = value.trim().toLowerCase();
      return !(normalized === 'false' || normalized === '0');
    }),
  DATABASE_CA_CERT_PATH: z.string().optional(),
  VPN_INTERFACE: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Failed to parse environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

ensureSecureNetworkConfiguration(env);

function ensureSecureNetworkConfiguration(environment: typeof env): void {
  if (environment.NODE_ENV === 'test') {
    return;
  }

  const requiredDatabaseHost = 'gimbal.fobdongle.com';
  let hostname: string | undefined;

  try {
    const dbUrl = new URL(environment.DATABASE_URL);
    hostname = dbUrl.hostname;

    if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
      throw new Error(`DATABASE_URL must use postgres or postgresql protocol, received ${dbUrl.protocol}`);
    }

    if (hostname !== requiredDatabaseHost) {
      throw new Error(`DATABASE_URL must point to ${requiredDatabaseHost}; received ${hostname}`);
    }

    const sslMode = dbUrl.searchParams.get('sslmode');
    if (!sslMode || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      throw new Error('DATABASE_URL must specify sslmode=require, verify-ca, or verify-full for encrypted transport');
    }
  } catch (error) {
    console.error('Invalid DATABASE_URL configuration', error);
    throw error;
  }

  if (!environment.VPN_INTERFACE || environment.VPN_INTERFACE.trim() === '') {
    throw new Error('VPN_INTERFACE must be set to the active VPN network interface');
  }

  const interfaces = networkInterfaces();
  const vpnInterface = interfaces[environment.VPN_INTERFACE];

  if (!vpnInterface || vpnInterface.length === 0) {
    throw new Error(
      `VPN interface ${environment.VPN_INTERFACE} is not active. Ensure the encrypted tunnel is established before starting the server.`
    );
  }
}

export const sessionCookieConfig = {
  name: env.COOKIE_NAME,
  maxAge: env.SESSION_MAX_AGE_MS,
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: isProduction
};

export const rateLimitDefaults = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX
};
