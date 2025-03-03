import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import ContentArea from './ContentArea';

const { Content } = Layout;

const MainLayout = () => {
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
          <ContentArea
            selectedKey={selectedKey}
            colorBgContainer={colorBgContainer}
            borderRadiusLG={borderRadiusLG}
          />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
