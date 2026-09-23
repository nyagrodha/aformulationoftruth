// Keep old URLs predictable without exposing stored identities or messages.
export function directoryRedirect(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: '/people', 'Cache-Control': 'no-store' },
  });
}

export function messengerUnavailable(): Response {
  return Response.json({ error: 'messaging_unavailable' }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}
