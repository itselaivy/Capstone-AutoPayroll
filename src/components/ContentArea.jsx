import React from 'react'
import { Layout } from 'antd'

// Import all page components
import Dashboard from '../pages/User/Dashboard'
import Branches from '../pages/User/Branches'
import Attendance from '../pages/User/Attendance'
import Employees from '../pages/User/Employees'
import Overtime from '../pages/User/Overtime'
import CashAdvance from '../pages/User/CashAdvance'
import Schedules from '../pages/User/Schedules'
import Allowances from '../pages/User/Allowances'
import Contributions from '../pages/User/Contributions'
import Loan from '../pages/User/Loan'
import Position from '../pages/User/Position'
import HolidayType from '../pages/User/HolidayType'
import LeaveType from '../pages/User/LeaveType'
import Payroll from '../pages/User/Payroll'

const { Content } = Layout

const ContentArea = ({ selectedKey, colorBgContainer, borderRadiusLG }) => {
  // Map selected keys to components
  const renderContent = () => {
    switch (selectedKey) {
      case '1': return <Dashboard />
      case '2': return <Branches />
      case '15': return <Attendance />
      case '4': return <Employees />
      case '5': return <Overtime />
      case '6': return <CashAdvance />
      case '7': return <Schedules />
      case '8': return <Allowances />
      case '9': return <Contributions />
      case '10': return <Loan />
      case '11': return <Position />
      case '12': return <HolidayType />
      case '13': return <LeaveType />
      case '14': return <Payroll />
      default: return <h2>Select a menu item</h2>
    }
  }

  return (
    <Content
      style={{
        margin: '24px 16px',
        padding: 24,
        minHeight: 280,
        background: 'colorBgContainer',
        borderRadius: '200px',
      }}
    >
      {renderContent()}
    </Content>
  )
}

export default ContentArea;
