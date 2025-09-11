import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { createContext } from 'react';
export const ThemeContext = createContext(null);
export function ThemeProvider({ children }) { return _jsx(_Fragment, { children: children }); }
export function useTheme() { return { theme: 'dark' }; }
