import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar        from './components/Navbar';
import Login         from './components/Login';
import Questionnaire from './components/Questionnaire';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/components/Login" element={<Login />} />
        <Route path="/components/callback" element={<Callback />} />
        <Route path="/components/questions" element={<Questionnaire />} />
      </Routes>
    </BrowserRouter>
  );
}
