import { render, screen } from '@testing-library/react';

jest.mock(
  '@vercel/analytics/react',
  () => ({
    Analytics: () => null,
  }),
  { virtual: true },
);

jest.mock('axios', () => {
  const requestInterceptor = { use: jest.fn() };
  return {
    create: jest.fn(() => ({
      interceptors: {
        request: requestInterceptor,
      },
    })),
  };
});

import App from './App';

describe('App routing', () => {
  it('renders the login page on root route', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /A Formulation of Truth/i }),
    ).toBeInTheDocument();
  });
});
