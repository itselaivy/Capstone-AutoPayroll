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
  const [contentOverflow, setContentOverflow] = useState('hidden'); // Manage scrollbar

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const headerHeight = 64; // Adjust if your HeaderBar height differs

  useEffect(() => {
    const updateContentOverflow = () => {
      const contentHeight = document.querySelector('.ant-layout-content').scrollHeight;
      const viewportHeight = window.innerHeight - headerHeight;
      setContentOverflow(contentHeight > viewportHeight ? 'auto' : 'hidden');
    };

    updateContentOverflow();
    window.addEventListener('resize', updateContentOverflow);
    const observer = new MutationObserver(updateContentOverflow);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', updateContentOverflow);
      observer.disconnect();
    };
  }, []);

  return (
    <Layout style={{ minHeight: '100vh' }}> {/* Ensure Layout takes full height */}
      <Sidebar 
        collapsed={collapsed} 
        setSelectedKey={setSelectedKey} 
        setSidebarHeight={setSidebarHeight} 
        setOpenKeysState={setOpenKeys} 
      />
      <Layout 
        style={{ 
          marginLeft: collapsed ? 100 : 250, // Shift content right based on Sidebar width
          background: '#DCEFFF',
          minHeight: '100vh' // Ensure it stretches with content
        }}
      >
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />
        <Content
          style={{
            padding: '20px',
            minHeight: `calc(100vh - ${headerHeight}px)`, // Default height
            background: '#DCEFFF',
            overflowY: contentOverflow, // Dynamic scrollbar
            position: 'relative' // Ensure content stays in flow
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