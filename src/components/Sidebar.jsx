import React, { useState, useRef, useEffect } from 'react';
import { Layout, Menu, Modal } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  UserOutlined,
  DashboardOutlined,
  BranchesOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ScheduleOutlined,
  BankOutlined,
  IdcardOutlined,
  MinusCircleOutlined,
  SolutionOutlined,
  TransactionOutlined,
  CarryOutOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import { IoCashOutline } from 'react-icons/io5';
import logo from '../assets/logo.png';
import './Sidebar.css';

const { Sider } = Layout;

const UserSidebar = ({ collapsed, setSelectedKey, setSidebarHeight, setOpenKeysState }) => {
  const [selectedKey, setSelected] = useState('1');
  const [openKeys, setOpenKeys] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef(null);
  const scrollableRef = useRef(null);

  // Map routes to menu keys (relative to /user/)
  const routeToKeyMap = {
    '/user/': '1',
    '/user/branches': '2',
    '/user/attendance': '3',
    '/user/employees': '4',
    '/user/position': '5',
    '/user/schedules': '6',
    '/user/overtime': '7',
    '/user/payroll': '8',
    '/user/holidaytype': '9',
    '/user/leavetype': '10',
    '/user/allowances': '11',
    '/user/deduction': '12',
    '/user/cash-advance': '13'
  };

  // Sync selectedKey with current route
  useEffect(() => {
    const currentKey = routeToKeyMap[location.pathname] || '1';
    setSelected(currentKey);
    setSelectedKey(currentKey);
  }, [location.pathname, setSelectedKey]);

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

  const onOpenChange = (keys) => {
    setOpenKeys(keys);
    setOpenKeysState(keys);
  };

  useEffect(() => {
    const updateSidebarHeight = () => {
      if (sidebarRef.current && scrollableRef.current) {
        const viewportHeight = window.innerHeight;
        sidebarRef.current.style.height = `${viewportHeight}px`;
        setSidebarHeight(viewportHeight);

        const logoHeight = sidebarRef.current.querySelector('.logo-section')?.offsetHeight || 0;
        const scrollableHeight = viewportHeight - logoHeight;
        scrollableRef.current.style.height = `${scrollableHeight}px`;
      }
    };

    updateSidebarHeight();
    window.addEventListener('resize', updateSidebarHeight);
    const observer = new MutationObserver(updateSidebarHeight);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', updateSidebarHeight);
      observer.disconnect();
    };
  }, [collapsed, openKeys, setSidebarHeight]);

  const menuItems = [
    { key: 'overview', label: 'OVERVIEW', type: 'group' },
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/user/' },
    { key: 'manage', label: 'MANAGE', type: 'group' },
    { key: '2', icon: <BranchesOutlined />, label: 'Branches', route: '/user/branches' },
    { key: '3', icon: <CalendarOutlined />, label: 'Attendance', route: '/user/attendance' },
    {
      key: 'employees',
      icon: <UserOutlined />,
      label: 'Employees',
      children: [
        { key: '4', icon: <UserOutlined />, label: 'Employee List', route: '/user/employees' },
        { key: '5', icon: <IdcardOutlined />, label: 'Position', route: '/user/position' },
        { key: '6', icon: <ScheduleOutlined />, label: 'Schedule', route: '/user/schedules' },
        { key: '7', icon: <ClockCircleOutlined />, label: 'Overtime', route: '/user/overtime' }
      ]
    },
    { key: 'payroll-section', label: 'PAYROLL', type: 'group' },
    {
      key: 'payroll',
      icon: <BankOutlined />,
      label: 'Payroll',
      children: [
        { key: '8', icon: <BankOutlined />, label: 'Payroll', route: '/user/payroll' },
        { key: '9', icon: <CarryOutOutlined />, label: 'Holiday', route: '/user/holidaytype' },
        { key: '10', icon: <SolutionOutlined />, label: 'Leave Type', route: '/user/leavetype' },
        { key: '11', icon: <TransactionOutlined />, label: 'Allowances', route: '/user/allowances' },
        { key: '12', icon: <MinusCircleOutlined />, label: 'Deductions', route: '/user/deduction' },
        { key: '13', icon: <IoCashOutline />, label: 'Cash Advance', route: '/user/cash-advance' }
      ]
    },
  ];

  const logoutMenuItems = [
    { key: 'session', label: 'SESSION', type: 'group' },
    { key: '14', icon: <LogoutOutlined />, label: 'Logout', onClick: showLogoutModal }
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
          zIndex: 1000
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
            background: '#1D3863'
          }}
        >
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
              marginBottom: 10,
              fontFamily: 'Poppins, sans-serif'
            }}>
              AutoPayroll
            </span>
          )}
        </div>

        <div 
          ref={scrollableRef}
          style={{ 
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            background: '#1D3863',
            scrollbarWidth: 'thin',
            scrollbarColor: '#A9BADA #0D1F3C',
          }}
          className="custom-scrollbar"
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={openKeys}
            onOpenChange={onOpenChange}
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
                  fontFamily: 'Poppins, sans-serif'
                }
              } : item.children ? {
                key: item.key,
                icon: item.icon,
                label: item.label,
                children: item.children.map((child) => ({
                  key: child.key,
                  icon: child.icon,
                  label: child.label,
                  onClick: () => navigate(child.route),
                  style: {
                    background: selectedKey === child.key ? '#DCEFFF' : 'transparent',
                    color: selectedKey === child.key ? '#000' : 'white',
                    fontFamily: 'Poppins, sans-serif'
                  }
                })),
                style: { fontFamily: 'Poppins, sans-serif' }
              } : {
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.route ? () => navigate(item.route) : undefined,
                style: {
                  background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                  color: selectedKey === item.key ? '#000' : 'white',
                  fontFamily: 'Poppins, sans-serif'
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
              marginTop: 'auto',
              fontFamily: 'Poppins, sans-serif'
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
                  fontFamily: 'Poppins, sans-serif'
                }
              } : {
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.onClick,
                style: {
                  background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                  color: selectedKey === item.key ? '#000' : 'white',
                  fontFamily: 'Poppins, sans-serif'
                }
              }
            )}
          />
        </div>
      </Sider>

      <Modal
        title={<span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>Confirm Logout</span>}
        visible={isModalVisible}
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

export default UserSidebar;