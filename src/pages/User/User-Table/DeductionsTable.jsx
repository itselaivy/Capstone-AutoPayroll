import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Tag } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';

const { Column } = Table;

const initialData = [
  {
    key: '1',
    employeeId: 'E001',
    employeeName: 'John Brown',
    deductions: [
      { type: 'Pag-Ibig', amount: 100.0 },
      { type: 'SSS', amount: 200.0 },
      { type: 'PhilHealth', amount: 150.0 },
    ],
  },
  {
    key: '2',
    employeeId: 'E002',
    employeeName: 'Jim Green',
    deductions: [
      { type: 'Pag-Ibig', amount: 120.0 },
      { type: 'SSS', amount: 250.0 },
      { type: 'PhilHealth', amount: 180.0 },
    ],
  },
  {
    key: '3',
    employeeId: 'E003',
    employeeName: 'Joe Black',
    deductions: [
      { type: 'Pag-Ibig', amount: 90.0 },
      { type: 'SSS', amount: 180.0 },
      { type: 'PhilHealth', amount: 160.0 },
    ],
  },
];

const DeductionsTable = () => {
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
        item.employeeName.toLowerCase().includes(value.toLowerCase())
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
          {showLabels && 'Add Deduction'} 
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
          title="Deductions"
          dataIndex="deductions"
          key="deductions"
          render={(deductions) => (
            <>
              {deductions.map((deduction) => (
                <Tag key={deduction.type} color="blue">
                  {deduction.type}: ₱{deduction.amount.toFixed(2)}
                </Tag>
              ))}
            </>
          )}
        />
        <Column
          title="Total Amount"
          dataIndex="deductions"
          key="totalAmount"
          sorter={(a, b) =>
            a.deductions.reduce((sum, d) => sum + d.amount, 0) -
            b.deductions.reduce((sum, d) => sum + d.amount, 0)
          }
          render={(deductions) => 
            `₱${deductions.reduce((sum, d) => sum + d.amount, 0).toFixed(2)}`
          }
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

export default DeductionsTable;
