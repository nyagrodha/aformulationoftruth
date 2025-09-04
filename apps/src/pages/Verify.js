// frontend/src/pages/Verify.js
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/api';

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login');
      return;
    }

    (async () => {
      try {
        // Call backend to validate the magic-link token and get a session JWT
        const { data } = await api.get(`/user/magic-link/verify?token=${encodeURIComponent(token)}`);
        if (data?.token) {
          localStorage.setItem('authToken', data.token);
          navigate('/proust', { replace: true });
        } else {
          navigate('/login');
        }
      } catch (e) {
        console.error('Verify failed:', e);
        navigate('/login');
      }
    })();
  }, [navigate, params]);

  return <p style={{ padding: 24 }}>Verifying your link…</p>;
