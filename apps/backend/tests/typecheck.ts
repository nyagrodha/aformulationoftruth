import { z } from 'zod';
import { pgTable } from 'drizzle-orm/pg-core';

const schema = z.object({ id: z.number() });
const table = pgTable('users', {});
