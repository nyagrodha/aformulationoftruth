import React, { createContext, useContext } from 'react';
export const ThemeContext = createContext(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function useTheme() { return { theme: 'dark' }; }
