import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

// A simple integration test to ensure the main App component renders correctly.
describe('App Component', () => {
  it('renders the main authentication page for unauthenticated users', () => {
    // We render the entire App component.
    // By default, the `useAuth` hook will likely return `isAuthenticated: false`.
    render(<App />);

    // We check if the main heading from your AuthPage is present in the document.
    // This confirms that the routing logic is working correctly for the initial load.
    const headingElement = screen.getByText(/you are this moment/i);
    expect(headingElement).toBeInTheDocument();

    // We can also check for the button to ensure the page is fully rendered.
    const beginButton = screen.getByRole('button', { name: /Begin the questionnaire/i });
    expect(beginButton).toBeInTheDocument();
  });
});
