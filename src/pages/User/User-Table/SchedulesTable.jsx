import { useState, useEffect } from 'react';
import { ConfigProvider, Modal, Space, Table, Button, Input, Form, message, TimePicker, Typography, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import './UserTable.css';
import moment from 'moment';

const { Column } = Table;
const { Title } = Typography;

const SchedulesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [form] = Form.useForm();
  const userId = localStorage.getItem('userId'); // Retrieve userId for logging

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB/fetch_schedules.php";

  const fetchData = () => {
    fetch(API_BASE_URL)
      .then((res) => res.json())
      .then((data) => {
        // Convert 12-hour to 24-hour format if needed
        const formattedData = data.map(item => ({
          ...item,
          ShiftStart: moment(item.ShiftStart, "h:mm A").isValid() 
            ? moment(item.ShiftStart, "h:mm A").format("HH:mm") 
            : item.ShiftStart,
          ShiftEnd: moment(item.ShiftEnd, "h:mm A").isValid() 
            ? moment(item.ShiftEnd, "h:mm A").format("HH:mm") 
            : item.ShiftEnd
        }));
        console.log("Fetched Data:", formattedData);
        setData(formattedData);
        setFilteredData(formattedData);
      })
      .catch((err) => console.error("Error fetching schedules:", err));
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
    const filtered = data.filter(
      (item) =>
        item.ShiftStart.toLowerCase().includes(value.toLowerCase()) ||
        item.ShiftEnd.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    setModalType(type);
    setSelectedSchedule(record);
    setIsModalOpen(true);
    if (type === 'Edit' && record) {
      form.setFieldsValue({
        shiftStart: moment(record.ShiftStart, "HH:mm"),
        shiftEnd: moment(record.ShiftEnd, "HH:mm")
      });
    } else if (type === 'Add') {
      form.resetFields();
    }
  };

  const handleOk = () => {
    if (!userId) {
      message.error("User not logged in. Please log in to proceed.");
      return;
    }

    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            shiftStart: values.shiftStart.format("HH:mm"),
            shiftEnd: values.shiftEnd.format("HH:mm"),
            user_id: userId
          };
          console.log("Add Payload:", payload);
          fetch(API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Network response was not ok");
              return res.json();
            })
            .then(() => {
              message.success("Schedule added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => message.error("Failed to add schedule. Please try again."));
        })
        .catch((errorInfo) => console.log("Validation Failed:", errorInfo));
    } else if (modalType === "Edit" && selectedSchedule) {
      form.validateFields()
        .then((values) => {
          const payload = {
            scheduleID: selectedSchedule.key,
            shiftStart: values.shiftStart.format("HH:mm"),
            shiftEnd: values.shiftEnd.format("HH:mm"),
            user_id: userId
          };
          console.log("Edit Payload:", payload);
          fetch(API_BASE_URL, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Network response was not ok");
              return res.json();
            })
            .then(() => {
              message.success("Schedule updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => message.error("Failed to update schedule. Please try again."));
        })
        .catch((errorInfo) => console.log("Validation Failed:", errorInfo));
    } else if (modalType === "Delete" && selectedSchedule) {
      console.log("Delete Payload:", selectedSchedule.key);
      fetch(API_BASE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleID: selectedSchedule.key, user_id: userId }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then(() => {
          message.success("Schedule deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        })
        .catch((err) => message.error("Failed to delete schedule. Please try again."));
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  return (
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="fade-in" style={{ padding: '20px' }}>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
            
            /* Ensure custom elements use Poppins */
            .fade-in, .fade-in * {
              font-family: 'Poppins', sans-serif !important;
            }
          `}
        </style>
        <Title level={2} style={{ marginBottom: '20px' }}>
          Company Schedules
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
            style={{ backgroundColor: '#2C374e', borderColor: '#2C3743', color: 'white' }}
            onClick={() => openModal('Add')}
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

        <Table 
          dataSource={filteredData} 
          bordered
          scroll={{ x: true }}
          pagination={{ responsive: true, position: ['bottomCenter'] }}
        >
          <Column 
            title="Shift Start ⬍" 
            dataIndex="ShiftStart" 
            key="ShiftStart" 
            sorter={(a, b) => a.ShiftStart.localeCompare(b.ShiftStart)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Shift End ⬍"
            dataIndex="ShiftEnd" 
            key="ShiftEnd" 
            sorter={(a, b) => a.ShiftEnd.localeCompare(b.ShiftEnd)}
            render={(text) => <span>{text}</span>}
          />
          <Column
            title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
            key="action"
            render={(_, record) => (
              <Space size={7} wrap>
                <Tooltip title="View">
                  <Button
                    icon={<EyeOutlined />}
                    size="middle"
                    style={{
                      width: '40px',
                      backgroundColor: '#52c41a',
                      borderColor: '#52c41a',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('View', record)}
                  />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button
                    icon={<EditOutlined />}
                    size="middle"
                    style={{
                      width: '40px',
                      backgroundColor: '#722ed1',
                      borderColor: '#722ed1',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('Edit', record)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    icon={<DeleteOutlined />}
                    size="middle"
                    style={{
                      width: '40px',
                      backgroundColor: '#ff4d4f',
                      borderColor: '#ff4d4f',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('Delete', record)}
                  />
                </Tooltip>
              </Space>
            )}
          />
        </Table>

        <Modal 
          title={
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
                {modalType === 'Add' ? 'Add a New Schedule' :
                 modalType === 'Edit' ? 'Edit Schedule Details' :
                 modalType === 'View' ? 'View Schedule Information' :
                 'Confirm Schedule Deletion'}
              </span>
            </div>
          }
          open={isModalOpen}
          onOk={modalType === 'View' ? handleCancel : handleOk}
          onCancel={handleCancel}
          okText={modalType === 'Delete' ? 'Delete' : 'OK'}
          okButtonProps={{ danger: modalType === 'Delete' }}
          cancelButtonProps={{}}
          width={600}
          centered
          styles={{ body: { minHeight: '100px', padding: '20px', margin: 20 } }}
        >
          {(modalType === 'Add' || modalType === 'Edit') && (
            <Form form={form} layout="vertical">
              <Form.Item
                label={<span>Shift Start<span style={{ color: 'red' }}>*</span></span>}
                name="shiftStart"
                rules={[{ required: true, message: 'Please enter start of the shift!' }]}
              >
                <TimePicker
                  format="HH:mm"
                  placeholder="Select Shift Start"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                label={<span>Shift End<span style={{ color: 'red' }}>*</span></span>}
                name="shiftEnd"
                rules={[{ required: true, message: 'Please enter end of the shift!' }]}
              >
                <TimePicker
                  format="HH:mm"
                  placeholder="Select Shift End"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
          )}

          {modalType === 'View' && (
            <div>
              <p>
                <strong>Shift Start:</strong> {selectedSchedule?.ShiftStart}
              </p>
              <p>
                <strong>Shift End:</strong> {selectedSchedule?.ShiftEnd}
              </p>
            </div>
          )}

          {modalType === 'Delete' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                ⚠️ Are you sure you want to delete this schedule?
              </p>
              <p>
                This action <strong>cannot be undone</strong>. 
                The schedule "<strong>{selectedSchedule?.ShiftStart} - {selectedSchedule?.ShiftEnd}</strong>" 
                will be permanently removed including all the records that has been assigned by this Schedule 
                <strong> (Employee Records and all of its assigned records).</strong>
              </p>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default SchedulesTable;