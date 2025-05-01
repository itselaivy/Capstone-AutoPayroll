import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Typography, Pagination, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, DollarOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;
const { confirm } = Modal;

const CashAdvanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedCashAdvance, setSelectedCashAdvance] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState({});

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const DATE_FORMAT = 'MM/DD/YYYY';

  const fetchDropdownData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        message.error('Please log in to access this page');
        return;
      }

      const [branchesRes, employeesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_cashadvance.php?type=branches`).catch(err => {
          throw new Error(`Branches fetch failed: ${err.message}`);
        }),
        fetch(`${API_BASE_URL}/fetch_cashadvance.php?type=employees&user_id=${userId}&role=${role}`).catch(err => {
          throw new Error(`Employees fetch failed: ${err.message}`);
        }),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${role}`).catch(err => {
          throw new Error(`Assigned branches fetch failed: ${err.message}`);
        })
      ]);

      if (!branchesRes.ok) throw new Error(`Branches fetch failed: ${branchesRes.statusText}`);
      if (!employeesRes.ok) throw new Error(`Employees fetch failed: ${employeesRes.statusText}`);
      if (!assignedBranchesRes.ok) throw new Error(`Assigned branches fetch failed: ${assignedBranchesRes.statusText}`);

      const branchesData = await branchesRes.json();
      const employeesData = await employeesRes.json();
      const assignedBranchesData = await assignedBranchesRes.json();

      setBranches(branchesData.map(branch => ({
        ...branch,
        BranchID: String(branch.BranchID)
      })));
      setEmployees(employeesData.map(employee => ({
        ...employee,
        BranchID: String(employee.BranchID)
      })));
      setAssignedBranches((assignedBranchesData.data || []).map(branch => ({
        ...branch,
        BranchID: String(branch.BranchID)
      })));
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown options: ${err.message}`);
    }
  };

  const fetchData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        message.error('Please log in to view cash advances');
        return;
      }

      let url = `${API_BASE_URL}/fetch_cashadvance.php?user_id=${userId}&role=${role}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch) {
        url += `&branch_id=${selectedBranch}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Cash Advance fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch cash advances');

      const mappedData = response.data.map(cashAdvance => ({
        key: cashAdvance.CashAdvanceID,
        date: moment(cashAdvance.Date, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: cashAdvance.EmployeeID,
        employeeName: cashAdvance.EmployeeName,
        branchId: String(cashAdvance.BranchID),
        branch: cashAdvance.BranchName,
        amount: parseFloat(cashAdvance.Amount).toFixed(2),
        balance: parseFloat(cashAdvance.Balance || cashAdvance.Amount).toFixed(2),
      }));
      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(response.total);

      const paymentStatusUpdate = {};
      for (const record of mappedData) {
        const history = await fetchPaymentHistory(record.key, true);
        paymentStatusUpdate[record.key] = history.length > 0;
      }
      setPaymentStatus(paymentStatusUpdate);
    } catch (err) {
      console.error("Fetch Cash Advance Error:", err.message);
      message.error(`Failed to load cash advance data: ${err.message}`);
    }
  };

  const fetchPaymentHistory = async (cashAdvanceId, silent = false) => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        if (!silent) message.error('Please log in to view payment history');
        return [];
      }

      const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php?type=payment_history&cash_advance_id=${cashAdvanceId}&user_id=${userId}&role=${role}`);
      if (!res.ok) throw new Error(`Payment history fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (response.success) {
        if (!silent) setPaymentHistory(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch payment history');
      }
    } catch (err) {
      if (!silent) {
        console.error("Fetch Payment History Error:", err.message);
        message.error(`Failed to load payment history: ${err.message}`);
        setPaymentHistory([]);
      }
      return [];
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

    if (selectedBranch) {
      filtered = filtered.filter(item => item.branchId === selectedBranch);
    }

    if (lowerValue) {
      filtered = filtered.filter(item =>
        Object.values(item)
          .filter(val => typeof val === 'string' || typeof val === 'number')
          .map(val => val.toString().toLowerCase())
          .some(val => val.includes(lowerValue))
      );
    }

    setFilteredData(filtered);
    setFilteredPaginationTotal(filtered.length);
    setSearchText(value);
    setCurrentPage(1);
  };

  const handleBranchFilterChange = (value) => {
    setSelectedBranch(value || '');
    setCurrentPage(1);
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    const role = localStorage.getItem('role');
    if (employee && employee.BranchID) {
      const branch = branches.find(b => b.BranchID === employee.BranchID);
      if (!branch) {
        message.error('Branch information not found for this employee.');
        form.setFieldsValue({ employeeId: undefined });
        return;
      }
      if (role === 'Payroll Staff') {
        const isValidBranch = assignedBranches.some(ab => ab.BranchID === employee.BranchID);
        if (isValidBranch) {
          form.setFieldsValue({ employeeId });
        } else {
          message.error('Selected employee’s branch is not assigned to you.');
          form.setFieldsValue({ employeeId: undefined });
        }
      } else {
        form.setFieldsValue({ employeeId });
      }
    } else {
      message.error('Invalid employee or branch information.');
      form.setFieldsValue({ employeeId: undefined });
    }
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
    setSelectedCashAdvance(record);
    setIsModalOpen(true);

    if (record) {
      const employee = employees.find(emp => emp.EmployeeID === record.employeeId);
      form.setFieldsValue({
        date: moment(record.date, DATE_FORMAT),
        employeeId: record.employeeId,
        amount: record.amount,
        paymentAmount: undefined,
      });
      if (type === 'View') {
        fetchPaymentHistory(record.key);
      } else {
        setPaymentHistory([]);
      }
    } else {
      form.resetFields();
      form.setFieldsValue({ date: moment() });
      setPaymentHistory([]);
    }
  };

  const checkForDuplicate = async (date, employeeId, excludeId = null) => {
    try {
      const url = new URL(`${API_BASE_URL}/fetch_cashadvance.php`);
      url.searchParams.append('type', 'check_duplicate');
      url.searchParams.append('date', date);
      url.searchParams.append('employee_id', employeeId);
      if (excludeId !== null) {
        url.searchParams.append('exclude_id', excludeId);
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Duplicate check failed: ${res.statusText}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);
      return data.exists;
    } catch (err) {
      console.error("Duplicate Check Error:", err.message);
      message.error(`Failed to check for duplicates: ${err.message}`);
      return false;
    }
  };

  const handleOk = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      message.error('User not logged in');
      return;
    }

    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      try {
        const values = await form.validateFields();
        const date = values.date.format('YYYY-MM-DD');
        const employeeId = modalType === "Edit" ? selectedCashAdvance.employeeId : values.employeeId;
        const excludeId = modalType === "Edit" && selectedCashAdvance ? selectedCashAdvance.key : null;

        const isDuplicate = await checkForDuplicate(date, employeeId, excludeId);
        if (isDuplicate) {
          message.warning('Warning: An employee with this cash advance record already exists.');
          return;
        }

        let branchId;
        if (modalType === "Add") {
          const employee = employees.find(emp => emp.EmployeeID === employeeId);
          if (!employee || !employee.BranchID) {
            message.error('Selected employee has no valid branch information.');
            return;
          }
          const branch = branches.find(b => b.BranchID === employee.BranchID);
          if (!branch) {
            message.error('Branch information not found for this employee.');
            return;
          }
          const role = localStorage.getItem('role');
          if (role === 'Payroll Staff') {
            const isValidBranch = assignedBranches.some(ab => ab.BranchID === employee.BranchID);
            if (!isValidBranch) {
              message.error('Selected employee’s branch is not assigned to you.');
              return;
            }
          }
          branchId = employee.BranchID;
        } else {
          branchId = selectedCashAdvance.branchId;
        }

        if (modalType === "Edit") {
          const proceed = await new Promise((resolve) => {
            confirm({
              title: (
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 'bold' }}>
                  Confirm Changes
                </span>
              ),
              content: (
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '16px' }}>
                  Please confirm your changes. Once payments are made for this cash advance, you will no longer be able to edit its details.
                </span>
              ),
              okText: 'OK',
              cancelText: 'Cancel',
              okButtonProps: { 
                type: 'primary',
                style: { 
                  backgroundColor: '#1890ff', 
                  borderColor: '#1890ff', 
                  color: '#ffffff', 
                  fontFamily: 'Poppins, sans-serif' 
                } 
              },
              cancelButtonProps: { style: { fontFamily: 'Poppins, sans-serif' } },
              centered: true,
              width: 500,
              onOk() {
                resolve(true);
              },
              onCancel() {
                resolve(false);
              },
            });
          });

          if (!proceed) {
            return;
          }
        }

        const payload = {
          Date: date,
          EmployeeID: employeeId,
          BranchID: branchId,
          Amount: parseFloat(values.amount).toFixed(2),
          Balance: parseFloat(values.amount).toFixed(2),
          user_id: parseInt(userId),
        };

        if (modalType === "Edit" && selectedCashAdvance) {
          payload.CashAdvanceID = selectedCashAdvance.key;
        }

        const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
          method: modalType === "Add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        const data = await res.json();

        if (data.success) {
          message.success(`Cash Advance ${modalType === "Add" ? "added" : "updated"} successfully!`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else {
          throw new Error(data.error || "Operation failed");
        }
      } catch (err) {
        message.error(`Failed to ${modalType === "Add" ? "add" : "update"} cash advance: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
      }
    } else if (modalType === "Delete" && selectedCashAdvance) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ CashAdvanceID: selectedCashAdvance.key, user_id: parseInt(userId) }),
        });

        const data = await res.json();
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
    } else if (modalType === "Pay" && selectedCashAdvance) {
      try {
        const values = await form.validateFields();
        const paymentAmount = parseFloat(values.paymentAmount);
        const currentBalance = parseFloat(selectedCashAdvance.balance);
        
        if (paymentAmount > currentBalance) {
          message.error('Payment amount cannot exceed current balance!');
          return;
        }

        const newBalance = (currentBalance - paymentAmount).toFixed(2);

        const payload = {
          CashAdvanceID: selectedCashAdvance.key,
          Balance: newBalance,
          user_id: parseInt(userId),
          PaymentAmount: paymentAmount
        };

        const res = await fetch(`${API_BASE_URL}/fetch_cashadvance.php`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        const data = await res.json();

        if (data.success) {
          message.success(`Payment of ₱${formatNumberWithCommas(paymentAmount)} recorded successfully!`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else {
          throw new Error(data.error || "Payment operation failed");
        }
      } catch (err) {
        message.error(`Failed to record payment: ${err.message || 'Please ensure the payment amount is valid.'}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setPaymentHistory([]);
  };

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const showLabels = screenWidth >= 600;
  const role = localStorage.getItem('role');

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Cash Advances
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select
          placeholder="Filter by Branch"
          value={selectedBranch}
          onChange={handleBranchFilterChange}
          allowClear
          style={{ width: screenWidth < 480 ? '100%' : '250px', fontFamily: 'Poppins, sans-serif' }}
        >
          <Option value="" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {(role === 'Payroll Staff' ? assignedBranches : branches).map(branch => (
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
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Cash Advance</span>}
          </Button>
          <Input
            placeholder="Search by any field (e.g., name, date, branch)"
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date</span>} 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT))}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>} 
          dataIndex="employeeId" 
          key="employeeId" 
          sorter={(a, b) => a.employeeId - b.employeeId}
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount</span>} 
          dataIndex="amount" 
          key="amount" 
          sorter={(a, b) => a.amount - b.amount}
          render={(amount) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(amount)}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Balance</span>} 
          dataIndex="balance" 
          key="balance" 
          sorter={(a, b) => a.balance - b.balance}
          render={(balance) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(balance)}</span>}
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
              <Tooltip
                title={record.balance === "0.00" ? 'This cash advance is fully paid and cannot be paid further.' : ''}
              >
                <Button 
                  icon={<DollarOutlined />} 
                  size="middle" 
                  style={{ backgroundColor: '#1890ff', borderColor: '#1890ff', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                  onClick={() => openModal('Pay', record)}
                  disabled={record.balance === "0.00"}
                >
                  {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Pay</span>}
                </Button>
              </Tooltip>
              <Tooltip
                title={paymentStatus[record.key] ? 'This cash advance cannot be edited because payments have already been made.' : ''}
              >
                <Button 
                  icon={<EditOutlined />} 
                  size="middle" 
                  style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                  onClick={() => openModal('Edit', record)}
                  disabled={paymentStatus[record.key]}
                >
                  {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Edit</span>}
                </Button>
              </Tooltip>
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
        total={searchText.trim() ? filteredPaginationTotal : paginationTotal}
        onChange={handlePageChange}
        onShowSizeChange={handlePageChange}
        showSizeChanger
        showQuickJumper
        showTotal={(total) => `Total ${total} cash advance records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Cash Advance' : 
               modalType === 'Edit' ? 'Edit Cash Advance Details' : 
               modalType === 'View' ? 'View Cash Advance Information' : 
               modalType === 'Pay' ? 'Pay Cash Advance' :
               'Confirm Cash Advance Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : modalType === 'Pay' ? 'Pay' : 'OK'}
        okButtonProps={{ 
          danger: modalType === 'Delete', 
          style: { fontFamily: 'Poppins, sans-serif' }
        }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
      >
        {(modalType === 'Add') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>} 
              name="date" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker 
                format={DATE_FORMAT} 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee<span style={{ color: 'red' }}>*</span></span>} 
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
                {(role === 'Payroll Staff' ? 
                  employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID)) : 
                  employees).map((employee) => (
                    <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {employee.EmployeeName}
                    </Option>
                  ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="amount" 
              rules={[
                { required: true, message: 'Please enter the amount!' },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(new Error('Amount cannot be negative!')) }
              ]}
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

        {(modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>} 
              name="date" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker 
                format={DATE_FORMAT} 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="amount" 
              rules={[
                { required: true, message: 'Please enter the amount!' },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(new Error('Amount cannot be negative!')) }
              ]}
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

        {(modalType === 'Pay') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Current Balance</span>}
            >
              <Input 
                value={`₱${formatNumberWithCommas(selectedCashAdvance?.balance)}`} 
                disabled 
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Payment Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="paymentAmount" 
              rules={[
                { required: true, message: 'Please enter the payment amount!' },
                { validator: (_, value) => value > 0 ? Promise.resolve() : Promise.reject(new Error('Payment amount must be greater than zero!')) }
              ]}
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

        {modalType === 'View' && selectedCashAdvance && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date:</strong> {selectedCashAdvance.date}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name:</strong> {selectedCashAdvance.employeeName}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedCashAdvance.branch}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Amount:</strong> ₱{formatNumberWithCommas(selectedCashAdvance.amount)}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Balance:</strong> ₱{formatNumberWithCommas(selectedCashAdvance.balance)}
            </p>
            <div style={{ marginTop: '20px' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Payment History:</strong>
              {paymentHistory.length > 0 ? (
                <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px' }}>
                  {paymentHistory.map((payment, index) => (
                    <li key={index} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '8px' }}>
                      <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date:</strong> {payment.date} | <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Amount:</strong> ₱{formatNumberWithCommas(selectedCashAdvance.amount)} | <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Paid:</strong> ₱{formatNumberWithCommas(payment.amount)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontFamily: 'Poppins, sans-serif', color: '#000' }}>No payments recorded.</p>
              )}
            </div>
          </div>
        )}

        {modalType === 'Delete' && selectedCashAdvance && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this cash advance record?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The cash advance record for "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedCashAdvance.employeeName}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CashAdvanceTable;