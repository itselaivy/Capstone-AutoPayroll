import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, TimePicker, Typography } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
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

  const fetchData = () => {
    fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Data:", data);
        setData(data);
        setFilteredData(data);
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
        shiftStart: moment(record.ShiftStart, "h:mm A"),
        shiftEnd: moment(record.ShiftEnd, "h:mm A")
      });
    }
  };

  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            shiftStart: values.shiftStart.format("h:mm A"),
            shiftEnd: values.shiftEnd.format("h:mm A"),
          };
          console.log("Add Payload:", payload);
          fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
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
            shiftStart: values.shiftStart.format("h:mm A"),
            shiftEnd: values.shiftEnd.format("h:mm A"),
          };
          console.log("Edit Payload:", payload);
          fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
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
      fetch("http://localhost/UserTableDB/UserDB/fetch_schedules.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleID: selectedSchedule.key }),
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
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Schedules
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
          {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Schedule</span>}
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Shift Start ⬍</span>} 
          dataIndex="ShiftStart" 
          key="ShiftStart" 
          sorter={(a, b) => a.ShiftStart.localeCompare(b.ShiftStart)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Shift End ⬍</span>}
          dataIndex="ShiftEnd" 
          key="ShiftEnd" 
          sorter={(a, b) => a.ShiftEnd.localeCompare(b.ShiftEnd)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
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
              {modalType === 'Add' ? 'Add a New Schedule' :
              modalType === 'Edit' ? 'Edit Schedule Details' :
              modalType === 'View' ? 'View Schedule Information' :
              'Confirm Schedule Deletion'}
            </span>
          </div>
        }
        visible={isModalOpen}
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
        bodyStyle={{ minHeight: '100px', padding: '20px', margin: 20, fontFamily: 'Poppins, sans-serif' }}
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Shift Start</span>}
              name="shiftStart"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter start of the shift!</span> }]}
            >
              <TimePicker
                use12Hours
                format="h:mm A"
                placeholder="Select Shift Start"
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Shift End</span>}
              name="shiftEnd"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter end of the shift!</span> }]}
            >
              <TimePicker
                use12Hours
                format="h:mm A"
                placeholder="Select Shift End"
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10, fontFamily: 'Poppins, sans-serif' }}>
              Schedule Details:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Shift Start:</strong> {selectedSchedule?.ShiftStart}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Shift End:</strong> {selectedSchedule?.ShiftEnd}
            </p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this schedule?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The schedule "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedSchedule?.ShiftStart} - {selectedSchedule?.ShiftEnd}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SchedulesTable;