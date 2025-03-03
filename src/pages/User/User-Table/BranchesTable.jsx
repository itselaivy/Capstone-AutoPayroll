import { useState, useEffect } from 'react';
import { Space, Table, Button, Input } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';

const { Column } = Table;

const initialData = [
  { key: '1', branchName: 'Downtown Branch' },
  { key: '2', branchName: 'Uptown Branch' },
  { key: '3', branchName: 'Westside Branch' },
];

const BranchesTable = () => {
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
    const filtered = initialData.filter((item) =>
      item.branchName.toLowerCase().includes(value.toLowerCase())
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
          {showLabels && 'Add Branch'} 
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

      {/* Table - Responsive */}
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
          title="Branch Name" 
          dataIndex="branchName" 
          key="branchName" 
          sorter={(a, b) => a.branchName.localeCompare(b.branchName)}
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

export default BranchesTable;