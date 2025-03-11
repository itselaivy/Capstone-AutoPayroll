import React from 'react';
import { Layout, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

const { Header } = Layout;

const UserHeaderBar = ({ collapsed, setCollapsed }) => {
  return (
    <Header 
      style={{ 
        padding: 0, 
        background: '#1D3863', 
        textAlign: 'left',
        height: 64, // Increased from default 64px to 80px
        lineHeight: '80px' // Match the height for vertical centering
      }}
    > 
      <Button
        type="text"
        icon={<MenuOutlined style={{ color: 'white', fontSize: '26px' }} />} // Increased icon size from 22px to 26px
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: 56,  // Increased from 48 to 56
          height: 56, // Increased from 48 to 56
          marginLeft: 12, // Added slight margin for better spacing
        }}
      />
    </Header>
  );
}

export default UserHeaderBar;