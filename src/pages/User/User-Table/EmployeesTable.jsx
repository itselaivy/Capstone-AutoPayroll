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
    employeeID: 'EMP001',
    employeeName: 'John Brown',
    branch: 'New York',
    position: 'Software Engineer',
    schedule: '9 AM - 5 PM',
    memberSince: '2020-05-12',
  },
  {
    key: '2',
    employeeID: 'EMP002',
    employeeName: 'Jane Green',
    branch: 'London',
    position: 'HR Manager',
    schedule: '8 AM - 4 PM',
    memberSince: '2019-08-23',
  },
  {
    key: '3',
    employeeID: 'EMP003',
    employeeName: 'Mark Black',
    branch: 'Sydney',
    position: 'Project Manager',
    schedule: '10 AM - 6 PM',
    memberSince: '2021-02-15',
  },
];

const EmployeesTable = () => {
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
        item.employeeID.toLowerCase().includes(value.toLowerCase()) ||
        item.employeeName.toLowerCase().includes(value.toLowerCase()) ||
        item.branch.toLowerCase().includes(value.toLowerCase()) ||
        item.position.toLowerCase().includes(value.toLowerCase()) ||
        item.schedule.toLowerCase().includes(value.toLowerCase()) ||
        item.memberSince.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  return (
    <>
      {/* Add Button on the Left & Search Bar on the Right */}
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
          {showLabels && 'Add Employee'} 
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
          dataIndex="employeeID" 
          key="employeeID" 
          sorter={(a, b) => a.employeeID.localeCompare(b.employeeID)}
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
          title="Position" 
          dataIndex="position" 
          key="position" 
          sorter={(a, b) => a.position.localeCompare(b.position)} 
        />
        <Column 
          title="Schedule" 
          dataIndex="schedule" 
          key="schedule" 
        />
        <Column 
          title="Member Since" 
          dataIndex="memberSince" 
          key="memberSince" 
          sorter={(a, b) => new Date(a.memberSince) - new Date(b.memberSince)}
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

export default EmployeesTable;
