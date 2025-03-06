import React from 'react'
import { Layout } from 'antd'

import AdminDashboard from '../pages/Admin/AdminDashboard';
import UserAccount from '../pages/Admin/AdminUserAccount';


const { Content } = Layout

const AdminContentArea = ({ selectedKey, colorBgContainer, borderRadiusLG }) => {
  // Map selected keys to components
  const renderContent = () => {
    switch (selectedKey) {
      case '1': return <AdminDashboard />
      case '2': return <UserAccount />
      default: return <h2>Select a menu item</h2>
    }
  }

  return (
    <Content
      style={{
        margin: '24px 16px',
        padding: 24,
        minHeight: 280,
        background: 'colorBgContainer',
        borderRadius: '200px',
      }}
    >
      {renderContent()}
    </Content>
  )
}

export default AdminContentArea
