import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Select, Typography, Pagination, DatePicker, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';
import './UserTable.css';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const EmployeesTable = () => {
    const [searchText, setSearchText] = useState('');
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [screenWidth, setScreenWidth] = useState(window.innerWidth);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [form] = Form.useForm();
    const [branches, setBranches] = useState([]);
    const [positions, setPositions] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [assignedBranches, setAssignedBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [paginationTotal, setPaginationTotal] = useState(0);
    const [allowances, setAllowances] = useState([]);
    const [deductions, setDeductions] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [ratePerHour, setRatePerHour] = useState(null);
    const [cashAdvances, setCashAdvances] = useState([]);

    const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role');

    const formatDateToMMDDYYYY = (dateString) => {
        if (!dateString) return 'N/A';
        const [year, month, day] = dateString.split('-');
        return `${month}/${day.padStart(2, '0')}/${year}`;
    };

    const formatMoney = (amount) => {
        return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const calculateBalance = (amount, paymentHistory) => {
        const totalPaid = paymentHistory.reduce((sum, payment) => sum + parseFloat(payment.paid || 0), 0);
        return (parseFloat(amount) - totalPaid).toFixed(2);
    };

    const fetchDropdownData = async () => {
        setLoading(true);
        try {
            if (!userId || isNaN(parseInt(userId)) || !role || role.trim() === '') {
                throw new Error('Missing or invalid userId or role. Please log in again.');
            }

            const fetchBranches = async () => {
                try {
                    let url;
                    if (role === 'Payroll Staff') {
                        url = `${API_BASE_URL}/fetch_branches.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
                    } else {
                        url = `${API_BASE_URL}/fetch_employees.php?type=branches&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
                    }
                    const res = await fetch(url);
                    if (!res.ok) {
                        throw new Error(`Failed to fetch branches: ${res.status}`);
                    }
                    const response = await res.json();

                    console.log("Fetch Branches Response:", response);

                    if (role === 'Payroll Staff' && !response.success) {
                        throw new Error(response.error || 'Failed to fetch assigned branches');
                    }

                    const branchesData = role === 'Payroll Staff' ? response.data : response;
                    if (!Array.isArray(branchesData)) {
                        throw new Error('Invalid response format for branches');
                    }

                    const mappedBranches = branchesData.map(branch => ({
                        BranchID: Number(branch.BranchID),
                        BranchName: branch.BranchName
                    }));

                    console.log("Mapped Branches:", mappedBranches);
                    setBranches(mappedBranches);
                    setAssignedBranches(mappedBranches);
                } catch (err) {
                    console.error("Fetch Branches Error:", err.message);
                    setBranches([]);
                    setAssignedBranches([]);
                    throw err;
                }
            };

            const fetchPositions = async () => {
                try {
                    const url = `${API_BASE_URL}/fetch_employees.php?type=positions&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
                    const res = await fetch(url);
                    if (!res.ok) {
                        throw new Error(`Failed to fetch positions: ${res.status}`);
                    }
                    const response = await res.json();

                    console.log("Fetch Positions Response:", response);

                    if (!Array.isArray(response)) {
                        throw new Error('Invalid response format for positions');
                    }

                    setPositions(response);
                } catch (err) {
                    console.error("Fetch Positions Error:", err.message);
                    setPositions([]);
                    throw err;
                }
            };

            const fetchSchedules = async () => {
                try {
                    const url = `${API_BASE_URL}/fetch_employees.php?type=schedules&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
                    const res = await fetch(url);
                    if (!res.ok) {
                        throw new Error(`Failed to fetch schedules: ${res.status}`);
                    }
                    const response = await res.json();

                    console.log("Fetch Schedules Response:", response);

                    if (!Array.isArray(response)) {
                        throw new Error('Invalid response format for schedules');
                    }

                    setSchedules(response);
                } catch (err) {
                    console.error("Fetch Schedules Error:", err.message);
                    setSchedules([]);
                    throw err;
                }
            };

            await Promise.all([fetchBranches(), fetchPositions(), fetchSchedules()]);
            await fetchData();
        } catch (err) {
            console.error("Fetch Dropdown Error:", err.message);
            message.error(`Failed to load dropdown options: ${err.message}`);
            setBranches([]);
            setPositions([]);
            setSchedules([]);
            setAssignedBranches([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            if (!userId || isNaN(parseInt(userId)) || !role || role.trim() === '') {
                message.error('Please log in to view employees');
                return;
            }

            let url = `${API_BASE_URL}/fetch_employees.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
            
            if (searchText) {
                url += `&search=${encodeURIComponent(searchText)}`;
            }
            
            if (selectedBranch) {
                url += `&branch=${encodeURIComponent(selectedBranch)}`;
            }
            
            if (selectedPosition) {
                url += `&position=${encodeURIComponent(selectedPosition)}`;
            }

            console.log('Fetching URL:', url);
            const res = await fetch(url);
            
            if (!res.ok) {
                throw new Error(`Employees fetch failed: ${res.statusText}`);
            }
            
            const response = await res.json();
            console.log("Fetch Employees Response:", response);

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch employees');
            }

            const mappedData = response.employees.map(employee => ({
                key: employee.key,
                "Employee ID": employee.key,
                "Employee Name": employee.EmployeeName,
                "Branch Name": employee.BranchName,
                "Position Title": employee.PositionTitle,
                "Schedule": employee.Schedule,
                "Member Since": formatDateToMMDDYYYY(employee.MemberSince),
                BranchID: Number(employee.BranchID),
                PositionID: Number(employee.PositionID),
                ScheduleID: Number(employee.ScheduleID),
                EmployeeName: employee.EmployeeName,
                MemberSince: employee.MemberSince
            }));

            console.log("Mapped Data:", mappedData);
            
            setData(mappedData);
            setFilteredData(mappedData);
            setPaginationTotal(response.total || 0);
        } catch (err) {
            console.error("Fetch Employees Error:", err.message);
            message.error(`Failed to load employee data: ${err.message}`);
            setData([]);
            setFilteredData([]);
            setPaginationTotal(0);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployeeDetails = async (employeeId) => {
        setLoading(true);
        try {
            const url = `${API_BASE_URL}/fetch_employees.php?type=employee_details&employee_id=${employeeId}&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error("Failed to fetch employee details");
            }
            const response = await res.json();

            console.log("Employee Details Response:", response);

            if (!response.success) {
                throw new Error(response.error || "Failed to fetch data");
            }
            setAllowances(response.allowances || []);
            setDeductions(response.deductions || []);
            setPaymentHistory(response.payment_history || []);
            setRatePerHour(response.rate_per_hour || null);
            setCashAdvances(response.cash_advances || []);
        } catch (err) {
            console.error("Fetch Employee Details Error:", err.message);
            message.error("Failed to load employee details.");
            setAllowances([]);
            setDeductions([]);
            setPaymentHistory([]);
            setRatePerHour(null);
            setCashAdvances([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDropdownData();
    }, []);

    useEffect(() => {
        fetchData();
    }, [currentPage, pageSize, selectedBranch, selectedPosition, searchText]);

    useEffect(() => {
        const handleResize = () => setScreenWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSearch = (value) => {
        const sanitizedValue = value.replace(/[<>]/g, '');
        setSearchText(sanitizedValue);
        setCurrentPage(1);
    };

    const handleBranchChange = (value) => {
        setSelectedBranch(value === 'all' ? null : Number(value));
        setCurrentPage(1);
    };

    const handlePositionChange = (value) => {
        setSelectedPosition(value === 'all' ? null : Number(value));
        setCurrentPage(1);
    };

    const handlePaginationChange = (page, newPageSize) => {
        setCurrentPage(page);
        if (newPageSize !== pageSize) {
            setPageSize(newPageSize);
            setCurrentPage(1);
        }
    };

    const openModal = (type, record = null) => {
        setModalType(type);
        setSelectedEmployee(record);
        setIsModalOpen(true);

        if (type === 'Edit' && record) {
            form.setFieldsValue({
                EmployeeName: record["Employee Name"],
                BranchID: String(record.BranchID),
                PositionID: String(record.PositionID),
                ScheduleID: String(record.ScheduleID),
                MemberSince: record["Member Since"] ? moment(record["Member Since"], 'MM/DD/YYYY') : null
            });
        } else if (type === 'Add') {
            form.resetFields();
        } else if (type === 'View' && record) {
            fetchEmployeeDetails(record.key);
        }
    };

    const handleOk = async () => {
        if (modalType === "View") {
            handleCancel();
            return;
        }

        try {
            console.log("Local Storage:", { userId, role });

            if (!userId || isNaN(parseInt(userId)) || !role || role.trim() === '') {
                throw new Error("Invalid or missing user ID or role. Please log in again.");
            }

            if (modalType === "Add" || modalType === "Edit") {
                await form.validateFields();
                const values = form.getFieldsValue();
                console.log("Form Values:", values);

                if (!values.EmployeeName || !values.BranchID || !values.PositionID || !values.ScheduleID || !values.MemberSince) {
                    throw new Error("All fields are required");
                }

                if (role === 'Payroll Staff') {
                    const isAuthorizedBranch = assignedBranches.some(ab => String(ab.BranchID) === values.BranchID);
                    if (!isAuthorizedBranch) {
                        throw new Error("You are not authorized to add/edit employees for this branch");
                    }
                }

                const memberSinceFormatted = values.MemberSince ? values.MemberSince.format('YYYY-MM-DD') : null;

                const payload = {
                    EmployeeName: values.EmployeeName,
                    BranchID: parseInt(values.BranchID),
                    PositionID: parseInt(values.PositionID),
                    ScheduleID: parseInt(values.ScheduleID),
                    MemberSince: memberSinceFormatted,
                    role: role
                };

                if (modalType === "Edit" && selectedEmployee) {
                    payload.EmployeeID = parseInt(selectedEmployee.key);
                }

                console.log("Sending Request:", { 
                    url: `${API_BASE_URL}/fetch_employees.php?user_id=${encodeURIComponent(userId)}`, 
                    method: modalType === "Add" ? "POST" : "PUT", 
                    payload 
                });

                const res = await fetch(`${API_BASE_URL}/fetch_employees.php?user_id=${encodeURIComponent(userId)}`, {
                    method: modalType === "Add" ? "POST" : "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const result = await res.json();
                console.log("Server Response:", result);

                if (!res.ok) {
                    throw new Error(result.error || `Server error: ${res.status}`);
                }

                if (result.success) {
                    message.success(`Employee ${modalType === "Add" ? "added" : "updated"} successfully!`);
                    setIsModalOpen(false);
                    form.resetFields();
                    fetchData();
                } else if (result.warning) {
                    message.warning(result.warning);
                } else {
                    throw new Error(result.error || "Operation failed");
                }
            } else if (modalType === "Delete" && selectedEmployee) {
                if (!selectedEmployee.key) {
                    throw new Error("No employee selected for deletion");
                }

                if (role === 'Payroll Staff') {
                    const isAuthorizedBranch = assignedBranches.some(ab => Number(ab.BranchID) === selectedEmployee.BranchID);
                    if (!isAuthorizedBranch) {
                        throw new Error("You are not authorized to delete employees from this branch");
                    }
                }

                const payload = { EmployeeID: selectedEmployee.key };

                console.log("Sending Delete Request:", { 
                    url: `${API_BASE_URL}/fetch_employees.php?user_id=${encodeURIComponent(userId)}`, 
                    payload 
                });

                const res = await fetch(`${API_BASE_URL}/fetch_employees.php?user_id=${encodeURIComponent(userId)}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const result = await res.json();
                console.log("Delete Response:", result);

                if (!res.ok) {
                    throw new Error(result.error || `Failed to delete employee: ${res.status}`);
                }

                if (result.success) {
                    message.success("Employee deleted successfully!");
                    setIsModalOpen(false);
                    fetchData();
                } else {
                    throw new Error(result.error || "Failed to delete employee");
                }
            }
        } catch (error) {
            console.error("Handle OK Error:", error);
            message.error(`Failed to process employee: ${error.message}`);
        }
    };

    const handleCancel = () => {
        setIsModalOpen(false);
        form.resetFields();
        setPaymentHistory([]);
        setRatePerHour(null);
        setCashAdvances([]);
    };

    const showLabels = screenWidth >= 600;
    const branchOptions = role === 'Payroll Staff' ? assignedBranches : branches;

    return (
        <div className="fade-in" style={{ padding: '20px' }}>
            <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
                Employees
            </Title>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <Select
                        value={selectedBranch ? branchOptions.find(b => String(b.BranchID) === String(selectedBranch))?.BranchName : 'all'}
                        onChange={(value) => setSelectedBranch(value === 'all' ? null : Number(value))}
                        style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
                        placeholder="Select a Branch"
                        loading={loading}
                        disabled={loading}
                        showSearch={false}
                        optionFilterProp="children"
                        filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                    >
                        <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
                        {branchOptions.map(branch => (
                            <Option key={branch.BranchID} value={String(branch.BranchID)} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {branch.BranchName}
                            </Option>
                        ))}
                    </Select>
                    <Select
                        value={selectedPosition ? positions.find(p => String(p.PositionID) === String(selectedPosition))?.PositionTitle : 'all'}
                        onChange={(value) => setSelectedPosition(value === 'all' ? null : Number(value))}
                        style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
                        placeholder="Select a Position"
                        loading={loading}
                        disabled={loading}
                        showSearch={false}
                        optionFilterProp="children"
                        filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                    >
                        <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Positions</Option>
                        {positions.map(position => (
                            <Option key={position.PositionID} value={String(position.PositionID)} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {position.PositionTitle}
                            </Option>
                        ))}
                    </Select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <Button
                        icon={<PlusOutlined />}
                        size="middle"
                        style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                        onClick={() => openModal('Add')}
                        disabled={loading}
                    >
                        {showLabels && 'Add Employee'}
                    </Button>
                    <Input
                        placeholder="Search..."
                        allowClear
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        prefix={<SearchOutlined />}
                        style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
                        disabled={loading}
                    />
                </div>
            </div>

            <Table 
                dataSource={filteredData}
                bordered
                scroll={{ x: true }}
                pagination={false}
                style={{ fontFamily: 'Poppins, sans-serif' }}
                loading={loading}
                locale={{ emptyText: <span style={{ fontFamily: 'Poppins, sans-serif' }}>No employees found</span> }}
            >
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>}
                    dataIndex="Employee ID" 
                    key="Employee ID" 
                    sorter={(a, b) => a["Employee ID"] - b["Employee ID"]}
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name</span>}
                    dataIndex="Employee Name" 
                    key="Employee Name" 
                    sorter={(a, b) => a["Employee Name"].localeCompare(b["Employee Name"])}
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>}
                    dataIndex="Branch Name" 
                    key="Branch Name" 
                    sorter={(a, b) => a["Branch Name"].localeCompare(b["Branch Name"])}
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Company Position</span>} 
                    dataIndex="Position Title" 
                    key="Position Title" 
                    sorter={(a, b) => a["Position Title"].localeCompare(b["Position Title"])}
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Schedule</span>}
                    dataIndex="Schedule" 
                    key="Schedule" 
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column 
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Member Since</span>} 
                    dataIndex="Member Since" 
                    key="Member Since" 
                    sorter={(a, b) => {
                        const [aMonth, aDay, aYear] = a["Member Since"].split('/');
                        const [bMonth, bDay, bYear] = b["Member Since"].split('/');
                        return new Date(`${aYear}-${aMonth}-${aDay}`) - new Date(`${bYear}-${bMonth}-${bDay}`);
                    }}
                    render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
                />
                <Column
                    title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
                    key="action"
                    render={(_, record) => (
                        <Space size="middle">
                            <Button
                                icon={<EyeOutlined />}
                                size="small"
                                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                                onClick={() => openModal('View', record)}
                                disabled={loading}
                            >
                                View
                            </Button>
                            <Button
                                icon={<EditOutlined />}
                                size="small"
                                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                                onClick={() => openModal('Edit', record)}
                                disabled={loading}
                            >
                                Edit
                            </Button>
                            <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                                onClick={() => openModal('Delete', record)}
                                disabled={loading}
                            >
                                Delete
                            </Button>
                        </Space>
                    )}
                />
            </Table>

            <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'Poppins, sans-serif' }}>
                <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={paginationTotal}
                    onChange={handlePaginationChange}
                    onShowSizeChange={handlePaginationChange}
                    showSizeChanger
                    showQuickJumper={{ goButton: false }}
                    showTotal={(total) => `Total ${total} employee records`}
                    pageSizeOptions={['10', '20', '50', '100']}
                    style={{ fontFamily: 'Poppins, sans-serif', justifyContent: 'center' }}
                    disabled={loading}
                />
            </div>

            <Modal 
                title={
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
                            {modalType === 'Add' ? 'Add New Employee' :
                             modalType === 'Edit' ? 'Edit Employee Details' :
                             modalType === 'View' ? 'View Employee Information' :
                             'Confirm Employee Deletion'}
                        </span>
                    </div>
                }
                open={isModalOpen}
                onOk={modalType === 'View' ? handleCancel : handleOk}
                onCancel={handleCancel}
                okText={modalType === 'Delete' ? 'Delete' : 'OK'}
                okButtonProps={{ danger: modalType === 'Delete', style: { fontFamily: 'Poppins, sans-serif' }, disabled: loading }}
                cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' }, disabled: loading }}
                width={600}
                centered
                styles={{ body: { minHeight: '100px', padding: '20px', margin: 20, fontFamily: 'Poppins, sans-serif' } }}
            >
                {(modalType === 'Add' || modalType === 'Edit') && (
                    <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        <Form.Item 
                            label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name<span style={{ color: 'red' }}>*</span></span>} 
                            name="EmployeeName" 
                            rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter Employee Name!</span> }]}
                        >
                            <Input placeholder="Enter Employee Name" style={{ fontFamily: 'Poppins, sans-serif' }} disabled={loading} />
                        </Form.Item>
                        <Form.Item 
                            label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch<span style={{ color: 'red' }}>*</span></span>}
                            name="BranchID" 
                            rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a Branch!</span> }]}
                        >
                            <Select 
                                placeholder="Select Branch" 
                                style={{ fontFamily: 'Poppins, sans-serif' }}
                                loading={loading}
                                showSearch
                                optionFilterProp="children"
                                disabled={loading}
                            >
                                {branchOptions.map((branch) => (
                                    <Option key={branch.BranchID} value={String(branch.BranchID)} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                        {branch.BranchName}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item 
                            label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Company Position<span style={{ color: 'red' }}>*</span></span>}
                            name="PositionID" 
                            rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a company position!</span> }]}
                        >
                            <Select 
                                placeholder="Select Position" 
                                style={{ fontFamily: 'Poppins, sans-serif' }}
                                loading={loading}
                                showSearch
                                optionFilterProp="children"
                                disabled={loading}
                            >
                                {positions.map((position) => (
                                    <Option key={position.PositionID} value={String(position.PositionID)} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                        {position.PositionTitle}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item 
                            label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Schedule<span style={{ color: 'red' }}>*</span></span>} 
                            name="ScheduleID" 
                            rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a company schedule!</span> }]}
                        >
                            <Select 
                                placeholder="Select Schedule" 
                                style={{ fontFamily: 'Poppins, sans-serif' }}
                                loading={loading}
                                showSearch
                                optionFilterProp="children"
                                disabled={loading}
                            >
                                {schedules.map((schedule) => (
                                    <Option key={schedule.ScheduleID} value={String(schedule.ScheduleID)} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                        {`${schedule.ShiftStart} - ${schedule.ShiftEnd}`}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item 
                            label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Member Since<span style={{ color: 'red' }}>*</span></span>} 
                            name="MemberSince" 
                            rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a joined date!</span> }]}
                        >
                            <DatePicker 
                                format="MM/DD/YYYY"
                                placeholder="Select Date (MM/DD/YYYY)"
                                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
                                disabled={loading}
                            />
                        </Form.Item>
                    </Form>
                )}

                {modalType === 'View' && selectedEmployee && (
                    <div style={{ fontFamily: 'Poppins, sans-serif' }}>
                        <p><strong>Employee Name:</strong> {selectedEmployee["Employee Name"]}</p>
                        <p><strong>Branch Name:</strong> {selectedEmployee["Branch Name"]}</p>
                        <p><strong>Position Title:</strong> {selectedEmployee["Position Title"]}</p>
                        <p><strong>Rate per Hour:</strong> {ratePerHour ? `₱${formatMoney(ratePerHour)}` : 'N/A'}</p>
                        <p><strong>Schedule:</strong> {selectedEmployee.Schedule}</p>
                        <p><strong>Member Since:</strong> {selectedEmployee["Member Since"]}</p>
                        <div>
                            <strong>Allowances:</strong>
                            {allowances.length > 0 ? (
                                <ul>
                                    {allowances.map((allowance) => (
                                        <li key={allowance.AllowanceID}>
                                            {allowance.Description}: ₱{formatMoney(allowance.Amount)} 
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No allowances assigned.</p>
                            )}
                        </div>
                        <div>
                            <strong>Deductions:</strong>
                            {deductions.length > 0 ? (
                                <ul>
                                    {deductions.map((deduction) => (
                                        <li key={deduction.DeductionID}>
                                            {deduction.DeductionType}: ₱{formatMoney(deduction.Amount)} 
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No deductions assigned.</p>
                            )}
                        </div>
                        <div style={{ marginTop: '20px' }}>
                            <strong>Cash Advance Record:</strong>
                            {cashAdvances.length > 0 ? (
                                <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px' }}>
                                    {cashAdvances.map((cashAdvance) => (
                                        <li key={cashAdvance.CashAdvanceID} style={{ marginBottom: '8px' }}>
                                            <strong>Date:</strong> {formatDateToMMDDYYYY(cashAdvance.Date)} | 
                                            <strong> Amount:</strong> ₱{formatMoney(cashAdvance.Amount)} | 
                                            <strong> Balance:</strong> ₱{formatMoney(calculateBalance(cashAdvance.Amount, paymentHistory.filter(p => p.cashAdvanceId === cashAdvance.CashAdvanceID)))}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No cash advances recorded.</p>
                            )}
                        </div>
                        <div style={{ marginTop: '20px' }}>
                            <strong>Cash Advance Payment History:</strong>
                            {paymentHistory.length > 0 ? (
                                <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px' }}>
                                    {paymentHistory.map((payment, index) => (
                                        <li key={index} style={{ marginBottom: '8px' }}>
                                            <strong>Date:</strong> {payment.date} | 
                                            <strong> Amount:</strong> ₱{formatMoney(payment.amount)} | 
                                            <strong> Paid:</strong> ₱{formatMoney(payment.paid)}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No cash advance payments recorded.</p>
                            )}
                        </div>
                    </div>
                )}

                {modalType === 'Delete' && selectedEmployee && (
                    <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
                        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                            ⚠️ Are you sure you want to delete this employee?
                        </p>
                        <p>This action <strong>cannot be undone</strong>. The employee "<strong>{selectedEmployee["Employee Name"]}</strong>" will be permanently removed including all the records that they have.</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default EmployeesTable;