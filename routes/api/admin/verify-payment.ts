import { Handlers } from '$fresh/server.ts';
import { verifyPaymentCodeAsAdmin } from '../../../lib/payment-codes.ts';
import { increment } from '../../../lib/metrics.ts';

function getAdminFromAuth(req: Request): { admin?: boolean; error?: string } {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.slice(7);
  if (!token) {
    return { error: 'Invalid token' };
  }

  // TODO: Verify JWT signature and check admin role
  // SECURITY: Do not deploy until JWT verification is implemented
  // Replace with actual JWT verification:
  // const payload = verifyJWT(token, JWT_SECRET);
  // if (!payload || payload.role !== 'admin') return { error: 'Unauthorized' };
  return { error: 'Admin authentication not yet implemented' };
}

export const handler: Handlers = {
  async POST(req, ctx) {
    increment('requests.api');

    const { admin, error: authError } = getAdminFromAuth(req);
    if (!admin) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const code = ctx.params.code as string;

    if (!code.match(/^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid code format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const result = await verifyPaymentCodeAsAdmin(code);

      if (result.verified) {
        increment('admin.payment_verified');
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        increment('admin.payment_verify_failed');
        return new Response(
          JSON.stringify(result),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('[admin/verify-payment]', error);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ error: 'Verification failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
