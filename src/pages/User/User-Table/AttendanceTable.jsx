import { useState, useEffect } from 'react';
import { Space, Table, Tag, Button, Input, Modal, Form, message, DatePicker, TimePicker, Select, Upload, Typography } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const AttendanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all'); // New state for branch filter, default to 'all'
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const [branchesRes, employeesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=branches`, { method: 'GET' }),
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=employees`, { method: 'GET' })
      ]);

      if (!branchesRes.ok) throw new Error(`Branches fetch failed: ${branchesRes.statusText}`);
      if (!employeesRes.ok) throw new Error(`Employees fetch failed: ${employeesRes.statusText}`);

      const branchesData = await branchesRes.json();
      const employeesData = await employeesRes.json();

      setBranches(branchesData);
      setEmployees(employeesData);
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown options: ${err.message}`);
    }
  };

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/fetch_attendance.php`);
      if (!res.ok) throw new Error(`Attendance fetch failed: ${res.statusText}`);
      const data = await res.json();

      const mappedData = data.map(attendance => ({
        key: attendance.AttendanceID,
        date: attendance.Date,
        employeeId: attendance.EmployeeID,
        employeeName: attendance.EmployeeName,
        branchId: attendance.BranchID,
        branch: attendance.BranchName,
        timeIn: moment(attendance.TimeIn, 'HH:mm:ss').format('hh:mm A'),
        timeOut: moment(attendance.TimeOut, 'HH:mm:ss').format('hh:mm A'),
        status: attendance.TimeInStatus,
      }));

      // Filter for today's date
      const today = moment().format('YYYY-MM-DD');
      const todayData = mappedData.filter(record => record.date === today);

      setOriginalData(todayData); // Store only today's data
      setFilteredData(todayData); // Set initial filtered data to today's records
    } catch (err) {
      console.error("Fetch Attendance Error:", err.message);
      message.error(`Failed to load attendance data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Combined filter function for search and branch
  const applyFilters = (data, search, branch) => {
    let result = [...data];

    // Apply branch filter
    if (branch !== 'all') {
      result = result.filter(item => item.branchId === branch);
    }

    // Apply search filter
    const lowerValue = search.toLowerCase().trim();
    if (lowerValue) {
      result = result.filter(item =>
        Object.values(item)
          .filter(val => typeof val === 'string' || typeof val === 'number')
          .map(val => val.toString().toLowerCase())
          .some(val => val.includes(lowerValue))
      );
    }

    return result;
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setFilteredData(applyFilters(originalData, value, selectedBranch));
  };

  const handleBranchChange = (value) => {
    setSelectedBranch(value);
    setFilteredData(applyFilters(originalData, searchText, value));
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      form.setFieldsValue({ branch: employee.BranchID });
    }
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedAttendance(record);
    setIsModalOpen(true);

    if (record) {
      const employee = employees.find(emp => emp.EmployeeID === record.employeeId);
      form.setFieldsValue({
        date: moment(record.date, 'YYYY-MM-DD'),
        employeeId: record.employeeId,
        branch: employee ? employee.BranchID : record.branchId,
        timeIn: moment(record.timeIn, 'hh:mm A'),
        timeOut: moment(record.timeOut, 'hh:mm A'),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ date: moment() }); // Set today's date as default for Add modal
    }
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      form.validateFields()
        .then((values) => {
          const timeIn = values.timeIn.format('HH:mm:ss');
          const timeInMoment = moment(timeIn, 'HH:mm:ss');
          const lateThreshold = moment('08:11:00', 'HH:mm:ss');
          const startDuty = moment('08:00:00', 'HH:mm:ss');
          const timeInStatus = timeInMoment.isBefore(startDuty) || 
                              (timeInMoment.isSameOrAfter(startDuty) && timeInMoment.isBefore(lateThreshold)) 
                              ? 'On-Time' : 'Late';

          const payload = {
            Date: values.date.format('YYYY-MM-DD'),
            EmployeeID: values.employeeId,
            BranchID: values.branch,
            TimeIn: timeIn,
            TimeOut: values.timeOut.format('HH:mm:ss'),
            TimeInStatus: timeInStatus,
          };

          if (modalType === "Edit" && selectedAttendance) {
            payload.AttendanceID = selectedAttendance.key;
          }

          return fetch(`${API_BASE_URL}/fetch_attendance.php`, {
            method: modalType === "Add" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(() => {
              message.success(`Attendance ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to ${modalType === "Add" ? "add" : "update"} attendance: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedAttendance) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_attendance.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ AttendanceID: selectedAttendance.key }),
        });

        const responseText = await res.text();
        console.log("Delete Response:", responseText);

        if (!res.ok) {
          throw new Error(`Delete failed: ${res.statusText} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.success) {
          message.success("Attendance deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete attendance: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleCSVUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true,
        complete: (results) => {
          const data = results.data.map(row => ({
            ...row,
            TimeInStatus: moment(row.TimeIn, 'HH:mm:ss').isSameOrAfter(moment('08:11:00', 'HH:mm:ss')) ? 'Late' : 'On-Time'
          }));
          fetch(`${API_BASE_URL}/fetch_attendance.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
            .then((res) => res.json())
            .then(() => {
              message.success("CSV data imported successfully!");
              fetchData();
            })
            .catch(() => message.error("Failed to import CSV data"));
        },
      });
    };
    reader.readAsText(file);
    return false;
  };

  const showLabels = screenWidth >= 600;

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Attendance - {moment().format('MMMM Do, YYYY')}
      </Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button 
          icon={<PlusOutlined />} 
          size="middle" 
          style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
          onClick={() => openModal('Add')}
        >
          {showLabels && 'Add Attendance'}
        </Button>
        <Upload accept=".csv" beforeUpload={handleCSVUpload} showUploadList={false}>
          <Button 
            icon={<UploadOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
          >
            {showLabels && 'Import CSV'}
          </Button>
        </Upload>
        <Select
          value={selectedBranch}
          onChange={handleBranchChange}
          style={{ 
            width: screenWidth < 480 ? '100%' : '200px', 
            marginTop: screenWidth < 480 ? 10 : 0, 
            fontFamily: 'Poppins, sans-serif' 
          }}
          placeholder="Filter by Branch"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {branches.map(branch => (
            <Option 
              key={branch.BranchID} 
              value={branch.BranchID} 
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {branch.BranchName}
            </Option>
          ))}
        </Select>
        <Input
          placeholder="Search Attendance Records"
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={{ position: ['bottomCenter'] }}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title="Date" 
          dataIndex="date" 
          key="date" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Employee ID" 
          dataIndex="employeeId" 
          key="employeeId" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Employee Name" 
          dataIndex="employeeName" 
          key="employeeName" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Branch" 
          dataIndex="branch" 
          key="branch" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Check In" 
          dataIndex="timeIn" 
          key="timeIn"
          sorter={(a, b) => moment(a.timeIn, 'hh:mm A').diff(moment(b.timeIn, 'hh:mm A'))}
          render={(text, record) => (
            <Space>
              <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>
              <Tag 
                color={record.status === 'Late' ? 'volcano' : 'green'} 
                style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}
              >
                {record.status}
              </Tag>
            </Space>
          )}
        />
        <Column 
          title="Check Out" 
          dataIndex="timeOut" 
          key="timeOut" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button 
                icon={<EyeOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('View', record)}
              >
                {showLabels && 'View'}
              </Button>
              <Button 
                icon={<EditOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Modal 
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Attendance' : 
               modalType === 'Edit' ? 'Edit Attendance Details' : 
               modalType === 'View' ? 'View Attendance Information' : 
               'Confirm Attendance Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete', style: { fontFamily: 'Poppins, sans-serif' } }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label="Date" 
              name="date" 
              rules={[{ required: true, message: 'Please select a date!' }]}
            >
              <DatePicker 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
                disabled={modalType === 'Add'} // Disable date picker for Add to enforce today
              />
            </Form.Item>
            <Form.Item 
              label="Employee" 
              name="employeeId" 
              rules={[{ required: true, message: 'Please select an employee!' }]}
            >
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
                onChange={handleEmployeeChange}
                filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {employees.map((employee) => (
                  <Option 
                    key={employee.EmployeeID} 
                    value={employee.EmployeeID}
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    {employee.EmployeeName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label="Branch" 
              name="branch" 
              rules={[{ required: true, message: 'Branch will be auto-set' }]}
            >
              <Select 
                placeholder="Employee Branch" 
                disabled
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {branches.map((branch) => (
                  <Option 
                    key={branch.BranchID} 
                    value={branch.BranchID}
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label="Check In" 
              name="timeIn" 
              rules={[{ required: true, message: 'Please select a time in!' }]}
            >
              <TimePicker 
                format="hh:mm A" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
                use12Hours 
              />
            </Form.Item>
            <Form.Item 
              label="Check Out" 
              name="timeOut" 
              rules={[{ required: true, message: 'Please select a time out!' }]}
            >
              <TimePicker 
                format="hh:mm A" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
                use12Hours 
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedAttendance && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p><strong>Date:</strong> {selectedAttendance.date}</p>
            <p><strong>Employee Name:</strong> {selectedAttendance.employeeName}</p>
            <p><strong>Branch:</strong> {selectedAttendance.branch}</p>
            <p><strong>Check In:</strong> {selectedAttendance.timeIn}</p>
            <p><strong>Check Out:</strong> {selectedAttendance.timeOut}</p>
            <p><strong>Status:</strong> {selectedAttendance.status}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedAttendance && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this attendance record?
            </p>
            <p>This action <strong>cannot be undone</strong>. The attendance record for "<strong>{selectedAttendance.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AttendanceTable;