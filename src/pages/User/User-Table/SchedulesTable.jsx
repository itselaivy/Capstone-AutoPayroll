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
    timeIn: '08:00 AM',
    timeOut: '05:00 PM',
  },
  {
    key: '2',
    timeIn: '09:00 AM',
    timeOut: '06:00 PM',
  },
  {
    key: '3',
    timeIn: '10:00 AM',
    timeOut: '07:00 PM',
  },
];

const SchedulesTable = () => {
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
        item.timeIn.toLowerCase().includes(value.toLowerCase()) ||
        item.timeOut.toLowerCase().includes(value.toLowerCase())
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
          {showLabels && 'Add Schedule'} 
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
          title="Time In ⬍" 
          dataIndex="timeIn" 
          key="timeIn" 
          sorter={(a, b) => a.timeIn.localeCompare(b.timeIn)} 
        />
        <Column 
          title="Time Out ⬍" 
          dataIndex="timeOut" 
          key="timeOut" 
          sorter={(a, b) => a.timeOut.localeCompare(b.timeOut)} 
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle">
              <Button
                icon={<EyeOutlined />}
                size="small"
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', padding: 10 }}
              >
                View
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', padding: 10 }}
              >
                Edit
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', padding: 10 }}
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

export default SchedulesTable;
