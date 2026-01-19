import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Home } from '../pages/Home/Home';
import { Browser } from '../pages/Browser/Browser';
import { Settings } from '../pages/Settings/Settings';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browser />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
};
