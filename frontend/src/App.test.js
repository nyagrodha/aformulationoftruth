import { render, screen } from '@testing-library/react';
import App from './App';
import api from './api/api';

jest.mock('./api/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

describe('App routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    api.get.mockResolvedValue({
      data: { completed: false, id: 1, text: 'Answer the following question.' }
    });
    api.post.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders login form by default', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /sign in with your apotropaic link/i })
    ).toBeInTheDocument();
  });

  test('shows questionnaire when navigating to questions route', async () => {
    window.history.pushState({}, '', '/components/questions');
    render(<App />);
    expect(
      await screen.findByText(/Answer the following question./i)
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/questions/next');
  });
});
