import React, { useState, useRef, useEffect } from 'react';
import { Layout, Menu, Modal } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  UserOutlined,
  DashboardOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import logo from '../assets/logo.png';
import './Sidebar.css';

const { Sider } = Layout;

const Sidebar = ({ 
  collapsed, 
  setSelectedKey = () => {},
  setSidebarHeight = () => {},
  setOpenKeysState = () => {}
}) => {
  const [selectedKey, setSelected] = useState('1');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef(null);

  const routeToKeyMap = {
    '/Admin/': '1',
    '/Admin/adminuseraccount': '2',
    '/admin/': '1',
    '/admin/adminuseraccount': '2',
  };

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/$/, '');
    const currentKey = routeToKeyMap[normalizedPath] || '1';
    console.log('Current Path:', normalizedPath, 'Selected Key:', currentKey);
    setSelected(currentKey);
    setSelectedKey(currentKey);
  }, [location.pathname, setSelectedKey, setSelected]);

  const handleMenuClick = (e) => {
    setSelected(e.key);
    setSelectedKey(e.key);
  };

  const showLogoutModal = () => {
    setIsModalVisible(true);
  };

  const handleLogoutConfirm = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
    setIsModalVisible(false);
  };

  const handleLogoutCancel = () => {
    setIsModalVisible(false);
  };

  useEffect(() => {
    const updateSidebarHeight = () => {
      if (sidebarRef.current) {
        const viewportHeight = window.innerHeight;
        sidebarRef.current.style.height = `${viewportHeight}px`;
        setSidebarHeight(viewportHeight);
      } else {
        console.warn('Sidebar ref is not set:', { sidebarRef: !!sidebarRef.current });
      }
    };

    updateSidebarHeight();
    window.addEventListener('resize', updateSidebarHeight);

    return () => {
      window.removeEventListener('resize', updateSidebarHeight);
    };
  }, [setSidebarHeight]);

  const menuItems = [
    { key: 'overview', label: 'OVERVIEW', type: 'group' },
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/Admin/' },
    { key: 'manage', label: 'MANAGE', type: 'group' },
    { key: '2', icon: <UserOutlined />, label: 'User Account', route: '/Admin/adminuseraccount' },
  ];

  const logoutMenuItems = [
    { key: 'session', label: 'SESSION', type: 'group' },
    { key: '3', icon: <LogoutOutlined />, label: 'Logout', onClick: showLogoutModal },
  ];

  return (
    <>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        collapsedWidth={100}
        style={{ 
          background: '#1D3863',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1000,
          height: '100vh',
          overflow: 'hidden',
          willChange: 'width', // Improve animation performance
        }}
        ref={sidebarRef}
      >
        <div 
          className="logo-section"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px',
            background: '#1D3863',
            transition: 'padding 0.3s ease',
            boxSizing: 'border-box',
          }}
        >
          <img
            src={logo}
            alt="AutoPayroll"
            style={{ width: collapsed ? 80 : 120, transition: 'width 0.3s ease' }}
          />
          {!collapsed && (
            <span style={{
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: 10,
              fontFamily: 'Poppins, sans-serif',
              opacity: collapsed ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}>
              AutoPayroll
            </span>
          )}
        </div>

        <div
          style={{ 
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0, // Prevent flexbox shrinkage issues
            overflowY: 'auto',
            background: '#1D3863',
            scrollbarWidth: 'thin',
            scrollbarColor: '#A9BADA #0D1F3C',
            boxSizing: 'border-box',
            willChange: 'height', // Improve animation performance
          }}
          className="custom-scrollbar"
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            style={{ background: '#1D3863', color: 'white', borderRadius: 6, flex: '1 0 auto', fontFamily: 'Poppins, sans-serif' }}
            items={menuItems.map((item) => 
              item.type === 'group' ? {
                key: item.key,
                label: item.label,
                type: 'group',
                style: { 
                  color: '#A9BADA', 
                  fontWeight: 'bold', 
                  cursor: 'default', 
                  pointerEvents: 'none',
                  background: '#0D1F3C',
                  textAlign: collapsed ? 'center' : 'left',
                  padding: collapsed ? '0' : '0 24px',
                  fontFamily: 'Poppins, sans-serif',
                  transition: 'padding 0.3s ease',
                }
              } : {
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.route ? () => navigate(item.route) : undefined,
                style: {
                  background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                  color: selectedKey === item.key ? '#000' : 'white',
                  fontFamily: 'Poppins, sans-serif',
                }
              }
            )}
          />
          <Menu
            theme="dark"
            mode="inline"
            style={{ 
              background: '#1D3863', 
              color: 'white', 
              borderRadius: 6,
              marginTop: '450px', // Keep position as requested
              fontFamily: 'Poppins, sans-serif',
            }}
            items={logoutMenuItems.map((item) => 
              item.type === 'group' ? {
                key: item.key,
                label: item.label,
                type: 'group',
                style: { 
                  color: '#A9BADA', 
                  fontWeight: 'bold', 
                  cursor: 'default', 
                  pointerEvents: 'none',
                  background: '#0D1F3C',
                  textAlign: collapsed ? 'center' : 'left',
                  padding: collapsed ? '0' : '0 24px',
                  marginTop: collapsed ? '90px' : '0', // Keep position as requested
                  fontFamily: 'Poppins, sans-serif',
                  transition: 'padding 0.3s ease, margin-top 0.3s ease', // Animate margin-top
                }
              } : {
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.onClick,
                style: {
                  background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                  color: selectedKey === item.key ? '#000' : 'white',
                  fontFamily: 'Poppins, sans-serif',
                }
              }
            )}
          />
        </div>
      </Sider>

      <Modal
        title={<span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>Confirm Logout</span>}
        open={isModalVisible}
        onOk={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        okText="Yes, Logout"
        cancelText="No, Stay"
        okButtonProps={{ danger: true, style: { fontFamily: 'Poppins, sans-serif' } }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        centered
        bodyStyle={{ padding: '20px', fontFamily: 'Poppins, sans-serif' }}
      >
        <p style={{ fontFamily: 'Poppins, sans-serif' }}>Are you sure you want to logout?</p>
      </Modal>
    </>
  );
};

export default Sidebar;