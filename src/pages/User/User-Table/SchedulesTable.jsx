import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, TimePicker } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';
import moment from 'moment';

const { Column } = Table;

const SchedulesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]); // Original data
  const [filteredData, setFilteredData] = useState([]); // Filtered data
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [form] = Form.useForm();

  // Fetch data from the database
  const fetchData = () => {
    fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Data:", data); // 🔍 Log fetched data
        setData(data);
        setFilteredData(data); // Initialize filteredData with the fetched data
      })
      .catch((err) => console.error("Error fetching schedules:", err));
  };
  

  useEffect(() => {
    fetchData(); // Fetch data on component mount
  }, []);

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
    const filtered = data.filter(
      (item) =>
        item.TimeIn.toLowerCase().includes(value.toLowerCase()) ||
        item.TimeOut.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Open modal for Add, Edit, View, or Delete
  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    setModalType(type);
    setSelectedSchedule(record);
    setIsModalOpen(true);
  
    if (type === 'Edit' && record) {
      // Directly use moment to parse the time
      form.setFieldsValue({
        timeIn: moment(record.TimeIn, "h:mm A"),
        timeOut: moment(record.TimeOut, "h:mm A")
      });
    }
  };
  
  
  // Handle Add, Edit, or Delete operations
  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            timeIn: values.timeIn.format("h:mm A"), // Format time to "HH:MM AM/PM"
            timeOut: values.timeOut.format("h:mm A"), // Format time to "HH:MM AM/PM"
          };
          console.log("Add Payload:", payload); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              console.log("Add Response Status:", res.status); // Log response status
              if (!res.ok) {
                throw new Error("Network response was not ok");
              }
              return res.json();
            })
            .then((data) => {
              console.log("Add Response Data:", data); // Log response data
              message.success("Schedule added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after adding
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to add schedule. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Edit" && selectedSchedule) {
      form.validateFields()
        .then((values) => {
          const payload = {
            scheduleID: selectedSchedule.key, // Ensure this matches the key in the fetched data
            timeIn: values.timeIn.format("h:mm A"), // Format time to "HH:MM AM/PM"
            timeOut: values.timeOut.format("h:mm A"), // Format time to "HH:MM AM/PM"
          };
          console.log("Edit Payload:", payload); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              console.log("Edit Response Status:", res.status); // Log response status
              if (!res.ok) {
                throw new Error("Network response was not ok");
              }
              return res.json();
            })
            .then((data) => {
              console.log("Edit Response Data:", data); // Log response data
              message.success("Schedule updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after editing
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to update schedule. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    }
    else if (modalType === "Delete" && selectedSchedule) {
      console.log("Delete Payload:", selectedSchedule.key); // Log payload
      fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleID: selectedSchedule.key }), // Ensure this matches the key in the fetched data
      })
        .then((res) => {
          console.log("Delete Response Status:", res.status); // Log response status
          if (!res.ok) {
            throw new Error("Network response was not ok");
          }
          return res.json();
        })
        .then((data) => {
          console.log("Delete Response Data:", data); // Log response data
          message.success("Schedule deleted successfully!");
          setIsModalOpen(false);
          fetchData(); // Refetch data after deleting
        })
        .catch((err) => {
          console.error("Error:", err);
          message.error("Failed to delete schedule. Please try again.");
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
          dataIndex="TimeIn" // Ensure this matches the key in the fetched data
          key="TimeIn" 
          sorter={(a, b) => a.TimeIn.localeCompare(b.TimeIn)} 
        />
        <Column 
          title="Time Out ⬍" 
          dataIndex="TimeOut" // Ensure this matches the key in the fetched data
          key="TimeOut" 
          sorter={(a, b) => a.TimeOut.localeCompare(b.TimeOut)} 
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
            modalType === 'Add' ? 'Add a New Schedule' :
            modalType === 'Edit' ? 'Edit Schedule Details' :
            modalType === 'View' ? 'View Schedule Information' :
            'Confirm Schedule Deletion'
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
      Enter the details of the new schedule:
    </p>
    <Form form={form} layout="vertical">
      <Form.Item
        label="Time In"
        name="timeIn"
        rules={[
          { required: true, message: 'Please enter time in!' },
        ]}
      >
        <TimePicker
          use12Hours
          format="h:mm A"
          placeholder="Select Time In"
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item
        label="Time Out"
        name="timeOut"
        rules={[
          { required: true, message: 'Please enter time out!' },
        ]}
      >
        <TimePicker
          use12Hours
          format="h:mm A"
          placeholder="Select Time Out"
          style={{ width: '100%' }}
        />
      </Form.Item>
    </Form>
  </>
)}

{modalType === 'Edit' && (
  <>
    <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '18px' }}>Modify the schedule details below:</p>
    <Form form={form} layout="vertical">
      <Form.Item
        label="Time In"
        name="timeIn"
        rules={[
          { required: true, message: 'Please enter time in!' },
        ]}
      >
        <TimePicker
  use12Hours
  format="h:mm A"
  placeholder="Select Time In"
  style={{ width: '100%' }}
/>
      </Form.Item>
      <Form.Item
        label="Time Out"
        name="timeOut"
        rules={[
          { required: true, message: 'Please enter time out!' },
        ]}
      >
        <TimePicker
  use12Hours
  format="h:mm A"
  placeholder="Select Time In"
  style={{ width: '100%' }}
/>
      </Form.Item>
    </Form>
  </>
)}

    {modalType === 'View' && (
      <div>
        <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10}}>Schedule Details:</p>
        <p><strong>Time In:</strong> {selectedSchedule?.TimeIn}</p>
        <p><strong>Time Out:</strong> {selectedSchedule?.TimeOut}</p>
      </div>
    )}

    {modalType === 'Delete' && (
      <div>
        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
          ⚠️ Are you sure you want to delete this schedule?
        </p>
        <p>This action <strong>cannot be undone</strong>. The schedule "<strong>{selectedSchedule?.TimeIn} - {selectedSchedule?.TimeOut}</strong>" will be permanently removed.</p>
      </div>
    )}
      </Modal>
    </>
  );
};

export default SchedulesTable;