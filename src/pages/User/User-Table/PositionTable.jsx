import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Typography } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;
const { Title } = Typography;

const PositionsTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [form] = Form.useForm();

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB/fetch_position.php";
  const userId = localStorage.getItem('userId'); // Retrieve userId for logging

  // Fetch data from the database
  const fetchData = () => {
    fetch(API_BASE_URL)
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Data:", data);
        setData(data);
        setFilteredData(data);
      })
      .catch((err) => console.error("Error fetching position:", err));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showLabels = screenWidth >= 600;

  const handleSearch = (value) => {
    const filtered = data.filter((item) =>
      item.PositionTitle.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Validate if PositionTitle already exists
  const checkDuplicatePosition = async (positionTitle, excludePositionId = null) => {
    try {
      const response = await fetch(`${API_BASE_URL}?check_duplicate=true&PositionTitle=${encodeURIComponent(positionTitle)}`);
      const result = await response.json();
      if (result.exists) {
        const existingPosition = result.position;
        if (excludePositionId && existingPosition.PositionID === excludePositionId) {
          return false; // Same record being edited, not a duplicate
        }
        return true; // Duplicate found
      }
      return false;
    } catch (err) {
      console.error("Error checking duplicate:", err);
      message.error("Failed to check for duplicates. Please try again.");
      return false;
    }
  };

  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    if (record) console.log("Selected PositionID:", record.PositionID);
    setModalType(type);
    setSelectedPosition(record);
    setIsModalOpen(true);
    if (type === 'Edit' && record) {
      form.setFieldsValue({
        PositionTitle: record.PositionTitle,
        RatePerHour: record.RatePerHour
      });
    } else if (type === 'Add') {
      form.resetFields();
    }
  };

  const handleOk = async () => {
    if (!userId) {
      message.error("User not logged in. Please log in to proceed.");
      return;
    }

    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      try {
        const values = await form.validateFields();
        if (!values.PositionTitle || !values.RatePerHour) {
          message.error("Please fill in all required fields.");
          return;
        }

        const isDuplicate = await checkDuplicatePosition(
          values.PositionTitle,
          modalType === "Edit" ? selectedPosition?.PositionID : null
        );

        if (isDuplicate) {
          message.warning("Warning: A record with this position title already exists.");
          return;
        }

        const payload = {
          PositionTitle: values.PositionTitle.trim(),
          RatePerHour: parseFloat(values.RatePerHour).toFixed(2),
          user_id: userId
        };

        if (modalType === "Edit" && selectedPosition) {
          payload.PositionID = selectedPosition.key;
        }

        console.log(`${modalType} Payload:`, payload);

        const response = await fetch(API_BASE_URL, {
          method: modalType === "Add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Operation failed");
        }

        message.success(`Position ${modalType === "Add" ? "added" : "updated"} successfully!`);
        setIsModalOpen(false);
        form.resetFields();
        fetchData();
      } catch (err) {
        console.error("Error:", err);
        message.error(`Failed to ${modalType === "Add" ? "add" : "update"} position: ${err.message}`);
      }
    } else if (modalType === "Delete" && selectedPosition) {
      try {
        const payload = {
          positionID: selectedPosition.key,
          user_id: userId
        };
        console.log("Delete Payload:", payload);

        const response = await fetch(API_BASE_URL, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Delete failed");
        }

        message.success("Position deleted successfully!");
        setIsModalOpen(false);
        fetchData();
      } catch (err) {
        console.error("Delete Error:", err);
        message.error(`Failed to delete position: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Company Positions
      </Title>

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
            color: 'white',
            fontFamily: 'Poppins, sans-serif'
          }}
          onClick={() => openModal('Add')}
        >
          {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Position</span>}
        </Button>
        <Input
          placeholder="Search..."
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ 
            width: screenWidth < 480 ? '100%' : '250px', 
            marginTop: screenWidth < 480 ? 10 : 0,
            fontFamily: 'Poppins, sans-serif'
          }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered
        scroll={{ x: true }}
        pagination={{ responsive: true, position: ['bottomCenter'] }}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Position Title</span>} 
          dataIndex="PositionTitle" 
          key="PositionTitle" 
          sorter={(a, b) => a.PositionTitle.localeCompare(b.PositionTitle)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate per Hour</span>} 
          dataIndex="RatePerHour" 
          key="RatePerHour" 
          sorter={(a, b) => a.RatePerHour - b.RatePerHour}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{parseFloat(text).toFixed(2)}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
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
                  fontFamily: 'Poppins, sans-serif'
                }}
                onClick={() => openModal('View', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>View</span>}
              </Button>
              <Button
                icon={<EditOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#722ed1', 
                  borderColor: '#722ed1', 
                  color: 'white',
                  fontFamily: 'Poppins, sans-serif'
                }}
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Edit</span>}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#ff4d4f', 
                  borderColor: '#ff4d4f', 
                  color: 'white',
                  fontFamily: 'Poppins, sans-serif'
                }}
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Delete</span>}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Modal 
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Job Position' :
              modalType === 'Edit' ? 'Edit Job Position Details' :
              modalType === 'View' ? 'View Job Position Information' :
              'Confirm Position Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ 
          danger: modalType === 'Delete', 
          style: { fontFamily: 'Poppins, sans-serif' } 
        }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        styles={{ body: { minHeight: '100px', padding: '20px', margin: 20, fontFamily: 'Poppins, sans-serif' } }}
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Position Title<span style={{ color: 'red' }}>*</span></span>}
              name="PositionTitle"
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter position title!</span> },
                { max: 255, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Position title cannot exceed 255 characters!</span> },
                { whitespace: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Position title cannot be empty!</span> }
              ]}
            >
              <Input 
                placeholder="Enter Position Title" 
                style={{ fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate per Hour<span style={{ color: 'red' }}>*</span></span>}
              name="RatePerHour"
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter rate per hour!</span> },
                { validator: (_, value) => value && parseFloat(value) >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate must be non-negative!</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="0.01"
                min="0"
                placeholder="Enter Rate per Hour" 
                style={{ fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10, fontFamily: 'Poppins, sans-serif' }}>
              Position Details:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Position Title:</strong> {selectedPosition?.PositionTitle}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Rate per Hour:</strong> ₱{parseFloat(selectedPosition?.RatePerHour).toFixed(2)}
            </p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this position?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The position "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedPosition?.PositionTitle}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PositionsTable;