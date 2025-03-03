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
    description: 'New Year\'s Day',
    date: '2025-01-01',
    holidayType: 'Paid',
  },
  {
    key: '2',
    description: 'Independence Day',
    date: '2025-07-04',
    holidayType: 'Paid',
  },
  {
    key: '3',
    description: 'Christmas Day',
    date: '2025-12-25',
    holidayType: 'Paid',
  },
];

const HolidayTable = () => {
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
        item.description.toLowerCase().includes(value.toLowerCase()) ||
        item.date.includes(value) ||
        item.holidayType.toLowerCase().includes(value.toLowerCase())
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
          {showLabels && 'Add Holiday Type'} 
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
          title="Description" 
          dataIndex="description" 
          key="description" 
          sorter={(a, b) => a.description.localeCompare(b.description)}
        />
        <Column 
          title="Date" 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => new Date(a.date) - new Date(b.date)}
        />
        <Column 
          title="Holiday Type" 
          dataIndex="holidayType" 
          key="holidayType" 
          sorter={(a, b) => a.holidayType.localeCompare(b.holidayType)}
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

export default HolidayTable;
