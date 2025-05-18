import { useState, useEffect } from 'react';
import { ConfigProvider, Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Typography, Pagination, Tag, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const LeaveTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [dateRange, setDateRange] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState('');

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
        fetch(`${API_BASE_URL}/fetch_leavetype.php?type=branches`).catch(err => {
          throw new Error(`Branches fetch failed: ${err.message}`);
        }),
        fetch(`${API_BASE_URL}/fetch_leavetype.php?type=employees&user_id=${userId}&role=${role}`).catch(err => {
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
        message.error('Please log in to view leave records');
        return;
      }

      let url = `${API_BASE_URL}/fetch_leavetype.php?user_id=${userId}&role=${role}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch) {
        url += `&branch_id=${selectedBranch}`;
      }
      if (dateRange[0] && dateRange[1]) {
        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');
        url += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Leave fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch leave records');

      const mappedData = response.data.map(leave => ({
        key: leave.LeaveID,
        startDate: moment(leave.StartDate, 'YYYY-MM-DD').format(DATE_FORMAT),
        endDate: moment(leave.EndDate, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: leave.EmployeeID,
        employeeName: leave.EmployeeName,
        branchId: String(leave.BranchID),
        branch: leave.BranchName,
        leaveType: leave.LeaveType,
        leaveCredits: leave.LeaveCredits !== null ? leave.LeaveCredits : 'N/A',
        availableLeaveCredits: leave.AvailableLeaveCredits !== null ? leave.AvailableLeaveCredits : 'N/A',
        usedLeaveCredits: leave.UsedLeaveCredits !== null ? leave.UsedLeaveCredits : 'N/A',
      }));
      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Leave Error:", err.message);
      message.error(`Failed to load leave data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch, dateRange]);

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
    setSelectedLeave(record);
    setIsModalOpen(true);

    if (record) {
      form.setFieldsValue({
        startDate: moment(record.startDate, DATE_FORMAT),
        endDate: moment(record.endDate, DATE_FORMAT),
        employeeId: record.employeeId,
        leaveType: record.leaveType,
      });
    } else {
      form.resetFields();
      if (type === 'Add') {
        form.setFieldsValue({ startDate: undefined, endDate: undefined });
      }
    }
  };

  const checkForDuplicate = async (startDate, endDate, employeeId, excludeId = null) => {
    try {
      const url = new URL(`${API_BASE_URL}/fetch_leavetype.php`);
      url.searchParams.append('type', 'check_duplicate');
      url.searchParams.append('start_date', startDate);
      url.searchParams.append('end_date', endDate);
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
        const startDate = values.startDate.format('YYYY-MM-DD');
        const endDate = values.endDate.format('YYYY-MM-DD');
        const employeeId = modalType === "Edit" ? selectedLeave.employeeId : values.employeeId;
        const excludeId = modalType === "Edit" && selectedLeave ? selectedLeave.key : null;

        const isDuplicate = await checkForDuplicate(startDate, endDate, employeeId, excludeId);
        if (isDuplicate) {
          message.warning('Warning: An employee with this leave record already exists.');
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
          branchId = selectedLeave.branchId;
        }

        const payload = {
          StartDate: startDate,
          EndDate: endDate,
          EmployeeID: employeeId,
          BranchID: branchId,
          LeaveType: values.leaveType,
          user_id: parseInt(userId),
        };

        if (modalType === "Edit" && selectedLeave) {
          payload.LeaveID = selectedLeave.key;
        }

        const res = await fetch(`${API_BASE_URL}/fetch_leavetype.php`, {
          method: modalType === "Add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        const data = await res.json();

        if (data.success) {
          message.success(`Leave record ${modalType === "Add" ? "added" : "updated"} successfully!`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else if (data.warning) {
          message.warning(data.warning);
          return;
        } else {
          throw new Error(data.error || "Operation failed");
        }
      } catch (err) {
        message.error(`Failed to ${modalType === "Add" ? "add" : "update"} leave record: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
      }
    } else if (modalType === "Delete" && selectedLeave) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_leavetype.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ LeaveID: selectedLeave.key, user_id: parseInt(userId) }),
        });

        const data = await res.json();
        if (data.success) {
          message.success("Leave record deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete leave record: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const showLabels = screenWidth >= 600;
  const role = localStorage.getItem('role');

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
          `}
        </style>
        <Title level={2} style={{ marginBottom: '20px' }}>
          Leave Records
        </Title>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <DatePicker.RangePicker
              format={DATE_FORMAT}
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates || []);
                setCurrentPage(1);
              }}
              style={{ width: screenWidth < 480 ? '100%' : '250px' }}
            />
            <Select
              placeholder="Filter by Branch"
              value={selectedBranch}
              onChange={handleBranchFilterChange}
              allowClear
              style={{ width: screenWidth < 480 ? '100%' : '250px' }}
            >
              <Option value="">All Branches</Option>
              {(role === 'Payroll Staff' ? assignedBranches : branches).map(branch => (
                <Option key={branch.BranchID} value={branch.BranchID}>
                  {branch.BranchName}
                </Option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button 
              icon={<PlusOutlined />} 
              size="middle" 
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }} 
              onClick={() => openModal('Add')}
            >
              {showLabels && 'Add Leave Record'}
            </Button>
            <Input
              placeholder="Search by any field (e.g., name, date, branch)"
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
            title="Start Date" 
            dataIndex="startDate" 
            key="startDate" 
            sorter={(a, b) => moment(a.startDate, DATE_FORMAT).diff(moment(b.startDate, DATE_FORMAT))}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="End Date" 
            dataIndex="endDate" 
            key="endDate" 
            sorter={(a, b) => moment(a.endDate, DATE_FORMAT).diff(moment(b.endDate, DATE_FORMAT))}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Employee ID" 
            dataIndex="employeeId" 
            key="employeeId" 
            sorter={(a, b) => a.employeeId - b.employeeId}
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
            dataIndex="branch" 
            key="branch" 
            sorter={(a, b) => a.branch.localeCompare(b.branch)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Leave Type" 
            dataIndex="leaveType" 
            key="leaveType" 
            sorter={(a, b) => a.leaveType.localeCompare(b.leaveType)}
            render={(text) => (
              <Tag color={text === 'Vacation Leave' ? 'green' : 'volcano'} style={{ fontWeight: 'bold' }}>
                {text.toUpperCase()}
              </Tag>
            )}
          />
          <Column 
            title="Leave Credits" 
            dataIndex="leaveCredits" 
            key="leaveCredits" 
            sorter={(a, b) => (a.leaveCredits === 'N/A' ? 0 : a.leaveCredits) - (b.leaveCredits === 'N/A' ? 0 : b.leaveCredits)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Available Credits" 
            dataIndex="availableLeaveCredits" 
            key="availableLeaveCredits" 
            sorter={(a, b) => (a.availableLeaveCredits === 'N/A' ? 0 : a.availableLeaveCredits) - (b.availableLeaveCredits === 'N/A' ? 0 : b.availableLeaveCredits)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Used Credits" 
            dataIndex="usedLeaveCredits" 
            key="usedLeaveCredits" 
            sorter={(a, b) => (a.usedLeaveCredits === 'N/A' ? 0 : a.usedLeaveCredits) - (b.usedLeaveCredits === 'N/A' ? 0 : b.usedLeaveCredits)}
            render={(text) => <span>{text}</span>}
          />
          <Column
            title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
            key="action"
            render={(_, record) => (
              <Space size={7} wrap>
                <Tooltip title="View">
                  <Button
                    icon={<EyeOutlined />}
                    size="middle"
                    style={{
                      width: '33px',
                      backgroundColor: '#52c41a',
                      borderColor: '#52c41a',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('View', record)}
                  />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button
                    icon={<EditOutlined />}
                    size="middle"
                    style={{
                      width: '33px',
                      backgroundColor: '#722ed1',
                      borderColor: '#722ed1',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('Edit', record)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    icon={<DeleteOutlined />}
                    size="middle"
                    style={{
                      width: '33px',
                      backgroundColor: '#ff4d4f',
                      borderColor: '#ff4d4f',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
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
          total={searchText.trim() ? filteredPaginationTotal : paginationTotal}
          onChange={handlePageChange}
          onShowSizeChange={handlePageChange}
          showSizeChanger
          showQuickJumper
          showTotal={(total) => `Total ${total} leave records`}
          pageSizeOptions={['10', '20', '50', '100']}
          style={{ marginTop: 16, justifyContent: 'center', textAlign: 'center' }}
        />

        <Modal
          title={
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
                {modalType === 'Add' ? 'Add New Leave Record' : 
                 modalType === 'Edit' ? 'Edit Leave Record Details' : 
                 modalType === 'View' ? 'View Leave Record Information' : 
                 'Confirm Leave Record Deletion'}
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
          {(modalType === 'Add') && (
            <Form form={form} layout="vertical">
              <Form.Item 
                label={<span>Start Date<span style={{ color: 'red' }}>*</span></span>} 
                name="startDate" 
                rules={[{ required: true, message: 'Please select a start date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>End Date<span style={{ color: 'red' }}>*</span></span>} 
                name="endDate" 
                rules={[{ required: true, message: 'Please select an end date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>Employee<span style={{ color: 'red' }}>*</span></span>} 
                name="employeeId" 
                rules={[{ required: true, message: 'Please select an employee!' }]}
              >
                <Select
                  showSearch
                  placeholder="Type or select an employee"
                  optionFilterProp="children"
                  onChange={handleEmployeeChange}
                  filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                >
                  {(role === 'Payroll Staff' ? 
                    employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID)).filter(emp => {
                      const memberSince = moment(emp.MemberSince, 'YYYY-MM-DD');
                      const currentDate = moment('2025-05-01');
                      return currentDate.diff(memberSince, 'years') >= 1;
                    }) : 
                    employees).map((employee) => (
                      <Option key={employee.EmployeeID} value={employee.EmployeeID}>
                        {employee.EmployeeName}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label={<span>Leave Type<span style={{ color: 'red' }}>*</span></span>} 
                name="leaveType" 
                rules={[{ required: true, message: 'Please select a leave type!' }]}
              >
                <Select>
                  <Option value="Vacation Leave">Vacation Leave</Option>
                  <Option value="Sick Leave">Sick Leave</Option>
                </Select>
              </Form.Item>
            </Form>
          )}

          {(modalType === 'Edit') && (
            <Form form={form} layout="vertical">
              <Form.Item 
                label={<span>Start Date<span style={{ color: 'red' }}>*</span></span>} 
                name="startDate" 
                rules={[{ required: true, message: 'Please select a start date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>End Date<span style={{ color: 'red' }}>*</span></span>} 
                name="endDate" 
                rules={[{ required: true, message: 'Please select an end date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>Leave Type<span style={{ color: 'red' }}>*</span></span>} 
                name="leaveType" 
                rules={[{ required: true, message: 'Please select a leave type!' }]}
              >
                <Select>
                  <Option value="Vacation Leave">Vacation Leave</Option>
                  <Option value="Sick Leave">Sick Leave</Option>
                </Select>
              </Form.Item>
            </Form>
          )}

          {modalType === 'View' && selectedLeave && (
            <div>
              <p>
                <strong>Start Date:</strong> {selectedLeave.startDate}
              </p>
              <p>
                <strong>End Date:</strong> {selectedLeave.endDate}
              </p>
              <p>
                <strong>Employee Name:</strong> {selectedLeave.employeeName}
              </p>
              <p>
                <strong>Branch:</strong> {selectedLeave.branch}
              </p>
              <p>
                <strong>Leave Type:</strong> {selectedLeave.leaveType}
              </p>
              <p>
                <strong>Leave Credits:</strong> {selectedLeave.leaveCredits}
              </p>
              <p>
                <strong>Available Leave Credits:</strong> {selectedLeave.availableLeaveCredits}
              </p>
              <p>
                <strong>Used Leave Credits:</strong> {selectedLeave.usedLeaveCredits}
              </p>
            </div>
          )}

          {modalType === 'Delete' && selectedLeave && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                ⚠️ Are you sure you want to delete this leave record?
              </p>
              <p>
                This action <strong>cannot be undone</strong>. The leave record for "<strong>{selectedLeave.employeeName}</strong>" will be permanently removed.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default LeaveTable;