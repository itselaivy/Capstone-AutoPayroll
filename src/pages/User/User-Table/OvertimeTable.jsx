import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Upload, Typography } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const OvertimeTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedOvertime, setSelectedOvertime] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const [branchesRes, employeesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_overtime.php?type=branches`, { method: 'GET' }),
        fetch(`${API_BASE_URL}/fetch_overtime.php?type=employees`, { method: 'GET' })
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
      const res = await fetch(`${API_BASE_URL}/fetch_overtime.php`);
      if (!res.ok) throw new Error(`Overtime fetch failed: ${res.statusText}`);
      const data = await res.json();

      const mappedData = data.map(overtime => ({
        key: overtime.OvertimeID,
        date: overtime.Date,
        employeeId: overtime.EmployeeID,
        employeeName: overtime.EmployeeName,
        branchId: overtime.BranchID,
        branch: overtime.BranchName,
        hours: parseFloat(overtime["No_of_Hours"]).toFixed(2),
        minutes: overtime["No_of_Mins"],
        rate: parseFloat(overtime["Rate"]).toFixed(2),
      }));
      setOriginalData(mappedData);
      setFilteredData(mappedData);
    } catch (err) {
      console.error("Fetch Overtime Error:", err.message);
      message.error(`Failed to load overtime data: ${err.message}`);
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

  const handleSearch = (value) => {
    const lowerValue = value.toLowerCase().trim();
    if (!lowerValue) {
      setFilteredData(originalData);
    } else {
      const filtered = originalData.filter(item =>
        Object.values(item)
          .filter(val => typeof val === 'string' || typeof val === 'number')
          .map(val => val.toString().toLowerCase())
          .some(val => val.includes(lowerValue))
      );
      setFilteredData(filtered);
    }
    setSearchText(value);
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      form.setFieldsValue({ branch: employee.BranchID });
    }
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedOvertime(record);
    setIsModalOpen(true);

    if (record) {
      const employee = employees.find(emp => emp.EmployeeID === record.employeeId);
      form.setFieldsValue({
        date: moment(record.date, 'YYYY-MM-DD'),
        employeeId: record.employeeId,
        branch: employee ? employee.BranchID : record.branchId,
        hours: record.hours,
        minutes: record.minutes,
        rate: record.rate,
      });
    } else {
      form.resetFields();
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
          const payload = {
            Date: values.date.format('YYYY-MM-DD'),
            EmployeeID: values.employeeId,
            BranchID: values.branch,
            No_of_Hours: parseFloat(values.hours).toFixed(2),
            No_of_Mins: parseInt(values.minutes, 10),
            Rate: parseFloat(values.rate).toFixed(2),
          };

          if (modalType === "Edit" && selectedOvertime) {
            payload.OvertimeID = selectedOvertime.key;
          }

          return fetch(`${API_BASE_URL}/fetch_overtime.php`, {
            method: modalType === "Add" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(() => {
              message.success(`Overtime ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to ${modalType === "Add" ? "add" : "update"} overtime: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedOvertime) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_overtime.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ OvertimeID: selectedOvertime.key }),
        });

        const responseText = await res.text();
        console.log("Delete Response:", responseText);

        if (!res.ok) {
          throw new Error(`Delete failed: ${res.statusText} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.success) {
          message.success("Overtime deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete overtime: ${err.message}`);
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
            No_of_Hours: parseFloat(row["No. of Hours"]).toFixed(2),
            No_of_Mins: parseInt(row["No. of Mins"], 10),
            Rate: parseFloat(row["Rate (₱)"]).toFixed(2),
          }));
          fetch(`${API_BASE_URL}/fetch_overtime.php`, {
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

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const showLabels = screenWidth >= 600;

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Overtime
      </Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button 
          icon={<PlusOutlined />} 
          size="middle" 
          style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
          onClick={() => openModal('Add')}
        >
          {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Overtime</span>}
        </Button>
        <Upload accept=".csv" beforeUpload={handleCSVUpload} showUploadList={false}>
          <Button 
            icon={<UploadOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Import CSV</span>}
          </Button>
        </Upload>
        <Input
          placeholder="Search by any field (e.g., name, date, hours)"
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date</span>} 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => moment(a.date).diff(moment(b.date))}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>} 
          dataIndex="employeeId" 
          key="employeeId" 
          sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name</span>} 
          dataIndex="employeeName" 
          key="employeeName" 
          sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>} 
          dataIndex="branch" 
          key="branch" 
          sorter={(a, b) => a.branch.localeCompare(b.branch)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours</span>} 
          dataIndex="hours" 
          key="hours" 
          sorter={(a, b) => a.hours - b.hours}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins</span>} 
          dataIndex="minutes" 
          key="minutes" 
          sorter={(a, b) => a.minutes - b.minutes}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate (₱)</span>} 
          dataIndex="rate" 
          key="rate" 
          sorter={(a, b) => a.rate - b.rate}
          render={(rate) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(rate)}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button 
                icon={<EyeOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('View', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>View</span>}
              </Button>
              <Button 
                icon={<EditOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Edit</span>}
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
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
              {modalType === 'Add' ? 'Add New Overtime' : 
               modalType === 'Edit' ? 'Edit Overtime Details' : 
               modalType === 'View' ? 'View Overtime Information' : 
               'Confirm Overtime Deletion'}
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
        bodyStyle={{ padding: '20px', fontFamily: 'Poppins, sans-serif' }}
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date</span>} 
              name="date" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee</span>} 
              name="employeeId" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select an employee!</span> }]}
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
                  <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {employee.EmployeeName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>} 
              name="branch" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch will be auto-set</span> }]}
            >
              <Select 
                placeholder="Employee Branch" 
                disabled
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {branches.map((branch) => (
                  <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours</span>} 
              name="hours" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of hours!</span> }]}
            >
              <Input 
                type="number" 
                step="0.01" 
                min="0" 
                max="999.99" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins</span>} 
              name="minutes" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of minutes!</span> }]}
            >
              <Input 
                type="number" 
                step="1" 
                min="0" 
                max="59" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate (₱)</span>} 
              name="rate" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the rate!</span> }]}
            >
              <Input 
                type="number" 
                step="0.01" 
                min="0" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedOvertime && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10, fontFamily: 'Poppins, sans-serif' }}>
              Overtime Details:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date:</strong> {selectedOvertime.date}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name:</strong> {selectedOvertime.employeeName}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedOvertime.branch}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours:</strong> {selectedOvertime.hours}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins:</strong> {selectedOvertime.minutes}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Rate:</strong> ₱{formatNumberWithCommas(selectedOvertime.rate)}
            </p>
          </div>
        )}

        {modalType === 'Delete' && selectedOvertime && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this overtime record?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The overtime record for "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedOvertime.employeeName}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OvertimeTable;