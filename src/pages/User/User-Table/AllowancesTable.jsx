import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Upload } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;

const AllowancesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // Store original data
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedAllowance, setSelectedAllowance] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const employeesRes = await fetch(`${API_BASE_URL}/fetch_allowances.php?type=employees`, { method: 'GET' });
      if (!employeesRes.ok) throw new Error(`Employees fetch failed: ${employeesRes.statusText}`);
      const employeesData = await employeesRes.json();
      setEmployees(employeesData);
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load employees: ${err.message}`);
    }
  };

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/fetch_allowances.php`);
      if (!res.ok) throw new Error(`Allowances fetch failed: ${res.statusText}`);
      const data = await res.json();

      const mappedData = data.map(allowance => ({
        key: allowance.AllowanceID,
        employeeId: allowance.EmployeeID,
        employeeName: allowance.EmployeeName,
        description: allowance.Description,
        amount: parseFloat(allowance.Amount).toFixed(2),
      }));
      setOriginalData(mappedData); // Store original data
      setFilteredData(mappedData); // Set initial filtered data
    } catch (err) {
      console.error("Fetch Allowances Error:", err.message);
      message.error(`Failed to load allowances data: ${err.message}`);
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

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedAllowance(record);
    setIsModalOpen(true);

    if (record) {
      form.setFieldsValue({
        employeeId: record.employeeId,
        description: record.description,
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
            EmployeeID: values.employeeId,
            Description: values.description,
            Amount: parseFloat(values.amount).toFixed(2),
          };

          if (modalType === "Edit" && selectedAllowance) {
            payload.AllowanceID = selectedAllowance.key;
          }

          return fetch(`${API_BASE_URL}/fetch_allowances.php`, {
            method: modalType === "Add" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(() => {
              message.success(`Allowance ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to ${modalType === "Add" ? "add" : "update"} allowance: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedAllowance) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_allowances.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ AllowanceID: selectedAllowance.key }),
        });

        const responseText = await res.text();
        console.log("Delete Response:", responseText);

        if (!res.ok) {
          throw new Error(`Delete failed: ${res.statusText} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.success) {
          message.success("Allowance deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete allowance: ${err.message}`);
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
            Amount: parseFloat(row.Amount).toFixed(2),
          }));
          fetch(`${API_BASE_URL}/fetch_allowances.php`, {
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
          {showLabels && 'Add Allowance'}
        </Button>
        <Upload accept=".csv" beforeUpload={handleCSVUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />} size="middle" style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}>
            {showLabels && 'Import CSV'}
          </Button>
        </Upload>
        <Input
          placeholder="Search by any field (e.g., name, description)"
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
        />
      </div>

      <Table dataSource={filteredData} bordered scroll={{ x: true }} pagination={{ position: ['bottomCenter'] }}>
        <Column title="Employee ID" dataIndex="employeeId" key="employeeId" sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)} />
        <Column title="Employee Name" dataIndex="employeeName" key="employeeName" sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)} />
        <Column title="Description" dataIndex="description" key="description" sorter={(a, b) => a.description.localeCompare(b.description)} />
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
        title={<div style={{ textAlign: 'center' }}><span style={{ fontSize: '22px', fontWeight: 'bold' }}>{modalType === 'Add' ? 'Add New Allowance' : modalType === 'Edit' ? 'Edit Allowance Details' : modalType === 'View' ? 'View Allowance Information' : 'Confirm Allowance Deletion'}</span></div>}
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
            <Form.Item label="Employee" name="employeeId" rules={[{ required: true, message: 'Please select an employee!' }]}>
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
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
            <Form.Item label="Description" name="description" rules={[{ required: true, message: 'Please enter a description!' }]}>
              <Input style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Amount (₱)" name="amount" rules={[{ required: true, message: 'Please enter the amount!' }]}>
              <Input type="number" step="0.01" min="0" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedAllowance && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10 }}>Allowance Details:</p>
            <p><strong>Employee Name:</strong> {selectedAllowance.employeeName}</p>
            <p><strong>Description:</strong> {selectedAllowance.description}</p>
            <p><strong>Amount:</strong> ₱{formatNumberWithCommas(selectedAllowance.amount)}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedAllowance && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this allowance record?
            </p>
            <p>This action <strong>cannot be undone</strong>. The allowance record for "<strong>{selectedAllowance.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default AllowancesTable;