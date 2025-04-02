import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Typography } from 'antd';
import Login from './pages/Login';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminMainLayout from './components/AdminLayout';
import UserMainLayout from './components/Layout';
import './index.css';

const { Text } = Typography;

const App = () => {
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      const start = Date.now();
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } finally {
        const elapsed = Date.now() - start;
        const minDuration = 1500;
        const remaining = minDuration - elapsed;
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, remaining));
        }
        setLoading(false);
        setIsInitialLoad(false);
      }
    };

    initializeApp();

    const handleBeforeUnload = () => setLoading(true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <div className="app-wrapper">
      {loading && isInitialLoad && (
        <div className="reload-overlay">
          <div className="reload-loader">
            <div className="spinner-core">
              <div className="spinner-ring"></div>
              <div className="spinner-arc"></div>
            </div>
            <Text className="reload-text">Loading AutoPayroll</Text>
          </div>
        </div>
      )}

      <div className={`app-content ${loading && isInitialLoad ? 'hidden' : ''}`}>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/admin/*" element={<AdminMainLayout />} />
              <Route path="/user/*" element={<UserMainLayout />} />
            </Route>
          </Routes>
        </Router>
      </div>
    </div>
  );
};

export default App;