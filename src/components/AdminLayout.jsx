import React, { useState, useEffect } from 'react';
import { Layout, theme } from 'antd';
import { useLocation } from 'react-router-dom';
import Sidebar from './AdminSidebar';
import HeaderBar from './AdminHeaderBar';
import AdminContentArea from './AdminContentArea';
import { Routes, Route } from 'react-router-dom';
import AdminDashboard from '../pages/Admin/AdminDashboard';
import AdminUserAccount from '../pages/Admin/AdminUserAccount';
import UserActivityLogs from '../pages/Admin/UserActivityLogs';

const { Content } = Layout;

const AdminMainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('1');
  const [contentOverflow, setContentOverflow] = useState('hidden');
  const location = useLocation();

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const headerHeight = 64;

  useEffect(() => {
    const updateContentOverflow = () => {
      const contentElement = document.querySelector('.ant-layout-content');
      if (contentElement) {
        const contentHeight = contentElement.scrollHeight;
        const viewportHeight = window.innerHeight - headerHeight;
        setContentOverflow(contentHeight > viewportHeight ? 'auto' : 'hidden');
      }
    };

    updateContentOverflow();
    window.addEventListener('resize', updateContentOverflow);
    const observer = new MutationObserver(updateContentOverflow);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', updateContentOverflow);
      observer.disconnect();
    };
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh', background: '#DCEFFF' }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} setSelectedKey={setSelectedKey} />
      <Layout
        style={{
          marginLeft: collapsed ? 100 : 250,
          background: '#DCEFFF',
          minHeight: '100vh',
          transition: 'margin-left 0.3s',
        }}
      >
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />
        <AdminContentArea contentOverflow={contentOverflow} headerHeight={headerHeight}>
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/adminuseraccount" element={<AdminUserAccount />} />
            <Route path="/adminuseractivity" element={<UserActivityLogs />} />
          </Routes>
        </AdminContentArea>
      </Layout>
    </Layout>
  );
};

export default AdminMainLayout;