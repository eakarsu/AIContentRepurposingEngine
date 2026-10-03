import AppSidebar from './components/AppSidebar';
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FeaturePage from './pages/FeaturePage';
import ItemDetail from './pages/ItemDetail';
import AdvancedTools from './pages/AdvancedTools';
import CustomViewsPage from './pages/CustomViewsPage';

import CodexCustomVizFeature from './pages/CodexCustomVizFeature';
import CodexOperationsFeature from './pages/CodexOperationsFeature';

import TimelineView from './pages/TimelineView';
import ChannelFatiguePage from './pages/ChannelFatiguePage';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" replace />;
}

function SidebarFrame({ children }) {
  const location = useLocation();
  const show = Boolean(localStorage.getItem('token')) && location.pathname !== '/';
  return <div className={show ? 'codex-nav-shell' : undefined}>
    {show && <AppSidebar />}
    {children}
  </div>;
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
      <SidebarFrame><Routes>
        <Route path="/insights/timeline" element={<TimelineView />} />
        <Route path="/codex/custom-viz" element={<CodexCustomVizFeature />} />
        <Route path="/codex/operations" element={<CodexOperationsFeature />} />

        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/advanced" element={<PrivateRoute><AdvancedTools /></PrivateRoute>} />
        <Route path="/feature/:featureName" element={<PrivateRoute><FeaturePage /></PrivateRoute>} />
        <Route path="/feature/:featureName/:id" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />

        <Route path="/custom-views" element={<PrivateRoute><CustomViewsPage /></PrivateRoute>} />
        <Route path="/channel-fatigue" element={<PrivateRoute><ChannelFatiguePage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes></SidebarFrame>
    </div>
  );
}

export default App;
