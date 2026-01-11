import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Questionnaire from './components/Questionnaire';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('./api/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    interceptors: { request: { use: jest.fn() } },
  },
}));

describe('Questionnaire E2E flow', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();

    window.history.pushState({}, '', '/questions?token=token123&email=test@example.com');
    localStorage.clear();
  });

  it('guides the user through answering and completion', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 1, text: 'What is truth?' } })
      .mockResolvedValueOnce({ data: { completed: true } });

    mockPost.mockResolvedValueOnce({});

    const user = userEvent.setup();

    await act(async () => {
      render(<Questionnaire />);
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    const textarea = await screen.findByRole('textbox');
    await act(async () => {
      await user.type(textarea, 'Truth is a pathless land.');
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /submit/i }));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/answers', {
        email: 'test@example.com',
        questionId: 1,
        answer: 'Truth is a pathless land.',
      });
    });

    expect(
      await screen.findByText(/You're all done—thank you/i),
    ).toBeInTheDocument();
  });
});
