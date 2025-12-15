import React, { useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const from = (location.state as any)?.from?.pathname || '/questionnaire';

  useEffect(() => {
    const go = async () => {
      try {
        if (!token) {
          navigate('/login?error=missing_token', { replace: true });
          return;
        }

        const response = await api.get(`/api/auth/verify?token=${encodeURIComponent(token)}`);

        if (response.data?.ok && response.data?.user) {
          // Set the authenticated user
          (auth as any).setAuthenticatedUser(response.data.user);
          navigate(from, { replace: true });
        } else {
          throw new Error('Invalid response from verification');
        }
      } catch (e) {
        console.error('Verify failed:', e);
        navigate('/login?error=verification_failed', { replace: true });
      }
    };
    void go();
  }, [token, navigate, auth, from]);

  return <div style={{ padding: 24, textAlign: 'center' }}>Verifying your link…</div>;
}
