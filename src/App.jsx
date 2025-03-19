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
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
      } finally {
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
            <div className="dual-ring">
              <div className="orbit-dot orbit-dot-1"></div>
              <div className="orbit-dot orbit-dot-2"></div>
            </div>
            <Text className="reload-text">Loading Application...</Text>
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