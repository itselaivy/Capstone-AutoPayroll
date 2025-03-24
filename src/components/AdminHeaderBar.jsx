import React from 'react';
import { Layout, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

const { Header } = Layout;

const AdminHeaderBar = ({ collapsed, setCollapsed }) => {
  return (
    <Header
      style={{
        padding: '0 20px',
        background: '#1D3863',
        height: 64,
        lineHeight: '64px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Button
        type="text"
        icon={<MenuOutlined style={{ color: 'white', fontSize: '22px' }} />}
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: 48,
          height: 48,
        }}
      />
    </Header>
  );
};

export default AdminHeaderBar;