import React from 'react';
import { Layout } from 'antd';

const { Content } = Layout;

const AdminContentArea = ({ children, contentOverflow, headerHeight }) => {
  return (
    <Content
      style={{
        padding: '20px',
        minHeight: `calc(100vh - ${headerHeight}px)`,
        background: '#DCEFFF',
        overflowY: contentOverflow,
        position: 'relative',
      }}
    >
      {children}
    </Content>
  );
};

export default AdminContentArea;