import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login        from './components/Login';
import Callback     from './components/Callback';
import Questionnaire from './components/Questionnaire';
import LongScrollShowcase from './components/LongScrollShowcase';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/questions" element={<Questionnaire />} />
        <Route path="/showcase" element={<LongScrollShowcase />} />
      </Routes>
    </BrowserRouter>
  );
}
