import { Handlers } from '$fresh/server.ts';
import { increment } from '../../../lib/metrics.ts';
import { getCurrentMoneroTipAddress } from '../../../lib/tip_jar_bridge.ts';

export const handler: Handlers = {
  async GET(_req, _ctx) {
    increment('requests.api');

    try {
      const monero = await getCurrentMoneroTipAddress();

      return new Response(JSON.stringify({ status: 'ok', monero }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (_error) {
      console.error('[tip-jar] Failed to load current Monero address');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Monero tip address unavailable',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      );
    }
  },
};
