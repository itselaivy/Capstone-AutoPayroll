import React, { useState } from 'react';
import { Layout, Menu, Modal } from 'antd'; // Add Modal to imports
import { useNavigate } from 'react-router-dom'; 
import {
  UserOutlined,
  DashboardOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import logo from '../assets/logo.png';

const { Sider } = Layout;

const Sidebar = ({ collapsed, setSelectedKey }) => {
  const [selectedKey, setSelected] = useState('1'); 
  const [isModalVisible, setIsModalVisible] = useState(false); // Add state for modal
  const navigate = useNavigate(); 

  const handleMenuClick = (e) => {
    setSelected(e.key);
    setSelectedKey(e.key);
  };

  // Show logout modal
  const showLogoutModal = () => {
    setIsModalVisible(true);
  };

  // Handle logout confirmation
  const handleLogoutConfirm = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
    setIsModalVisible(false);
  };

  // Handle modal cancel
  const handleLogoutCancel = () => {
    setIsModalVisible(false);
  };

  const menuItems = [
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/Admin/' },
    { key: '2', icon: <UserOutlined />, label: 'User Account', route: '/Admin/adminuseraccount' },
    { key: '3', icon: <LogoutOutlined />, label: 'Logout', onClick: showLogoutModal }, // Updated to show modal
  ];

  return (
    <>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        collapsedWidth={100}
        style={{ background: '#1D3863' }}
      >
        {/* Logo & Label */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px',
          background: '#1D3863'
        }}>
          <img
            src={logo}
            alt="AutoPayroll"
            style={{ width: collapsed ? 60 : 110, transition: 'width 0.3s ease' }}
          />
          {!collapsed && (
            <span style={{
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: 10
            }}>
              AutoPayroll
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          style={{ background: '#1D3863', color: 'white', borderRadius: 6 }}
        >
          {menuItems.map((item) => (
            <Menu.Item
              key={item.key}
              icon={item.icon}
              style={{
                background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                color: selectedKey === item.key ? '#000' : 'white',
              }}
              onClick={() => {
                if (item.onClick) {
                  item.onClick();
                } else {
                  navigate(item.route);
                }
              }}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu>
      </Sider>

      {/* Logout Confirmation Modal */}
      <Modal
        title="Confirm Logout"
        visible={isModalVisible}
        onOk={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        okText="Yes, Logout"
        cancelText="No, Stay"
        okButtonProps={{ danger: true }}
        centered // Centers the modal
      >
        <p>Are you sure you want to logout?</p>
      </Modal>
    </>
  );
};

export default Sidebar;