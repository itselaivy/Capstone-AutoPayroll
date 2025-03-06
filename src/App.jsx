import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminMainLayout from './components/AdminLayout';
import UserMainLayout from './components/Layout';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />

        {/* Protected routes for authenticated users */}
        <Route element={<ProtectedRoute />}>
          <Route path="/admin/*" element={<AdminMainLayout />} />
          <Route path="/user/*" element={<UserMainLayout />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;