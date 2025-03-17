import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Upload } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;

const CashAdvanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // Store original data
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedCashAdvance, setSelectedCashAdvance] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const [branchesRes, employeesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_cashadvance.php?type=branches`, { method: 'GET' }),
        fetch(`${API_BASE_URL}/fetch_cashadvance.php?type=employees`, { method: 'GET' })
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
      const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php`);
      if (!res.ok) throw new Error(`Cash Advance fetch failed: ${res.statusText}`);
      const data = await res.json();

      const mappedData = data.map(cashAdvance => ({
        key: cashAdvance.CashAdvanceID,
        date: cashAdvance.Date,
        employeeId: cashAdvance.EmployeeID,
        employeeName: cashAdvance.EmployeeName,
        branchId: cashAdvance.BranchID,
        branch: cashAdvance.BranchName,
        amount: parseFloat(cashAdvance.Amount).toFixed(2),
      }));
      setOriginalData(mappedData); // Store original data
      setFilteredData(mappedData); // Set initial filtered data
    } catch (err) {
      console.error("Fetch Cash Advance Error:", err.message);
      message.error(`Failed to load cash advance data: ${err.message}`);
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
    setSelectedCashAdvance(record);
    setIsModalOpen(true);

    if (record) {
      const employee = employees.find(emp => emp.EmployeeID === record.employeeId);
      form.setFieldsValue({
        date: moment(record.date, 'YYYY-MM-DD'),
        employeeId: record.employeeId,
        branch: employee ? employee.BranchID : record.branchId,
        amount: record.amount,
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
            Amount: parseFloat(values.amount).toFixed(2),
          };

          if (modalType === "Edit" && selectedCashAdvance) {
            payload.CashAdvanceID = selectedCashAdvance.key;
          }

          return fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
            method: modalType === "Add" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(() => {
              message.success(`Cash Advance ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to ${modalType === "Add" ? "add" : "update"} cash advance: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedCashAdvance) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ CashAdvanceID: selectedCashAdvance.key }),
        });

        const responseText = await res.text();
        console.log("Delete Response:", responseText);

        if (!res.ok) {
          throw new Error(`Delete failed: ${res.statusText} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.success) {
          message.success("Cash Advance deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete cash advance: ${err.message}`);
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
            Date: moment(row.Date, 'YYYY-MM-DD').format('YYYY-MM-DD'),
            Amount: parseFloat(row.Amount).toFixed(2),
          }));
          fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
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
          {showLabels && 'Add Cash Advance'}
        </Button>
        <Upload accept=".csv" beforeUpload={handleCSVUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />} size="middle" style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}>
            {showLabels && 'Import CSV'}
          </Button>
        </Upload>
        <Input
          placeholder="Search by any field (e.g., name, date, branch)"
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
        <Column 
          title="Amount" 
          dataIndex="amount" 
          key="amount" 
          sorter={(a, b) => a.amount - b.amount}
          render={(amount) => `₱${formatNumberWithCommas(amount)}`}
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
        title={<div style={{ textAlign: 'center' }}><span style={{ fontSize: '22px', fontWeight: 'bold' }}>{modalType === 'Add' ? 'Add New Cash Advance' : modalType === 'Edit' ? 'Edit Cash Advance Details' : modalType === 'View' ? 'View Cash Advance Information' : 'Confirm Cash Advance Deletion'}</span></div>}
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
            <Form.Item label="Amount (₱)" name="amount" rules={[{ required: true, message: 'Please enter the amount!' }]}>
              <Input type="number" step="0.01" min="0" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedCashAdvance && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10 }}>Cash Advance Details:</p>
            <p><strong>Date:</strong> {selectedCashAdvance.date}</p>
            <p><strong>Employee Name:</strong> {selectedCashAdvance.employeeName}</p>
            <p><strong>Branch:</strong> {selectedCashAdvance.branch}</p>
            <p><strong>Amount:</strong> ₱{formatNumberWithCommas(selectedCashAdvance.amount)}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedCashAdvance && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this cash advance record?
            </p>
            <p>This action <strong>cannot be undone</strong>. The cash advance record for "<strong>{selectedCashAdvance.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default CashAdvanceTable;