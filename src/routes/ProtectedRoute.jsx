import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
    // Check if the user is logged in (you can replace this with actual authentication logic)
    const isAuthenticated = localStorage.getItem('userToken'); 

    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
