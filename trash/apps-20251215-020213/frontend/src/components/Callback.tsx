import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function Callback(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      navigate('/questions');
    } else {
      navigate('/');
    }
  }, [params, navigate]);

  return <p>Signing you in…</p>;
}
