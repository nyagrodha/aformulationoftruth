// Utility helpers for setting HttpOnly session cookies on Vercel functions
export function setSessionCookie(res, token) {
  const isProd = process.env.VERCEL_ENV === 'production';
  const cookie = [
    `session=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    isProd ? 'Secure' : null,
    // 7 days
    `Max-Age=${7 * 24 * 60 * 60}`
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  const cookie = [
    'session=deleted',
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}
