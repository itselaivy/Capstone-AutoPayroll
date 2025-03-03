import { useState, useEffect } from 'react';
import { Space, Table, Tag, Button, Input } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';

const { Column } = Table;

const initialData = [
  {
    key: '1',
    employeeId: 'EMP001',
    employeeName: 'John Brown',
    startDate: '2024-03-01',
    endDate: '2024-03-05',
    leaveType: 'Pay',
  },
  {
    key: '2',
    employeeId: 'EMP002',
    employeeName: 'Jim Green',
    startDate: '2024-02-15',
    endDate: '2024-02-20',
    leaveType: 'Without Pay',
  },
  {
    key: '3',
    employeeId: 'EMP003',
    employeeName: 'Yvanne',
    startDate: '2024-01-10',
    endDate: '2024-01-12',
    leaveType: 'Pay',
  },
];

const LeaveTypeTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState(initialData);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  // Track screen size for responsiveness
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show labels on action buttons only on larger screens
  const showLabels = screenWidth >= 600;

  const handleSearch = (value) => {
    const filtered = initialData.filter(
      (item) =>
        item.employeeId.toLowerCase().includes(value.toLowerCase()) ||
        item.employeeName.toLowerCase().includes(value.toLowerCase()) ||
        item.leaveType.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  return (
    <>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'right', 
        alignItems: 'center', 
        gap: 16, 
        marginBottom: 20,
        flexWrap: 'wrap' 
      }}>
        <Button
          icon={<PlusOutlined />}
          size="middle"
          style={{ 
            backgroundColor: '#2C3743', 
            borderColor: '#2C3743', 
            color: 'white'
          }}
        >
          {showLabels && 'Add Leave Type'} 
        </Button>
        <Input
          placeholder="Search..."
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
        />
      </div>

      <Table dataSource={filteredData} 
        bordered
        scroll={{ x: true }}
        pagination={{ 
          responsive: true,
          position: ['bottomCenter']
        }}
      >
        <Column 
          title="Employee ID" 
          dataIndex="employeeId" 
          key="employeeId" 
          sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)}
        />
        <Column 
          title="Employee Name" 
          dataIndex="employeeName" 
          key="employeeName" 
          sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)}
        />
        <Column 
          title="Start Date" 
          dataIndex="startDate" 
          key="startDate" 
          sorter={(a, b) => new Date(a.startDate) - new Date(b.startDate)}
        />
        <Column 
          title="End Date" 
          dataIndex="endDate" 
          key="endDate" 
          sorter={(a, b) => new Date(a.endDate) - new Date(b.endDate)}
        />
        <Column
          title="Leave Type"
          dataIndex="leaveType"
          key="leaveType"
          sorter={(a, b) => a.leaveType.localeCompare(b.leaveType)}
          render={(text) => (
            <Tag color={text === 'Pay' ? 'green' : 'volcano'}>
              {text.toUpperCase()}
            </Tag>
          )}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle">
              <Button
                icon={<EyeOutlined />}
                size="small"
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', padding: 15 }}
              >
                View
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', padding: 15 }}
              >
                Edit
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', padding: 15 }}
              >
                Delete
              </Button>
            </Space>
          )}
        />
      </Table>
    </>
  );
};

export default LeaveTypeTable;
