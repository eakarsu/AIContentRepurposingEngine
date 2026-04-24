import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FeaturePage from './pages/FeaturePage';
import ItemDetail from './pages/ItemDetail';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" replace />;
}

function App() {
  return (
    <div className="App">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a2e',
            color: '#fff',
            borderRadius: '12px',
            border: '1px solid rgba(108, 99, 255, 0.3)',
          },
          success: {
            iconTheme: { primary: '#00d2ff', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ff6b6b', secondary: '#fff' },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/feature/:featureName" element={<PrivateRoute><FeaturePage /></PrivateRoute>} />
        <Route path="/feature/:featureName/:id" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />
      </Routes>
    </div>
  );
}

export default App;
