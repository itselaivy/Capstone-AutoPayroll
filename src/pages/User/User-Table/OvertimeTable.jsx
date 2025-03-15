import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Upload } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;

const OvertimeTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // Store original data
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
      setOriginalData(mappedData); // Store original data
      setFilteredData(mappedData); // Set initial filtered data
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
      setFilteredData(originalData); // Revert to original data when search is cleared
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
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button icon={<PlusOutlined />} size="middle" style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }} onClick={() => openModal('Add')}>
          {showLabels && 'Add Overtime'}
        </Button>
        <Upload accept=".csv" beforeUpload={handleCSVUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />} size="middle" style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}>
            {showLabels && 'Import CSV'}
          </Button>
        </Upload>
        <Input
          placeholder="Search by any field (e.g., name, date, hours)"
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
        />
      </div>

      <Table dataSource={filteredData} bordered scroll={{ x: true }} pagination={{ position: ['bottomCenter'] }}>
        <Column title="Date" dataIndex="date" key="date" sorter={(a, b) => moment(a.date).diff(moment(b.date))} />
        <Column title="Employee ID" dataIndex="employeeId" key="employeeId" sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)} />
        <Column title="Employee Name" dataIndex="employeeName" key="employeeName" sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)} />
        <Column title="Branch" dataIndex="branch" key="branch" sorter={(a, b) => a.branch.localeCompare(b.branch)} />
        <Column title="No. of Hours" dataIndex="hours" key="hours" sorter={(a, b) => a.hours - b.hours} />
        <Column title="No. of Mins" dataIndex="minutes" key="minutes" sorter={(a, b) => a.minutes - b.minutes} />
        <Column 
          title="Rate (₱)" 
          dataIndex="rate" 
          key="rate" 
          sorter={(a, b) => a.rate - b.rate}
          render={(rate) => `₱${formatNumberWithCommas(rate)}`}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button icon={<EyeOutlined />} size="middle" style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white' }} onClick={() => openModal('View', record)}>
                {showLabels && 'View'}
              </Button>
              <Button icon={<EditOutlined />} size="middle" style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white' }} onClick={() => openModal('Edit', record)}>
                {showLabels && 'Edit'}
              </Button>
              <Button icon={<DeleteOutlined />} size="middle" style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white' }} onClick={() => openModal('Delete', record)}>
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Modal
        title={<div style={{ textAlign: 'center' }}><span style={{ fontSize: '22px', fontWeight: 'bold' }}>{modalType === 'Add' ? 'Add New Overtime' : modalType === 'Edit' ? 'Edit Overtime Details' : modalType === 'View' ? 'View Overtime Information' : 'Confirm Overtime Deletion'}</span></div>}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600}
        centered
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical">
            <Form.Item label="Date" name="date" rules={[{ required: true, message: 'Please select a date!' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Employee" name="employeeId" rules={[{ required: true, message: 'Please select an employee!' }]}>
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
                onChange={handleEmployeeChange}
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                {employees.map((employee) => (
                  <Option key={employee.EmployeeID} value={employee.EmployeeID}>
                    {employee.EmployeeName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Branch" name="branch" rules={[{ required: true, message: 'Branch will be auto-set' }]}>
              <Select placeholder="Employee Branch" disabled>
                {branches.map((branch) => (
                  <Option key={branch.BranchID} value={branch.BranchID}>
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="No. of Hours" name="hours" rules={[{ required: true, message: 'Please enter the number of hours!' }]}>
              <Input type="number" step="0.01" min="0" max="999.99" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="No. of Mins" name="minutes" rules={[{ required: true, message: 'Please enter the number of minutes!' }]}>
              <Input type="number" step="1" min="0" max="59" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Rate (₱)" name="rate" rules={[{ required: true, message: 'Please enter the rate!' }]}>
              <Input type="number" step="0.01" min="0" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedOvertime && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10 }}>Overtime Details:</p>
            <p><strong>Date:</strong> {selectedOvertime.date}</p>
            <p><strong>Employee Name:</strong> {selectedOvertime.employeeName}</p>
            <p><strong>Branch:</strong> {selectedOvertime.branch}</p>
            <p><strong>No. of Hours:</strong> {selectedOvertime.hours}</p>
            <p><strong>No. of Mins:</strong> {selectedOvertime.minutes}</p>
            <p><strong>Rate:</strong> ₱{formatNumberWithCommas(selectedOvertime.rate)}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedOvertime && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this overtime record?
            </p>
            <p>This action <strong>cannot be undone</strong>. The overtime record for "<strong>{selectedOvertime.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default OvertimeTable;