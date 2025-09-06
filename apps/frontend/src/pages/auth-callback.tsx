import React, { useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const from = (location.state as any)?.from?.pathname || '/questionnaire';

  useEffect(() => {
    const go = async () => {
      try {
        if (!token) { navigate('/login', { replace: true }); return; }
        await api.get(`/api/auth/verify?token=${encodeURIComponent(token)}`);
        await refresh();
        navigate(from, { replace: true });
      } catch (e) {
        console.error('Verify failed:', e);
        navigate('/login', { replace: true });
      }
    };
    void go();
  }, [token, navigate, refresh, from]);

  return <div style={{ padding: 24, textAlign: 'center' }}>Verifying your link…</div>;
}
