import type { Pool } from 'pg';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
  role?: UserRole;
}

const userColumns = `
  id,
  email,
  username,
  password_hash AS "passwordHash",
  role,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export async function createUser(pool: Pool, input: CreateUserInput): Promise<User> {
  const { email, username, passwordHash, role = 'user' } = input;
  const query = {
    text: `
      INSERT INTO users (email, username, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING ${userColumns}
    `,
    values: [email.toLowerCase(), username.toLowerCase(), passwordHash, role]
  };
  const result = await pool.query<User>(query);
  return result.rows[0];
}

export async function findUserByEmail(pool: Pool, email: string): Promise<User | undefined> {
  const result = await pool.query<User>(
    `SELECT ${userColumns} FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );
  return result.rows[0];
}

export async function findUserById(pool: Pool, id: string): Promise<User | undefined> {
  const result = await pool.query<User>(
    `SELECT ${userColumns} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0];
}

export async function findUserByUsername(pool: Pool, username: string): Promise<User | undefined> {
  const result = await pool.query<User>(
    `SELECT ${userColumns} FROM users WHERE username = $1 LIMIT 1`,
    [username.toLowerCase()]
  );
  return result.rows[0];
}

export async function updateUserPassword(pool: Pool, userId: string, passwordHash: string): Promise<void> {
  await pool.query(
    `
      UPDATE users
      SET password_hash = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, passwordHash]
  );
}
