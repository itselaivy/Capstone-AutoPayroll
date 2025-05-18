import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Tag, Radio, Typography, Pagination, Tooltip, ConfigProvider } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const LoanTable = () => {
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

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  const fetchDropdownData = async () => {
    try {
      if (!userId || !role) throw new Error('Missing userId or role');
      const [employeesRes, branchesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_loan.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_loan.php?type=branches`),
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
        message.error('Please log in to view loans');
        return;
      }

      let url = `${API_BASE_URL}/fetch_loan.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      if (searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Loans fetch failed: ${res.statusText} - ${errorText}`);
      }
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch loans');

      const mappedRawData = response.data.map(loan => ({
        key: loan.LoanID,
        employeeId: loan.EmployeeID,
        employeeName: loan.EmployeeName,
        branchId: loan.BranchID,
        branchName: loan.BranchName,
        loanKey: loan.LoanKey,
        loanType: loan.LoanType,
        amount: parseFloat(loan.Amount).toFixed(2),
      }));
      setRawData(mappedRawData);

      const groupedData = Object.values(
        response.data.reduce((acc, loan) => {
          const { EmployeeID, EmployeeName, BranchID, BranchName, LoanID, LoanKey, LoanType, Amount } = loan;
          if (!acc[EmployeeID]) {
            acc[EmployeeID] = {
              key: EmployeeID,
              employeeId: EmployeeID,
              employeeName: EmployeeName,
              branchId: BranchID,
              branchName: BranchName,
              loans: [],
              totalAmount: 0,
            };
          }
          acc[EmployeeID].loans.push({
            loanId: LoanID,
            key: LoanKey,
            type: LoanType,
            amount: parseFloat(Amount).toFixed(2),
          });
          acc[EmployeeID].totalAmount += parseFloat(Amount);
          return acc;
        }, {})
      );

      setOriginalData(groupedData);
      setFilteredData(groupedData);
      setPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Loans Error:", err.message);
      message.error(`Failed to load loans data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch, searchText]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
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
        loans: record.loans.map(l => ({
          loanId: l.loanId,
          loanKey: l.key,
          loanType: l.type,
          amount: l.amount,
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
            LoanKey: values.loanKey,
            LoanType: values.loanType,
            Amount: parseFloat(values.amount).toFixed(2),
            user_id: userId,
          };

          return fetch(`${API_BASE_URL}/fetch_loan.php`, {
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
                message.success("Loan added successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else if (data.warning) {
                message.warning(data.warning);
              } else {
                throw new Error(data.error || "Failed to add loan");
              }
            })
            .catch((err) => {
              message.error(`Failed to add loan: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
            });
        })
        .catch((err) => {
          message.error(`Failed to add loan: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
        });
    } else if (modalType === "Edit" && selectedEmployee) {
      form.validateFields()
        .then((values) => {
          const payloads = values.loans.map(loan => ({
            LoanID: loan.loanId,
            EmployeeID: selectedEmployee.employeeId,
            LoanKey: loan.loanKey,
            LoanType: loan.loanType,
            Amount: parseFloat(loan.amount).toFixed(2),
            user_id: userId,
          }));

          const updatePromises = payloads.map(payload =>
            fetch(`${API_BASE_URL}/fetch_loan.php`, {
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
                message.success("Loans updated successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else {
                throw new Error("Failed to update some loans");
              }
            });
        })
        .catch((err) => {
          message.error(`Failed to update loans: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      try {
        let deletePromises;
        if (deleteOption === 'all') {
          deletePromises = selectedEmployee.loans.map(loan =>
            fetch(`${API_BASE_URL}/fetch_loan.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ LoanID: loan.loanId, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          );
        } else {
          deletePromises = [
            fetch(`${API_BASE_URL}/fetch_loan.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ LoanID: deleteOption, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          ];
        }

        const results = await Promise.all(deletePromises);

        if (results.every(result => result.success)) {
          message.success(`Loan${deleteOption === 'all' ? 's' : ''} deleted successfully!`);
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error("Failed to delete some loans");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete loans: ${err.message}`);
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

  const getLoanLabel = (key, type) => {
    const keyLabel = {
      'Pag-Ibig': 'Pag-Ibig',
      'SSS': 'SSS',
    }[key] || key;
    return `${keyLabel} ${type} Loan`;
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
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="fade-in" style={{ padding: '20px' }}>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
            
            /* Ensure custom elements use Poppins */
            .fade-in, .fade-in * {
              font-family: 'Poppins', sans-serif !important;
            }

            /* Override Ant Design components */
            .ant-select-item, .ant-tag, .ant-radio, .ant-tooltip-inner, .ant-message-notice-content {
              font-family: 'Poppins', sans-serif !important;
            }
          `}
        </style>
        <Title level={2} style={{ marginBottom: '20px' }}>
          Loans
        </Title>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Select
            placeholder="Select Branch"
            allowClear
            value={selectedBranch}
            onChange={handleBranchChange}
            style={{ width: screenWidth < 480 ? '100%' : '200px' }}
          >
            <Option value="all">All Branches</Option>
            {(role === 'Payroll Admin' ? branches : assignedBranches).map(branch => (
              <Option key={branch.BranchID} value={branch.BranchID}>
                {branch.BranchName}
              </Option>
            ))}
          </Select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button 
              icon={<PlusOutlined />} 
              size="middle" 
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }} 
              onClick={() => openModal('Add')}
            >
              {showLabels && <span>Add Loan</span>}
            </Button>
            <Input
              placeholder="Search by name, loan key, or loan type"
              allowClear
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
            />
          </div>
        </div>

        <Table 
          dataSource={filteredData} 
          bordered 
          scroll={{ x: true }} 
          pagination={false}
        >
          <Column 
            title="Employee ID" 
            dataIndex="employeeId" 
            key="employeeId" 
            sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Employee Name" 
            dataIndex="employeeName" 
            key="employeeName" 
            sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Branch" 
            dataIndex="branchName" 
            key="branchName" 
            sorter={(a, b) => a.branchName.localeCompare(b.branchName)}
            render={(text) => <span>{text}</span>}
          />
          <Column
            title="Loans"
            dataIndex="loans"
            key="loans"
            render={(loans) => (
              <Space wrap>
                {loans.map((loan) => (
                  <Tag key={loan.loanId} color="blue">
                    {getLoanLabel(loan.key, loan.type)}: ₱{formatNumberWithCommas(loan.amount)}
                  </Tag>
                ))}
              </Space>
            )}
          />
          <Column
            title="Total Amount"
            dataIndex="totalAmount"
            key="totalAmount"
            sorter={(a, b) => a.totalAmount - b.totalAmount}
            render={(totalAmount) => <span>₱{formatNumberWithCommas(totalAmount)}</span>}
          />
          <Column
            title="Action"
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
                      color: 'white'
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
                      color: 'white'
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
                      color: 'white'
                    }}
                    onClick={() => openModal('Delete', record)}
                  />
                </Tooltip>
              </Space>
            )}
          />
        </Table>

        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={paginationTotal}
          onChange={handlePageChange}
          onShowSizeChange={handlePageChange}
          showSizeChanger
          showQuickJumper={{ goButton: false }}
          showTotal={(total) => `Total ${total} employee records`}
          pageSizeOptions={['10', '20', '50', '100']}
          style={{ marginTop: 16, textAlign: 'center', justifyContent: 'center' }}
        />

        <Modal
          title={
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
                {modalType === 'Add' ? 'Add New Loan Details' : 
                 modalType === 'Edit' ? 'Edit Loan Details' : 
                 modalType === 'View' ? 'View Loan Details' : 
                 'Confirm Loans Deletion'}
              </span>
            </div>
          }
          open={isModalOpen}
          onOk={handleOk}
          onCancel={handleCancel}
          okText={modalType === 'Delete' ? 'Delete' : 'OK'}
          okButtonProps={{ danger: modalType === 'Delete' }}
          cancelButtonProps={{}}
          width={600}
          centered
          styles={{ body: { padding: '20px' } }}
        >
          {modalType === 'Add' && (
            <Form form={form} layout="vertical">
              <Form.Item 
                label={<span>Employee<span style={{ color: 'red' }}>*</span></span>} 
                name="employeeId" 
                rules={[{ required: true, message: 'Please select an employee!' }]}
              >
                <Select
                  showSearch
                  placeholder="Type or select an employee"
                  optionFilterProp="children"
                  filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                  onChange={handleEmployeeChange}
                >
                  {(role === 'Payroll Admin' ? employees : employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID)))
                    .map((employee) => (
                      <Option key={employee.EmployeeID} value={employee.EmployeeID}>
                        {employee.EmployeeName}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label={<span>Loan Key<span style={{ color: 'red' }}>*</span></span>} 
                name="loanKey" 
                rules={[{ required: true, message: 'Please select a loan key!' }]}
              >
                <Select placeholder="Select loan key">
                  <Option value="Pag-Ibig">Pag-Ibig</Option>
                  <Option value="SSS">SSS</Option>
                </Select>
              </Form.Item>
              <Form.Item 
                label={<span>Loan Type<span style={{ color: 'red' }}>*</span></span>} 
                name="loanType" 
                rules={[{ required: true, message: 'Please select a loan type!' }]}
              >
                <Select placeholder="Select loan type">
                  <Option value="Calamity">Calamity</Option>
                  <Option value="Salary">Salary</Option>
                </Select>
              </Form.Item>
              <Form.Item 
                label={<span>Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
                name="amount" 
                rules={[
                  { required: true, message: 'Please enter the amount!' },
                  { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject('Amount cannot be negative!') }
                ]}
              >
                <Input type="number" step="0.01" min="0" style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          )}

          {modalType === 'Edit' && selectedEmployee && (
            <Form form={form} layout="vertical">
              <Form.List name="loans">
                {(fields) => (
                  <>
                    {fields.map((field, index) => (
                      <div key={field.key} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <Form.Item
                            label={<span>{getLoanLabel(selectedEmployee.loans[index]?.key, selectedEmployee.loans[index]?.type)}<span style={{ color: 'red' }}>*</span></span>}
                            name={[field.name, 'loanKey']}
                            rules={[{ required: true, message: 'Please select a loan key!' }]}
                            style={{ flex: 1 }}
                          >
                            <Select placeholder="Select loan key" disabled={true}>
                              <Option value="Pag-Ibig">Pag-Ibig</Option>
                              <Option value="SSS">SSS</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<span>Loan Type<span style={{ color: 'red' }}>*</span></span>}
                            name={[field.name, 'loanType']}
                            rules={[{ required: true, message: 'Please select a loan type!' }]}
                            style={{ flex: 1 }}
                          >
                            <Select placeholder="Select loan type" disabled={true}>
                              <Option value="Calamity">Calamity</Option>
                              <Option value="Salary">Salary</Option>
                            </Select>
                          </Form.Item>
                        </div>
                        <Form.Item
                          label={<span>Amount (₱)<span style={{ color: 'red' }}>*</span></span>}
                          name={[field.name, 'amount']}
                          rules={[
                            { required: true, message: 'Please enter the amount!' },
                            { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject('Amount cannot be negative!') }
                          ]}
                        >
                          <Input type="number" step="0.01" min="0" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'loanId']} hidden>
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
            <div>
              <p style={{ fontSize: '14px' }}>
                <strong>Employee Name:</strong> {selectedEmployee.employeeName}
              </p>
              <p style={{ fontSize: '14px' }}>
                <strong>Branch:</strong> {selectedEmployee.branchName}
              </p>
              {selectedEmployee.loans.map((loan) => (
                <div key={loan.loanId} style={{ marginBottom: 8 }}>
                  <p>
                    <strong>{getLoanLabel(loan.key, loan.type)}:</strong> ₱{formatNumberWithCommas(loan.amount)}
                  </p>
                </div>
              ))}
              <p>
                <strong>Total Amount:</strong> ₱{formatNumberWithCommas(selectedEmployee.totalAmount)}
              </p>
            </div>
          )}

          {modalType === 'Delete' && selectedEmployee && (
            <div>
              <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#ff4d4f', marginBottom: 16, textAlign: 'center' }}>
                ⚠️ Select what to delete a loan record for {selectedEmployee.employeeName}:
              </p>
              <p style={{ textAlign: 'center', marginBottom: 16 }}>This action <strong>cannot be undone</strong>. The loan record assigned to employee "<strong>{selectedEmployee.employeeName}</strong>" will be permanently removed.</p>
              <Radio.Group
                onChange={(e) => setDeleteOption(e.target.value)}
                value={deleteOption}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <Radio value="all">Delete all loans</Radio>
                {selectedEmployee.loans.map((loan) => (
                  <Radio key={loan.loanId} value={loan.loanId}>
                    Delete {getLoanLabel(loan.key, loan.type)} (₱{formatNumberWithCommas(loan.amount)})
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default LoanTable;