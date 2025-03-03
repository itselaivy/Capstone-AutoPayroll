import React, { useState } from 'react'
import { Layout, 
         Menu } 
            from 'antd'
import { UserOutlined, 
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
         LogoutOutlined } 
            from '@ant-design/icons'
import { IoCashOutline } from 'react-icons/io5'
import logo from '../assets/logo.png' 

const { Sider } = Layout

const Sidebar = ({ collapsed, setSelectedKey }) => {
  const [selectedKey, setSelected] = useState('1')

  const handleMenuClick = (e) => {
    setSelected(e.key)
    setSelectedKey(e.key)
  }

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
        <img src={logo} alt="AutoPayroll" style={{ width: collapsed ? 60 : 110, 
                                                   transition: 'width 0.3s ease' }}  /> 
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
        style={{ background: '#1D3863', color: 'white', borderRadius: 6}} 
      >
        {[  
          { key: '1', icon: <DashboardOutlined />, label: 'Dashboard' },
          { key: '2', icon: <BranchesOutlined />, label: 'Branches' },
          { key: '3', icon: <CalendarOutlined />, label: 'Attendance' },
          { key: '4', icon: <UserOutlined />, label: 'Employees' },
          { key: '5', icon: <ClockCircleOutlined />, label: 'Overtime' },
          { key: '6', icon: <IoCashOutline />, label: 'Cash Advance' },
          { key: '7', icon: <ScheduleOutlined />, label: 'Schedules' },
          { key: '8', icon: <TransactionOutlined/>, label: 'Allowances' },
          { key: '9', icon: <MinusCircleOutlined />, label: 'Deductions' },
          { key: '10', icon: <IdcardOutlined />, label: 'Position' },
          { key: '11', icon: <CarryOutOutlined />, label: 'Holiday Type' },
          { key: '12', icon: <SolutionOutlined />, label: 'Leave Type' },
          { key: '13', icon: <BankOutlined />, label: 'Payroll' },
          { key: '14', icon: <LogoutOutlined />, label: 'Logout' }
        ].map((item) => (
          <Menu.Item
            key={item.key}
            icon={item.icon}
            style={{
              background: selectedKey === item.key ? '#DCEFFF' : 'transparent', // ✅ Selected item color
              color: selectedKey === item.key ? '#000' : 'white' // ✅ Selected text color
            }}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu>
    </Sider>
  )
}

export default Sidebar
