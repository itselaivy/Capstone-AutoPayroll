import React, { useState, useRef, useEffect } from 'react';
import { Collapse, Layout, Menu, Modal, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserOutlined, DashboardOutlined, LogoutOutlined, AccountBookOutlined } from '@ant-design/icons';
import logo from '../assets/logo.png';
import './Sidebar.css';

const { Sider } = Layout;

const Sidebar = ({ collapsed, setCollapsed, setSelectedKey = () => {}, setSidebarHeight = () => {} }) => {
  const [selectedKey, setSelected] = useState('1');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef(null);
  const logoRef = useRef(null);

  const sessionMargins = {
    collapsed: { top: '16px', bottom: '50px' },
    expanded: { top: 'auto', bottom: '70px' },
  };

  const routeToKeyMap = {
    '/admin/': '1',
    '/admin/adminuseraccount': '2',
    '/admin/adminuseractivity': '3',
  };

  useEffect(() => {
    const normalizedPath = location.pathname.toLowerCase().replace(/\/$/, '');
    const currentKey = routeToKeyMap[normalizedPath] || '1';
    setSelected(currentKey);
    setSelectedKey(currentKey);
  }, [location.pathname, setSelectedKey]);

  const logActivity = async (activityType, activityDescription, affectedTable = null, affectedRecordId = null) => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      console.error('User ID not found in localStorage');
      return false;
    }

    try {
      const response = await fetch('http://localhost/AdminTableDB/AdminDB/fetch_activitylogs.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          activity_type: activityType,
          affected_table: affectedTable,
          affected_record_id: affectedRecordId,
          activity_description: activityDescription,
          ip_address: window.location.hostname,
          user_agent: navigator.userAgent,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to log activity');
      }
      console.log('Activity logged:', data);
      return true;
    } catch (error) {
      console.error('Error logging activity:', error.message);
      return false;
    }
  };

  const logLogout = async (userId) => {
    if (!userId) {
      console.error('User ID not found in localStorage');
      return false;
    }

    try {
      const response = await fetch('http://localhost/AdminTableDB/AdminDB/fetch_logout.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to log logout');
      }
      console.log('Logout logged:', data);
      return true;
    } catch (error) {
      console.error('Error logging logout:', error.message);
      return false;
    }
  };

  const handleMenuClick = (e) => {
    if (e.key === '4') {
      setSelected(null);
      setSelectedKey(null);
      showLogoutModal();
    } else {
      setSelected(e.key);
      setSelectedKey(e.key);
      const item = menuItems.find((i) => i.key === e.key);
      if (item?.route) {
        handleNavigation(item.route, item.label);
      }
    }
  };

  const handleNavigation = (route, label) => {
    logActivity(
      'NAVIGATION',
      `Navigated to ${label} page`,
      label === 'User Account' ? 'UserAccounts' : label === 'User Activity' ? 'user_activity_logs' : null
    );
    navigate(route);
  };

  const showLogoutModal = () => {
    setIsModalVisible(true);
  };

  const handleLogoutConfirm = async () => {
    const userId = localStorage.getItem('userId');
    const loggedOut = await logLogout(userId); // Use new logout function
    
    if (loggedOut) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userId');
      navigate('/login');
      setIsModalVisible(false);
      message.success('Logged out successfully!');
    } else {
      message.error('Failed to log logout activity. Please try again.');
    }
  };

  const handleLogoutCancel = () => {
    setIsModalVisible(false);
  };

  useEffect(() => {
    const updateHeights = () => {
      if (sidebarRef.current) {
        const viewportHeight = window.innerHeight;
        sidebarRef.current.style.height = `${viewportHeight}px`;
        setSidebarHeight(viewportHeight);
      }
      if (logoRef.current) {
        const height = logoRef.current.offsetHeight;
        sidebarRef.current.style.setProperty('--logo-height', `${height}px`);
      }
    };
    updateHeights();
    window.addEventListener('resize', updateHeights);
    return () => window.removeEventListener('resize', updateHeights);
  }, [collapsed, setSidebarHeight]);

  const menuItems = [
    { key: 'overview', label: 'OVERVIEW', type: 'group' },
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/admin/' },
    { key: 'manage', label: 'MANAGE', type: 'group' },
    { key: '2', icon: <UserOutlined />, label: 'User Account', route: '/admin/adminuseraccount' },
    { key: '3', icon: <AccountBookOutlined />, label: 'User Activity', route: '/admin/adminuseractivity' },
  ];

  const logoutMenuItems = [
    { key: 'session', label: 'SESSION', type: 'group' },
    { key: '4', icon: <LogoutOutlined />, label: 'Logout' },
  ];

  return (
    <>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
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
        }}
        ref={sidebarRef}
      >
        <div
          ref={logoRef}
          className="logo-section"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px',
            background: '#1D3863',
            height: 'auto',
          }}
        >
          <img 
            src={logo} 
            alt="AutoPayroll" 
            style={{ 
              width: collapsed ? 60 : 110, 
              transition: 'width 0.3s ease',
              marginBottom: '10px'
            }} 
          />
          <span style={{ 
            color: 'white', 
            fontSize: collapsed ? '14px' : '24px',
            fontWeight: 'bold', 
            textAlign: 'center', 
            fontFamily: 'Poppins, sans-serif',
            transition: 'all 0.3s ease',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: collapsed ? '60px' : '100%',
            visibility: collapsed ? 'hidden' : 'visible',
            opacity: 1,
            height: 'auto'
          }}>
            AutoPayroll
          </span>
        </div>

        <div
          style={{
            height: `calc(100vh - ${collapsed ? 80 : 120}px)`,
            display: 'flex',
            flexDirection: 'column',
            background: '#1D3863',
          }}
        >
          <div
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: '#A9BADA #0D1F3C',
            }}
            className="custom-scrollbar"
          >
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[selectedKey]}
              onClick={handleMenuClick}
              style={{ background: '#1D3863', color: 'white' }}
              items={menuItems.map((item) =>
                item.type === 'group'
                  ? {
                      key: item.key,
                      label: item.label,
                      type: 'group',
                      style: {
                        textAlign: collapsed ? 'center' : 'left',
                        color: '#A9BADA',
                        fontWeight: 'bold',
                        background: '#0D1F3C',
                        padding: collapsed ? '0' : '0 24px',
                      },
                    }
                  : {
                      key: item.key,
                      icon: item.icon,
                      label: item.label,
                      style: {
                        background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                        color: selectedKey === item.key ? '#000' : 'white',
                        fontFamily: 'Poppins, sans-serif',
                      },
                    }
              )}
            />
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[]}
            onClick={handleMenuClick}
            style={{
              background: '#1D3863',
              color: 'white',
              borderRadius: 6,
              marginTop: collapsed ? sessionMargins.collapsed.top : sessionMargins.expanded.top,
              marginBottom: collapsed ? sessionMargins.collapsed.bottom : sessionMargins.expanded.bottom,
            }}
            items={logoutMenuItems.map((item) =>
              item.type === 'group'
                ? {
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
                    },
                  }
                : {
                    key: item.key,
                    icon: item.icon,
                    label: item.label,
                    style: { color: 'white', fontFamily: 'Poppins, sans-serif' },
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
      >
        <p style={{ fontFamily: 'Poppins, sans-serif' }}>Are you sure you want to logout?</p>
      </Modal>
    </>
  );
};

export default Sidebar;