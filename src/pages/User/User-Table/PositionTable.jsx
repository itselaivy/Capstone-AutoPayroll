import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;

const PositionsTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]); // Original data
  const [filteredData, setFilteredData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [form] = Form.useForm();

  // Fetch data from the database
  const fetchData = () => {
    fetch("http://localhost/UserTableDB/UserDB/fetch_position.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Data:", data); // 🔍 Log fetched data
        setData(data);
        setFilteredData(data); // Initialize filteredData with the fetched data
      })
      .catch((err) => console.error("Error fetching position:", err));
  };

  // Fetch data when the component mounts
  useEffect(() => {
    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

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
    const filtered = data.filter((item) =>
      item.PositionTitle.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Open modal for Add, Edit, View, or Delete
  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    
    if (record) {
      console.log("Selected PositionID:", record.PositionID); // Log the PositionID here
    }
  
    setModalType(type);
    setSelectedPosition(record);
    setIsModalOpen(true);
  
    if (type === 'Edit' && record) {
      form.setFieldsValue({
        PositionTitle: record.PositionTitle,
        RatePerHour: record.RatePerHour
      });
    }
  };  
  
  // Handle Add, Edit, or Delete operations
  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            PositionTitle: values.PositionTitle,
            RatePerHour: values.RatePerHour
          };                    
          console.log("Add Payload:", payload); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_position.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              console.log("Add Response Status:", res.status); // Log response status
              if (!res.ok) {
                return res.json().then(err => { throw new Error(err.error); }); // Throw error with backend message
              }
              return res.json();
            })
            .then((data) => {
              console.log("Add Response Data:", data); // Log response data
              message.success("Position added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after adding
            })
            .catch((err) => {
              console.error("Error:", err.message); // Log the actual error message
              message.error(`Failed to add position: ${err.message}`);
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Edit" && selectedPosition) {
      form.validateFields()
        .then((values) => {
          const payload = {
            PositionID: selectedPosition.key, // Ensure this is 'PositionID' and matches the backend
            PositionTitle: values.PositionTitle,
            RatePerHour: values.RatePerHour
        };        
          console.log("Edit Payload:", payload); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_position.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              console.log("Edit Response Status:", res.status); // Log response status
              if (!res.ok) {
                return res.json().then(err => { throw new Error(err.error); }); // Throw error with backend message
              }
              return res.json();
            })
            .then((data) => {
              console.log("Edit Response Data:", data); // Log response data
              message.success("Position updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after editing
            })
            .catch((err) => {
              console.error("Error:", err.message); // Log the actual error message
              message.error(`Failed to update position: ${err.message}`);
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Delete" && selectedPosition) {
      console.log("Delete Payload:", selectedPosition.key); // Log payload
      fetch("http://localhost/UserTableDB/UserDB/fetch_position.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionID: selectedPosition.key }), // Ensure this matches the key in the fetched data
      })
        .then((res) => {
          console.log("Delete Response Status:", res.status); // Log response status
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error); }); // Throw error with backend message
          }
          return res.json();
        })
        .then((data) => {
          console.log("Delete Response Data:", data); // Log response data
          message.success("Position deleted successfully!");
          setIsModalOpen(false);
          fetchData(); // Refetch data after deleting
        })
        .catch((err) => {
          console.error("Error:", err.message); // Log the actual error message
          message.error(`Failed to delete position: ${err.message}`);
        });
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
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
          onClick={() => openModal('Add')} // Add onClick handler
        >
          {showLabels && 'Add Position'} 
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
          title={<span>Position Title</span>} 
          dataIndex="PositionTitle" 
          key="PositionTitle" 
          sorter={(a, b) => a.PositionTitle.localeCompare(b.PositionTitle)}
        />
        <Column 
          title={<span>Rate per Hour</span>} 
          dataIndex="RatePerHour" 
          key="RatePerHour" 
          sorter={(a, b) => a.RatePerHour - b.RatePerHour} 
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
                  color: 'white'
                }}
                onClick={() => openModal('View', record)}
              >
                {showLabels && 'View'}
              </Button>
              <Button
                icon={<EditOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#722ed1', 
                  borderColor: '#722ed1', 
                  color: 'white'
                }}
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#ff4d4f', 
                  borderColor: '#ff4d4f', 
                  color: 'white'
                }}
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      {/* Modal for Add, View, Edit, Delete */}
      <Modal 
        title= <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
          {
            modalType === 'Add' ? 'Add a New Position' :
            modalType === 'Edit' ? 'Edit Position Details' :
            modalType === 'View' ? 'View Position Information' :
            'Confirm Position Deletion'
          } </span>
        visible={isModalOpen}  // Use 'visible' instead of 'open'
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600}
        centered
        bodyStyle={{ minHeight: '100px', padding: '20px', margin: 20 }}
      >

      {modalType === 'Add' && (
  <>
    <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '18px' }}>
      Enter the details of the new position:
    </p>
    <Form form={form} layout="vertical">
      <Form.Item
        label="Position Title"
        name="PositionTitle"
        rules={[
          { required: true, message: 'Please enter position title!' },
        ]}
      >
        <Input placeholder="Enter Position Title" />
      </Form.Item>
      <Form.Item
        label="Rate per Hour"
        name="RatePerHour"
        rules={[
          { required: true, message: 'Please enter rate per hour!' },
        ]}
      >
        <Input type="number" placeholder="Enter Rate per Hour" />
      </Form.Item>
    </Form>
  </>
)}

{modalType === 'Edit' && (
  <>
    <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '18px' }}>Modify the position details below:</p>
    <Form form={form} layout="vertical">
      <Form.Item
        label="Position Title"
        name="PositionTitle"
        rules={[
          { required: true, message: 'Please enter position title!' },
        ]}
      >
        <Input placeholder="Enter Position Title" />
      </Form.Item>
      <Form.Item
        label="Rate per Hour"
        name="RatePerHour"
        rules={[
          { required: true, message: 'Please enter rate per hour!' },
        ]}
      >
        <Input type="number" placeholder="Enter Rate per Hour" />
      </Form.Item>
    </Form>
  </>
)}

    {modalType === 'View' && (
      <div>
        <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10}}>Position Details:</p>
        <p><strong>Position Title:</strong> {selectedPosition?.PositionTitle}</p>
        <p><strong>Rate per Hour:</strong> {selectedPosition?.RatePerHour}</p>
      </div>
    )}

    {modalType === 'Delete' && (
      <div>
        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
          ⚠️ Are you sure you want to delete this position?
        </p>
        <p>This action <strong>cannot be undone</strong>. The position "<strong>{selectedPosition?.PositionTitle}</strong>" will be permanently removed.</p>
      </div>
    )}
      </Modal>
    </>
  );
};

export default PositionsTable;