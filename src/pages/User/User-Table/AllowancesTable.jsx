import { useState, useEffect } from 'react';
import { Space, Table, Button, Input } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';

const { Column } = Table;

const initialData = [
  {
    key: '1',
    employeeID: 'E001',
    employeeName: 'John Brown',
    description: 'Housing Allowance',
    amount: 500,
  },
  {
    key: '2',
    employeeID: 'E002',
    employeeName: 'Jim Green',
    description: 'Transport Allowance',
    amount: 200,
  },
  {
    key: '3',
    employeeID: 'E003',
    employeeName: 'Joe Black',
    description: 'Meal Allowance',
    amount: 150,
  },
];

const AllowancesTable = () => {
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
        item.description.toLowerCase().includes(value.toLowerCase())
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
          {showLabels && 'Add Allowance'} 
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
          title="Description" 
          dataIndex="description" 
          key="description" 
          sorter={(a, b) => a.description.localeCompare(b.description)}
        />
        <Column 
          title="Amount" 
          dataIndex="amount" 
          key="amount" 
          sorter={(a, b) => a.amount - b.amount}
          render={(amount) => `₱${amount.toFixed(2)}`} 
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

export default AllowancesTable;
