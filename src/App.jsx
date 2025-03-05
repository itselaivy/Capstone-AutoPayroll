import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; 
import Login from './pages/Login';
import ProtectedRoute from './routes/ProtectedRoute';
import MainLayout from './components/Layout';


const App = () => {
  return (
    <Router>
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />} />
            <Route path="/*" element={<MainLayout />} />
        </Routes>
    </Router>
  );
};

export default App;
