import React from 'react';
import { Layout, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

const { Header } = Layout;

const AdminHeaderBar = ({ collapsed, setCollapsed }) => {
  return (
    <Header style={{ padding: 0, background: '#1D3863', textAlign: 'left' }}> 
      <Button
        type="text"
        icon={<MenuOutlined style={{ color: 'white', fontSize: '22px' }} />} // White Hamburger Icon
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: 48,
          height: 48,
        }}
      />
    </Header>
  );
}

export default AdminHeaderBar;