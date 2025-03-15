import React, { useState, useRef, useEffect } from 'react';
import { Layout, Menu, Modal } from 'antd';
import { useNavigate } from 'react-router-dom'; 
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

const Sidebar = ({ collapsed, setSelectedKey, setSidebarHeight, setOpenKeysState }) => {
  const [selectedKey, setSelected] = useState('1'); 
  const [openKeys, setOpenKeys] = useState([]); 
  const [isModalVisible, setIsModalVisible] = useState(false);
  const navigate = useNavigate(); 
  const sidebarRef = useRef(null);

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
    if (sidebarRef.current) {
      const height = sidebarRef.current.offsetHeight;
      setSidebarHeight(height);
    }
  }, [collapsed, openKeys, setSidebarHeight]);

  const menuItems = [
    { key: 'overview', label: 'OVERVIEW', type: 'group' }, 
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/User/' },
    { key: 'manage', label: 'MANAGE', type: 'group' },
    { key: '2', icon: <BranchesOutlined />, label: 'Branches', route: '/User/branches' },
    { key: '3', icon: <CalendarOutlined />, label: 'Attendance', route: '/User/attendance' },
    {
      key: 'employees',
      icon: <UserOutlined />,
      label: 'Employees',
      children: [
        { key: '4', icon: <UserOutlined />, label: 'Employee List', route: '/User/employees' },
        { key: '5', icon: <IdcardOutlined />, label: 'Position', route: '/User/position' },
        { key: '6', icon: <ScheduleOutlined />, label: 'Schedule', route: '/User/schedules' },
        { key: '7', icon: <ClockCircleOutlined />, label: 'Overtime', route: '/User/overtime' }
      ]
    },
    { key: 'payroll-section', label: 'PAYROLL', type: 'group' }, 
    {
      key: 'payroll',
      icon: <BankOutlined />,
      label: 'Payroll',
      children: [
        { key: '8', icon: <BankOutlined />, label: 'Payroll', route: '/User/payroll' },
        { key: '9', icon: <CarryOutOutlined />, label: 'Holiday', route: '/User/holidaytype' },
        { key: '10', icon: <SolutionOutlined />, label: 'Leave Type', route: '/User/leavetype' },
        { key: '11', icon: <TransactionOutlined />, label: 'Allowances', route: '/User/allowances' },
        { key: '12', icon: <MinusCircleOutlined />, label: 'Deductions', route: '/User/deduction' },
        { key: '13', icon: <IoCashOutline />, label: 'Cash Advance', route: '/User/cash-advance' }
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
        style={{ background: '#1D3863' }}
        ref={sidebarRef}
      >
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

        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          background: '#1D3863',
          // Adjust marginBottom based on collapsed state
          marginBottom: collapsed ? 300 : 250 // Increased from 250 to 300 when collapsed
        }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={openKeys}
            onOpenChange={onOpenChange}
            onClick={handleMenuClick}
            style={{ background: '#1D3863', color: 'white', borderRadius: 6 }}
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
                  padding: collapsed ? '0' : '0 24px'
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
                  }
                }))
              } : {
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.route ? () => navigate(item.route) : undefined,
                style: {
                  background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                  color: selectedKey === item.key ? '#000' : 'white',
                }
              }
            )}
          />
        </div>

        <Menu
          theme="dark"
          mode="inline"
          style={{ 
            background: '#1D3863', 
            color: 'white', 
            borderRadius: 6,
            // Add marginTop when collapsed to push it lower
            marginTop: collapsed ? '30px' : '50px'
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
                padding: collapsed ? '0' : '0 24px'
              }
            } : {
              key: item.key,
              icon: item.icon,
              label: item.label,
              onClick: item.onClick,
              style: {
                background: selectedKey === item.key ? '#DCEFFF' : 'transparent',
                color: selectedKey === item.key ? '#000' : 'white',
              }
            }
          )}
        />
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
        centered
      >
        <p>Are you sure you want to logout?</p>
      </Modal>
    </>
  );
};

export default Sidebar;