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
    date: '2025-03-02',
    employeeId: 'EMP001',
    employeeName: 'John Brown',
    branch: 'New York Office',
    timeIn: '09:05 AM',
    timeOut: '05:00 PM',
    status: 'Late',
  },
  {
    key: '2',
    date: '2025-03-02',
    employeeId: 'EMP002',
    employeeName: 'Jim Green',
    branch: 'London Office',
    timeIn: '08:50 AM',
    timeOut: '04:55 PM',
    status: 'On-Time',
  },
  {
    key: '3',
    date: '2025-03-02',
    employeeId: 'EMP003',
    employeeName: 'Joe Black',
    branch: 'Sydney Office',
    timeIn: '09:15 AM',
    timeOut: '05:10 PM',
    status: 'Late',
  },
];

const AttendanceTable = () => {
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
        item.branch.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  return (
    <>
      {/* Controls - Keeping original positions */}
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
          {showLabels && 'Add Attendance'} 
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

      <Table 
        dataSource={filteredData} 
        bordered
        scroll={{ x: true }}
        pagination={{ 
          responsive: true,
          position: ['bottomCenter']
        }}
      >
        <Column 
          title="Date" 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => new Date(a.date) - new Date(b.date)}
        />
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
          title="Branch" 
          dataIndex="branch" 
          key="branch"
          sorter={(a, b) => a.branch.localeCompare(b.branch)}
        />
        <Column 
          title="Time In" 
          dataIndex="timeIn" 
          key="timeIn"
          sorter={(a, b) => a.timeIn.localeCompare(b.timeIn)}
          render={(text, record) => (
            <Space>
              {text}
              <Tag color={record.status === 'Late' ? 'volcano' : 'green'}>
                {record.status}
              </Tag>
            </Space>
          )}
        />
        <Column 
          title="Time Out" 
          dataIndex="timeOut" 
          key="timeOut"
          sorter={(a, b) => a.timeOut.localeCompare(b.timeOut)}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button
                icon={<EyeOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#52c41a', 
                  borderColor: '#52c41a', 
                  color: 'white',
                  padding: '0 16px',
                  height: '34px'
                }}
              >
                {showLabels && 'View'}
              </Button>
              <Button
                icon={<EditOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#722ed1', 
                  borderColor: '#722ed1', 
                  color: 'white',
                  padding: '0 16px',
                  height: '34px'
                }}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#ff4d4f', 
                  borderColor: '#ff4d4f', 
                  color: 'white',
                  padding: '0 16px',
                  height: '34px'
                }}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>
    </>
  );
};

export default AttendanceTable;