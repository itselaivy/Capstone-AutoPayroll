import React, { useState, useEffect } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import { Routes, Route } from 'react-router-dom';

import Dashboard from '../pages/User/Dashboard';
import Branches from '../pages/User/Branches';
import Attendance from '../pages/User/Attendance';
import Employees from '../pages/User/Employees';
import Overtime from '../pages/User/Overtime';
import CashAdvance from '../pages/User/CashAdvance';
import Schedules from '../pages/User/Schedules';
import Allowances from '../pages/User/Allowances';
import Deductions from '../pages/User/Deductions';
import Position from '../pages/User/Position';
import HolidayType from '../pages/User/HolidayType';
import LeaveType from '../pages/User/LeaveType';
import Payroll from '../pages/User/Payroll';
import Login from '../pages/Login';

const { Content } = Layout;

const UserMainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('1');
  const [sidebarHeight, setSidebarHeight] = useState(0);
  const [openKeys, setOpenKeys] = useState([]);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const headerHeight = 64; // Adjust if your HeaderBar height differs

  const contentHeight = () => {
    const viewportHeight = window.innerHeight;
    const adjustedViewportHeight = viewportHeight - headerHeight;

    // Only expand height if both 'employees' and 'payroll' dropdowns are open
    const bothDropdownsOpen = openKeys.includes('employees') && openKeys.includes('payroll');
    
    if (bothDropdownsOpen && sidebarHeight > viewportHeight) {
      return `${sidebarHeight - headerHeight}px`; // Expand to sidebar height minus header
    }
    return `${adjustedViewportHeight}px`; // Default to viewport minus header
  };

  return (
    <Layout style={{ display: 'flex', flexDirection: 'row' }}>
      <Sidebar 
        collapsed={collapsed} 
        setSelectedKey={setSelectedKey} 
        setSidebarHeight={setSidebarHeight} 
        setOpenKeysState={setOpenKeys} // Receive openKeys from Sidebar
      />
      <Layout style={{ flex: 1, background: '#DCEFFF' }}>
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />
        <Content
          style={{
            padding: '20px',
            minHeight: contentHeight(),
            background: '#DCEFFF'
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/branches" element={<Branches />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/overtime" element={<Overtime />} />
            <Route path="/cash-advance" element={<CashAdvance />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/allowances" element={<Allowances />} />
            <Route path="/deduction" element={<Deductions />} />
            <Route path="/position" element={<Position />} />
            <Route path="/holidaytype" element={<HolidayType />} />
            <Route path="/leavetype" element={<LeaveType />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/logout" element={<Login />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default UserMainLayout;