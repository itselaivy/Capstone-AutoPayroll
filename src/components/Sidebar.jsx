import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { Link, useNavigate } from 'react-router-dom'; 
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

const { Sider } = Layout;

const Sidebar = ({ collapsed, setSelectedKey }) => {
  const [selectedKey, setSelected] = useState('1'); 
  const navigate = useNavigate(); 


  const handleMenuClick = (e) => {
    setSelected(e.key);
    setSelectedKey(e.key);
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Clear authentication data
    navigate('/login'); // Redirect to login page
  };


  const menuItems = [
    { key: '1', icon: <DashboardOutlined />, label: 'Dashboard', route: '/' },
    { key: '2', icon: <BranchesOutlined />, label: 'Branches', route: '/branches' },
    { key: '3', icon: <CalendarOutlined />, label: 'Attendance', route: '/attendance' },
    { key: '4', icon: <UserOutlined />, label: 'Employees', route: '/employees' },
    { key: '5', icon: <ClockCircleOutlined />, label: 'Overtime', route: '/overtime' },
    { key: '6', icon: <IoCashOutline />, label: 'Cash Advance', route: '/cash-advance' },
    { key: '7', icon: <ScheduleOutlined />, label: 'Schedules', route: '/schedules' },
    { key: '8', icon: <TransactionOutlined />, label: 'Allowances', route: '/allowances' },
    { key: '9', icon: <MinusCircleOutlined />, label: 'Deductions', route: '/deductions' },
    { key: '10', icon: <IdcardOutlined />, label: 'Position', route: '/position' },
    { key: '11', icon: <CarryOutOutlined />, label: 'Holiday Type', route: '/holiday-type' },
    { key: '12', icon: <SolutionOutlined />, label: 'Leave Type', route: '/leave-type' },
    { key: '13', icon: <BankOutlined />, label: 'Payroll', route: '/payroll' },
    { key: '14', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout } 
  ];

  return (
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
              background: selectedKey === item.key ? '#DCEFFF' : 'transparent', // Highlight selected item
              color: selectedKey === item.key ? '#000' : 'white' // Change color for selected item
            }}
            onClick={item.onClick || (() => navigate(item.route))} // Apply logout function for Logout
          >
            {item.route ? <Link to={item.route}>{item.label}</Link> : item.label}
          </Menu.Item>
        ))}
      </Menu>
    </Sider>
  );
};

export default Sidebar;
