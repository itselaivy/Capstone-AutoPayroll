import React, { useState } from 'react';
import { Layout, theme } from 'antd';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import ContentArea from './ContentArea';
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
// Import other pages...

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

export default MainLayout;
