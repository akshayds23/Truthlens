import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './store/appContext';
import LandingPage from './pages/LandingPage';
import Progress from './pages/Progress';
import Results from './pages/Results';
import History from './pages/History';
import Settings from './pages/Settings';

import Navigation from './components/Navigation';

function AppRoutes() {
  return (
    <>
      <Navigation />
      <Routes>
        {/* ── Public routes ── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/progress/:claimId" element={<Progress />} />
        <Route path="/results/:claimId" element={<Results />} />
        <Route path="/report/:claimId" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </Router>
  );
}
