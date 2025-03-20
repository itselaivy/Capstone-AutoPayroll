import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Tag, Radio, Typography } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const DeductionsTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // Grouped data
  const [rawData, setRawData] = useState([]); // Ungrouped raw data for modals
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deleteOption, setDeleteOption] = useState('all'); // 'all' or specific deductionId
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const employeesRes = await fetch(`${API_BASE_URL}/fetch_deductions.php?type=employees`, { method: 'GET' });
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
      const res = await fetch(`${API_BASE_URL}/fetch_deductions.php`);
      if (!res.ok) throw new Error(`Deductions fetch failed: ${res.statusText}`);
      const data = await res.json();

      // Map raw data for modals
      const mappedRawData = data.map(deduction => ({
        key: deduction.DeductionID,
        employeeId: deduction.EmployeeID,
        employeeName: deduction.EmployeeName,
        deductionType: deduction.DeductionType,
        amount: parseFloat(deduction.Amount).toFixed(2),
      }));
      setRawData(mappedRawData);

      // Group by EmployeeID for table display
      const groupedData = Object.values(
        data.reduce((acc, deduction) => {
          const { EmployeeID, EmployeeName, DeductionID, DeductionType, Amount } = deduction;
          if (!acc[EmployeeID]) {
            acc[EmployeeID] = {
              key: EmployeeID,
              employeeId: EmployeeID,
              employeeName: EmployeeName,
              deductions: [],
              totalAmount: 0,
            };
          }
          acc[EmployeeID].deductions.push({
            deductionId: DeductionID,
            type: DeductionType,
            amount: parseFloat(Amount).toFixed(2),
          });
          acc[EmployeeID].totalAmount += parseFloat(Amount);
          return acc;
        }, {})
      );
      setOriginalData(groupedData);
      setFilteredData(groupedData);
    } catch (err) {
      console.error("Fetch Deductions Error:", err.message);
      message.error(`Failed to load deductions data: ${err.message}`);
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
        item.employeeId.toString().toLowerCase().includes(lowerValue) ||
        item.employeeName.toLowerCase().includes(lowerValue) ||
        item.deductions.some(d => d.type.toLowerCase().includes(lowerValue))
      );
      setFilteredData(filtered);
    }
    setSearchText(value);
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedEmployee(record);
    setDeleteOption('all');
    if (type === "Edit" && record) {
      form.setFieldsValue({
        deductions: record.deductions.map(d => ({
          deductionId: d.deductionId,
          deductionType: d.type,
          amount: d.amount,
        })),
      });
    } else if (type === "Add") {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            EmployeeID: values.employeeId,
            DeductionType: values.deductionType,
            Amount: parseFloat(values.amount).toFixed(2),
          };

          return fetch(`${API_BASE_URL}/fetch_deductions.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(() => {
              message.success("Deduction added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to add deduction: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Edit" && selectedEmployee) {
      form.validateFields()
        .then((values) => {
          const payloads = values.deductions.map(deduction => ({
            DeductionID: deduction.deductionId,
            EmployeeID: selectedEmployee.employeeId,
            DeductionType: deduction.deductionType,
            Amount: parseFloat(deduction.amount).toFixed(2),
          }));

          const updatePromises = payloads.map(payload =>
            fetch(`${API_BASE_URL}/fetch_deductions.php`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }).then(res => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
          );

          return Promise.all(updatePromises)
            .then(() => {
              message.success("Deductions updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            });
        })
        .catch((err) => {
          message.error(`Failed to update deductions: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      try {
        let deletePromises;
        if (deleteOption === 'all') {
          deletePromises = selectedEmployee.deductions.map(deduction =>
            fetch(`${API_BASE_URL}/fetch_deductions.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ DeductionID: deduction.deductionId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          );
        } else {
          deletePromises = [
            fetch(`${API_BASE_URL}/fetch_deductions.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ DeductionID: deleteOption }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          ];
        }

        const results = await Promise.all(deletePromises);

        if (results.every(result => result.success)) {
          message.success(`Deduction${deleteOption === 'all' ? 's' : ''} deleted successfully!`);
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error("Failed to delete some deductions");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete deductions: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getDeductionLabel = (type) => {
    switch (type) {
      case 'Pag-Ibig':
        return 'Pag-Ibig Contribution';
      case 'SSS':
        return 'SSS Contribution';
      case 'PhilHealth':
        return 'PhilHealth Contribution';
      default:
        return type;
    }
  };

  const showLabels = screenWidth >= 600;

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Deductions
      </Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button 
          icon={<PlusOutlined />} 
          size="middle" 
          style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
          onClick={() => openModal('Add')}
        >
          {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Deduction</span>}
        </Button>
        <Input
          placeholder="Search by any field (e.g., name, type)"
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Deductions</span>}
          dataIndex="deductions"
          key="deductions"
          render={(deductions) => (
            <Space wrap>
              {deductions.map((deduction) => (
                <Tag key={deduction.deductionId} color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {deduction.type}: ₱{formatNumberWithCommas(deduction.amount)}
                </Tag>
              ))}
            </Space>
          )}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Total Amount</span>}
          dataIndex="totalAmount"
          key="totalAmount"
          sorter={(a, b) => a.totalAmount - b.totalAmount}
          render={(totalAmount) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(totalAmount)}</span>}
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
              {modalType === 'Add' ? 'Add New Deduction' : 
               modalType === 'Edit' ? 'Edit Deductions' : 
               modalType === 'View' ? 'View Deductions' : 
               'Confirm Deductions Deletion'}
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
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee</span>} 
              name="employeeId" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select an employee!</span> }]}
            >
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
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
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Deduction Type</span>} 
              name="deductionType" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a deduction type!</span> }]}
            >
              <Select placeholder="Select deduction type" style={{ fontFamily: 'Poppins, sans-serif' }}>
                <Option value="Pag-Ibig" style={{ fontFamily: 'Poppins, sans-serif' }}>Pag-Ibig</Option>
                <Option value="SSS" style={{ fontFamily: 'Poppins, sans-serif' }}>SSS</Option>
                <Option value="PhilHealth" style={{ fontFamily: 'Poppins, sans-serif' }}>PhilHealth</Option>
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)</span>} 
              name="amount" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> }]}
            >
              <Input type="number" step="0.01" min="0" style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'Edit' && selectedEmployee && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.List name="deductions">
              {(fields) => (
                <>
                  {fields.map((field, index) => (
                    <div key={field.key} style={{ marginBottom: 16 }}>
                      <Form.Item
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>{getDeductionLabel(selectedEmployee.deductions[index]?.type)}</span>}
                        name={[field.name, 'deductionType']}
                        rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a deduction type!</span> }]}
                      >
                        <Select placeholder="Select deduction type" disabled style={{ fontFamily: 'Poppins, sans-serif' }}>
                          <Option value="Pag-Ibig" style={{ fontFamily: 'Poppins, sans-serif' }}>Pag-Ibig</Option>
                          <Option value="SSS" style={{ fontFamily: 'Poppins, sans-serif' }}>SSS</Option>
                          <Option value="PhilHealth" style={{ fontFamily: 'Poppins, sans-serif' }}>PhilHealth</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)</span>}
                        name={[field.name, 'amount']}
                        rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> }]}
                      >
                        <Input type="number" step="0.01" min="0" style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'deductionId']} hidden>
                        <Input type="hidden" />
                      </Form.Item>
                    </div>
                  ))}
                </>
              )}
            </Form.List>
          </Form>
        )}

        {modalType === 'View' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10, fontFamily: 'Poppins, sans-serif' }}>
              Deductions for {selectedEmployee.employeeName}:
            </p>
            {selectedEmployee.deductions.map((deduction) => (
              <div key={deduction.deductionId} style={{ marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
                <p style={{ fontFamily: 'Poppins, sans-serif' }}>
                  <strong style={{ fontFamily: 'Poppins, sans-serif' }}>{getDeductionLabel(deduction.type)}:</strong> ₱{formatNumberWithCommas(deduction.amount)}
                </p>
              </div>
            ))}
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Total Amount:</strong> ₱{formatNumberWithCommas(selectedEmployee.totalAmount)}
            </p>
          </div>
        )}

        {modalType === 'Delete' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', marginBottom: 16, fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Select what to delete for {selectedEmployee.employeeName}:
            </p>
            <Radio.Group
              onChange={(e) => setDeleteOption(e.target.value)}
              value={deleteOption}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Poppins, sans-serif' }}
            >
              <Radio value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>Delete all deductions</Radio>
              {selectedEmployee.deductions.map((deduction) => (
                <Radio key={deduction.deductionId} value={deduction.deductionId} style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Delete {getDeductionLabel(deduction.type)} (₱{formatNumberWithCommas(deduction.amount)})
                </Radio>
              ))}
            </Radio.Group>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DeductionsTable;