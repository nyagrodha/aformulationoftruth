import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { RequestHandler } from 'express';
import { env, sessionCookieConfig } from '../config/env.js';
import { getPool } from '../db/pool.js';

const PgStore = connectPgSimple(session);

const store = env.NODE_ENV === 'test'
  ? new session.MemoryStore()
  : new PgStore({
      pool: getPool(),
      tableName: 'session'
    });

export const sessionMiddleware: RequestHandler = session({
  store,
  secret: env.SESSION_SECRET,
  name: sessionCookieConfig.name,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: sessionCookieConfig.maxAge,
    httpOnly: sessionCookieConfig.httpOnly,
    sameSite: sessionCookieConfig.sameSite,
    secure: sessionCookieConfig.secure
  }
});
