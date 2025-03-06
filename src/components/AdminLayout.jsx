import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from './AdminSidebar';
import HeaderBar from './AdminHeaderBar';
import { Routes, Route } from 'react-router-dom';

import AdminDashboard from '../pages/Admin/AdminDashboard';
import UserAccount from '../pages/Admin/AdminUserAccount';

const { Content } = Layout;

const AdminMainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('1');

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh', background: '#DCEFFF' }}>
      <Sidebar collapsed={collapsed} setSelectedKey={setSelectedKey} />
      <Layout style={{ background: '#DCEFFF' }}>
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />
        <Content style={{ padding: '20px' }}>
        <Routes>
          <Route path="/" element={<AdminDashboard />} /> {/* Default route */}
          <Route path="/Admin/adminuseraccount" element={<UserAccount />} /> {/* Nested route */}
        </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminMainLayout;