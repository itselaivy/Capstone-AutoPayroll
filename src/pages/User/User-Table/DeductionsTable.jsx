import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Tag, Radio, Typography, Pagination } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const DeductionsTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deleteOption, setDeleteOption] = useState('all');
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  const fetchDropdownData = async () => {
    try {
      if (!userId || !role) throw new Error('Missing userId or role');
      const [employeesRes, branchesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_deductions.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_deductions.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`)
      ]);

      if (!employeesRes.ok || !branchesRes.ok || !assignedBranchesRes.ok) {
        throw new Error('Failed to fetch dropdown data');
      }

      const [employeesData, branchesData, assignedBranchesData] = await Promise.all([
        employeesRes.json(),
        branchesRes.json(),
        assignedBranchesRes.json()
      ]);

      setEmployees(employeesData);
      setBranches(branchesData);
      setAssignedBranches(assignedBranchesData.data || []);
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown data: ${err.message}`);
    }
  };

  const fetchData = async () => {
    try {
      if (!userId || !role) {
        message.error('Please log in to view deductions');
        return;
      }

      let url = `${API_BASE_URL}/fetch_deductions.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Deductions fetch failed: ${res.statusText} - ${errorText}`);
      }
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch deductions');

      const mappedRawData = response.data.map(deduction => ({
        key: deduction.DeductionID,
        employeeId: deduction.EmployeeID,
        employeeName: deduction.EmployeeName,
        branchId: deduction.BranchID,
        branchName: deduction.BranchName,
        deductionType: deduction.DeductionType,
        amount: parseFloat(deduction.Amount).toFixed(2),
      }));
      setRawData(mappedRawData);

      const groupedData = Object.values(
        response.data.reduce((acc, deduction) => {
          const { EmployeeID, EmployeeName, BranchID, BranchName, DeductionID, DeductionType, Amount } = deduction;
          if (!acc[EmployeeID]) {
            acc[EmployeeID] = {
              key: EmployeeID,
              employeeId: EmployeeID,
              employeeName: EmployeeName,
              branchId: BranchID,
              branchName: BranchName,
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
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(groupedData.length);
    } catch (err) {
      console.error("Fetch Deductions Error:", err.message);
      message.error(`Failed to load deductions data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
    const lowerValue = value.toLowerCase().trim();
    let filtered = originalData;
    if (selectedBranch !== 'all') {
      filtered = filtered.filter(item => item.branchId === selectedBranch);
    }
    if (lowerValue) {
      filtered = filtered.filter(item =>
        item.employeeId.toString().toLowerCase().includes(lowerValue) ||
        item.employeeName.toLowerCase().includes(lowerValue) ||
        item.branchName.toLowerCase().includes(lowerValue) ||
        item.deductions.some(d => d.type.toLowerCase().includes(lowerValue))
      );
    }
    setFilteredData(filtered);
    setFilteredPaginationTotal(filtered.length);
    setSearchText(value);
    setCurrentPage(1);
  };

  const handleBranchChange = (value) => {
    setSelectedBranch(value || 'all');
    setCurrentPage(1);
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
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
            BranchID: values.branchId,
            DeductionType: values.deductionType,
            Amount: parseFloat(values.amount).toFixed(2),
            user_id: userId,
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
            .then((data) => {
              if (data.success) {
                message.success("Deduction added successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else if (data.warning) {
                message.warning(data.warning);
              } else {
                throw new Error(data.error || "Failed to add deduction");
              }
            })
            .catch((err) => {
              message.error(`Failed to add deduction: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
            });
        })
        .catch((err) => {
          message.error(`Failed to add deduction: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
        });
    } else if (modalType === "Edit" && selectedEmployee) {
      form.validateFields()
        .then((values) => {
          const payloads = values.deductions.map(deduction => ({
            DeductionID: deduction.deductionId,
            EmployeeID: selectedEmployee.employeeId,
            DeductionType: deduction.deductionType,
            Amount: parseFloat(deduction.amount).toFixed(2),
            user_id: userId,
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
            .then((results) => {
              if (results.every(result => result.success)) {
                message.success("Deductions updated successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else {
                throw new Error("Failed to update some deductions");
              }
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
              body: JSON.stringify({ DeductionID: deduction.deductionId, user_id: userId }),
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
              body: JSON.stringify({ DeductionID: deleteOption, user_id: userId }),
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

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      form.setFieldsValue({ branchId: employee.BranchID });
    } else {
      form.setFieldsValue({ branchId: undefined });
    }
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Deductions
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select
          placeholder="Select Branch"
          allowClear
          value={selectedBranch}
          onChange={handleBranchChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', fontFamily: 'Poppins, sans-serif' }}
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {(role === 'Payroll Admin' ? branches : assignedBranches).map(branch => (
            <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {branch.BranchName}
            </Option>
          ))}
        </Select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button 
            icon={<PlusOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
            onClick={() => openModal('Add')}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Deduction</span>}
          </Button>
          <Input
            placeholder="Search by any field (e.g., name, type, branch)"
            allowClear
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          />
        </div>
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={false}
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>} 
          dataIndex="branchName" 
          key="branchName" 
          sorter={(a, b) => a.branchName.localeCompare(b.branchName)}
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

      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={searchText.trim() || selectedBranch !== 'all' ? filteredPaginationTotal : paginationTotal}
        onChange={handlePageChange}
        onShowSizeChange={handlePageChange}
        showSizeChanger
        showQuickJumper={{ goButton: false }}
        showTotal={(total) => `Total ${total} deduction records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'center', fontFamily: 'Poppins, sans-serif', justifyContent: 'center' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Deduction Details' : 
               modalType === 'Edit' ? 'Edit Deduction Details' : 
               modalType === 'View' ? 'View Deduction Details' : 
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
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
      >
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee<span style={{ color: 'red' }}>*</span></span>} 
              name="employeeId" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select an employee!</span> }]}
            >
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
                filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                style={{ fontFamily: 'Poppins, sans-serif' }}
                onChange={handleEmployeeChange}
              >
                {(role === 'Payroll Admin' ? employees : employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID)))
                  .map((employee) => (
                    <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {employee.EmployeeName}
                    </Option>
                  ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Deduction Type<span style={{ color: 'red' }}>*</span></span>} 
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
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="amount" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount cannot be negative!</span>) }
              ]}
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
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>{getDeductionLabel(selectedEmployee.deductions[index]?.type)}<span style={{ color: 'red' }}>*</span></span>}
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
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>}
                        name={[field.name, 'amount']}
                        rules={[
                          { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> },
                          { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount cannot be negative!</span>) }
                        ]}
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
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 30, fontFamily: 'Poppins, sans-serif' }}>
              Deductions for {selectedEmployee.employeeName} ({selectedEmployee.branchName})
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
            <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#ff4d4f', marginBottom: 16, fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
              ⚠️ Select what to delete a deduction record for {selectedEmployee.employeeName}:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center', marginBottom: 16 }}>This action <strong>cannot be undone</strong>. The deduction record assigned to employee "<strong>{selectedEmployee.employeeName}</strong>" will be permanently removed.</p>
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