import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { verifyPaymentCodeAsAdmin } from '../../../lib/payment-codes.ts';

const requestSchema = z.object({
  code: z.string().regex(/^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});

async function getAdminFromAuth(): Promise<{ isAdmin: boolean; message?: string }> {
  // TODO: Verify JWT signature and check admin role
  return { isAdmin: false, message: 'Admin authentication not yet implemented' };
}

export const handler = async (req: Request, ctx: FreshContext) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = await getAdminFromAuth();
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.message || 'Not authorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid code format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await verifyPaymentCodeAsAdmin(body.code);

    if (result.success) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Admin verification failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to verify payment code' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

// SECURITY: Do not deploy until JWT verification is implemented
