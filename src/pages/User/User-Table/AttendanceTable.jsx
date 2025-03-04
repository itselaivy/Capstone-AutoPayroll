import { useState, useEffect } from 'react';
import { Space, Table, Tag, Button, Input, Modal, Form, message, DatePicker, TimePicker, Select } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import moment from 'moment';


const { Column } = Table;

const initialData = [
  {
    key: '1',
    date: '2025-03-02',
    employeeId: 'EMP001',
    employeeName: 'John Brown',
    branch: 'New York Office',
    timeIn: '09:05 AM',
    timeOut: '05:00 PM',
    status: 'Late',
  },
  {
    key: '2',
    date: '2025-03-02',
    employeeId: 'EMP002',
    employeeName: 'Jim Green',
    branch: 'London Office',
    timeIn: '08:50 AM',
    timeOut: '04:55 PM',
    status: 'On-Time',
  },
  {
    key: '3',
    date: '2025-03-02',
    employeeId: 'EMP003',
    employeeName: 'Joe Black',
    branch: 'Sydney Office',
    timeIn: '09:15 AM',
    timeOut: '05:10 PM',
    status: 'Late',
  },
];

const AttendanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState(initialData);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showLabels = screenWidth >= 600;

  const handleSearch = (value) => {
    const filtered = initialData.filter(
      (item) =>
        item.employeeId.toLowerCase().includes(value.toLowerCase()) ||
        item.employeeName.toLowerCase().includes(value.toLowerCase()) ||
        item.branch.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedAttendance(record);
    setIsModalOpen(true);
  
    if (record) {
      setTimeout(() => {
        form.setFieldsValue({
          employeeId: record.employeeId, 
          employeeName: record.employeeName, 
          branch: record.branch, 
          date: record.date ? moment(record.date, 'YYYY-MM-DD') : null, 
          timeIn: record.timeIn ? moment(record.timeIn, 'hh:mm A') : null,
          timeOut: record.timeOut ? moment(record.timeOut, 'hh:mm A') : null,
          status: record.status,
        });
      }, 0); // Delay ensures the form is ready before setting values
    } else {
      form.resetFields();
    }
  };
  
  

  const handleOk = () => {
    form.validateFields().then(values => {
      const formattedValues = {
        ...values,
        date: values.date ? values.date.format('YYYY-MM-DD') : '',
        timeIn: values.timeIn ? values.timeIn.format('hh:mm A') : '',
        timeOut: values.timeOut ? values.timeOut.format('hh:mm A') : '',
      };
  
      if (modalType === 'Add') {
        const newEntry = { key: (filteredData.length + 1).toString(), ...formattedValues };
        setFilteredData([...filteredData, newEntry]);
        message.success('Attendance added successfully!');
      } else if (modalType === 'Edit' && selectedAttendance) {
        const updatedData = filteredData.map(item =>
          item.key === selectedAttendance.key ? { ...item, ...formattedValues } : item
        );
        setFilteredData(updatedData);
        message.success('Attendance updated successfully!');
      } else if (modalType === 'Delete' && selectedAttendance) {
        setFilteredData(filteredData.filter(item => item.key !== selectedAttendance.key));
        message.success('Attendance deleted successfully!');
      }
  
      setIsModalOpen(false);
    });
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
          onClick={() => openModal('Add')}
        >
          {showLabels && 'Add Attendance'} 
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
        pagination={{ position: ['bottomCenter'] }}
      >
        <Column title="Date" dataIndex="date" key="date" />
        <Column title="Employee ID" dataIndex="employeeId" key="employeeId" />
        <Column title="Employee Name" dataIndex="employeeName" key="employeeName" />
        <Column title="Branch" dataIndex="branch" key="branch" />
        <Column 
          title="Time In" 
          dataIndex="timeIn" 
          key="timeIn"
          sorter={(a, b) => a.timeIn.localeCompare(b.timeIn)}
          render={(text, record) => (
            <Space>
              {text}
              <Tag color={record.status === 'Late' ? 'volcano' : 'green'}>
                {record.status}
              </Tag>
            </Space>
          )}
        />
        <Column title="Time Out" dataIndex="timeOut" key="timeOut" />
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

      <Modal 
      
        title=<span style={{ fontSize: '22px', fontWeight: 'bold' }}>
          {modalType === 'Delete' ? 'Confirm Deletion' : `${modalType} Attendance`}
          </span>
        open={isModalOpen}
        onOk={modalType === 'Delete' ? handleOk : form.submit}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600} // Increased width
        centered // Centered modal
        bodyStyle={{ minHeight: '30px', padding: '20px'}} // Increased height & spacing
      >

        {modalType === 'Add' || modalType === 'Edit' ? (
          <Form form={form} layout="vertical" onFinish={handleOk}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="employeeId" label="Employee ID" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>

            <Form.Item name="employeeName" label="Employee Name" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>

            <Form.Item name="branch" label="Branch" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>

            <Form.Item name="timeIn" label="Time In" rules={[{ required: true }]}>
              <TimePicker format="hh:mm A" use12Hours style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="timeOut" label="Time Out" rules={[{ required: true }]}>
              <TimePicker format="hh:mm A" use12Hours style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="On-Time">On-Time</Select.Option>
                <Select.Option value="Late">Late</Select.Option>
              </Select>
            </Form.Item>
          </Form>

        ) : modalType === 'View' ? (
          <div style={{ fontSize: '16px', lineHeight: 2 }}>
            <p><strong>Date:</strong> {selectedAttendance?.date}</p>
            <p><strong>Employee ID:</strong> {selectedAttendance?.employeeId}</p>
            <p><strong>Employee Name:</strong> {selectedAttendance?.employeeName}</p>
            <p><strong>Branch:</strong> {selectedAttendance?.branch}</p>
            <p><strong>Time In:</strong> {selectedAttendance?.timeIn}</p>
            <p><strong>Time Out:</strong> {selectedAttendance?.timeOut}</p>
            <p><strong>Status:</strong> 
              <Tag color={selectedAttendance?.status === 'Late' ? 
              'volcano' : 'green'} 
              style={{ marginLeft: 8 }}>
              {selectedAttendance?.status}
              </Tag>
            </p>
          </div>

        ) : modalType === 'Delete' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this attendance?
            </p>
            <p>This action <strong>cannot be undone</strong>. The attendance of "<strong>{selectedAttendance?.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default AttendanceTable;
