import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Start() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/login', { replace: true }); }, [navigate]);
  return <div>Redirecting…</div>;
}
