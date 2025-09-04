import React from 'react';
interface Props {
  isVisible: boolean;
  title: string;
}

export default function LoadingOverlay({ isVisible, title }: Props) {
  if (!isVisible) return null;
  
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'grid', placeItems: 'center', zIndex: 999
    }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem' }}>{title}</h2>
        <p>Please wait...</p>
      </div>
    </div>
  );
}
