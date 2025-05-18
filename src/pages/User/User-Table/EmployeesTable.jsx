import { useState, useEffect } from 'react';
import { ConfigProvider, Modal, Space, Table, Button, Input, Form, message, Select, Typography, Pagination, DatePicker, Tooltip } from 'antd';
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
    const [dateRange, setDateRange] = useState([null, null]);
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
    const [contributions, setContributions] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [ratePerHour, setRatePerHour] = useState(null);
    const [cashAdvances, setCashAdvances] = useState([]);
    const [loans, setLoans] = useState([]);

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
                console.log('Search Parameter:', searchText);
            }
            
            if (selectedBranch && branches.some(b => b.BranchID === selectedBranch)) {
                url += `&branch=${encodeURIComponent(selectedBranch)}`;
                console.log('Branch Parameter:', selectedBranch);
            }
            
            if (selectedPosition && Number.isInteger(selectedPosition) && selectedPosition > 0) {
                url += `&position=${encodeURIComponent(selectedPosition)}`;
                console.log('Position Parameter:', selectedPosition);
            }

            if (dateRange[0] && dateRange[1]) {
                const startDate = moment(dateRange[0]).isValid() ? dateRange[0].format('YYYY-MM-DD') : null;
                const endDate = moment(dateRange[1]).isValid() ? dateRange[1].format('YYYY-MM-DD') : null;
                if (startDate && endDate) {
                    url += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
                    console.log('Date Range Parameters:', { startDate, endDate });
                } else {
                    console.warn('Invalid date range selected:', { startDate, endDate });
                }
            }

            console.log('Fetching Employees URL:', url);
            const res = await fetch(url);
            
            if (!res.ok) {
                throw new Error(`Employees fetch failed: ${res.statusText}`);
            }
            
            const response = await res.json();
            console.log('Fetch Employees Response:', response);
            console.log('Response Employees Count:', response.employees ? response.employees.length : 0);

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch employees');
            }

            const mappedData = response.employees.map(employee => ({
                key: employee.key,
                "Employee ID": employee.key,
                "Employee Name": employee.EmployeeName,
                "Branch Name": employee.BranchName || 'N/A',
                "Position Title": employee.PositionTitle || 'N/A',
                "Schedule": employee.Schedule || 'N/A',
                "Member Since": formatDateToMMDDYYYY(employee.MemberSince),
                BranchID: employee.BranchID ? Number(employee.BranchID) : null,
                PositionID: employee.PositionID ? Number(employee.PositionID) : null,
                ScheduleID: employee.ScheduleID ? Number(employee.ScheduleID) : null,
                EmployeeName: employee.EmployeeName,
                MemberSince: employee.MemberSince
            }));

            console.log("Mapped Employee Data:", mappedData);
            
            setData(mappedData);
            setFilteredData(mappedData);
            setPaginationTotal(response.total || 0);
        } catch (err) {
            console.error("Fetch Employees Error:", err.message);
            let errorMessage = 'Failed to load employee data. Please try again later.';
            if (err.message.includes('Internal Server Error')) {
                errorMessage = 'Server error occurred while fetching employees. Please check the server logs or contact support.';
            }
            message.error(errorMessage);
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
            setContributions(response.contributions || []);
            setPaymentHistory(response.payment_history || []);
            setRatePerHour(response.rate_per_hour || null);
            setCashAdvances(response.cash_advances || []);
            setLoans(response.loans || []);
        } catch (err) {
            console.error("Fetch Employee Details Error:", err.message);
            message.error("Failed to load employee details.");
            setAllowances([]);
            setContributions([]);
            setPaymentHistory([]);
            setRatePerHour(null);
            setCashAdvances([]);
            setLoans([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDropdownData();
    }, []);

    useEffect(() => {
        console.log('Triggering fetchData with dependencies:', { currentPage, pageSize, selectedBranch, selectedPosition, searchText, dateRange });
        fetchData();
    }, [currentPage, pageSize, selectedBranch, selectedPosition, searchText, dateRange]);

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
        setSelectedBranch(value === 'all' || value === undefined ? null : Number(value));
        setCurrentPage(1);
    };

    const handlePositionChange = (value) => {
        const newPosition = value === 'all' || value === undefined ? null : Number(value);
        console.log('Position Changed:', { old: selectedPosition, new: newPosition });
        setSelectedPosition(newPosition);
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
                BranchID: record.BranchID ? String(record.BranchID) : null,
                PositionID: record.PositionID ? String(record.PositionID) : null,
                ScheduleID: record.ScheduleID ? String(record.ScheduleID) : null,
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

                if (!values.EmployeeName || !values.ScheduleID || !values.MemberSince) {
                    throw new Error("Employee Name, Schedule, and Member Since are required");
                }

                if (role === 'Payroll Staff' && values.BranchID) {
                    const isAuthorizedBranch = assignedBranches.some(ab => String(ab.BranchID) === values.BranchID);
                    if (!isAuthorizedBranch) {
                        throw new Error("You are not authorized to add/edit employees for this branch");
                    }
                }

                const memberSinceFormatted = values.MemberSince ? values.MemberSince.format('YYYY-MM-DD') : null;

                const payload = {
                    EmployeeName: values.EmployeeName,
                    BranchID: values.BranchID ? parseInt(values.BranchID) : null,
                    PositionID: values.PositionID ? parseInt(values.PositionID) : null,
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
        setLoans([]);
    };

    const showLabels = screenWidth >= 600;
    const branchOptions = role === 'Payroll Staff' ? assignedBranches : branches;

    return (
        <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
            <div className="fade-in" style={{ padding: '20px', fontFamily: 'Poppins, sans-serif' }}>
                <style>
                    {`
                        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
                        
                        /* Ensure custom elements use Poppins */
                        .fade-in, .fade-in * {
                            font-family: 'Poppins', sans-serif !important;
                        }

                        @media (max-width: 600px) {
                            .contributions-loans-container {
                                flex-direction: column !important;
                            }
                            .contributions-loans-section {
                                width: 100% !important;
                            }
                        }
                    `}
                </style>
                <Title level={2} style={{ marginBottom: '20px' }}>
                    Employees
                </Title>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <DatePicker.RangePicker
                            value={dateRange}
                            onChange={(dates) => {
                                setDateRange(dates || [null, null]);
                                setCurrentPage(1);
                            }}
                            format="MM/DD/YYYY"
                            placeholder={['Start Date', 'End Date']}
                            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
                            allowClear
                        />
                        <Select
                            value={selectedBranch !== null ? String(selectedBranch) : 'all'}
                            onChange={handleBranchChange}
                            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
                            placeholder="Select a Branch"
                            loading={loading}
                            optionFilterProp="children"
                            filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                            allowClear
                        >
                            <Option value="all">All Branches</Option>
                            {branchOptions.map(branch => (
                                <Option key={branch.BranchID} value={String(branch.BranchID)}>
                                    {branch.BranchName}
                                </Option>
                            ))}
                        </Select>
                        <Select
                            value={selectedPosition !== null ? String(selectedPosition) : 'all'}
                            onChange={handlePositionChange}
                            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
                            placeholder="Select a Position"
                            loading={loading}
                            optionFilterProp="children"
                            filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                            allowClear
                        >
                            <Option value="all">All Positions</Option>
                            {positions.map(position => (
                                <Option key={position.PositionID} value={String(position.PositionID)}>
                                    {position.PositionTitle}
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
                            {showLabels && 'Add Employee'}
                        </Button>
                        <Input
                            placeholder="Search Employees"
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
                    loading={loading}
                    locale={{ emptyText: <span>No employees found</span> }}
                >
                    <Column 
                        title="Employee ID"
                        dataIndex="Employee ID" 
                        stringency="Employee ID" 
                        sorter={(a, b) => a["Employee ID"] - b["Employee ID"]}
                        render={(text) => <span>{text}</span>}
                    />
                    <Column 
                        title="Employee Name"
                        dataIndex="Employee Name" 
                        key="Employee Name" 
                        sorter={(a, b) => a["Employee Name"].localeCompare(b["Employee Name"])}
                        render={(text) => <span>{text}</span>}
                    />
                    <Column 
                        title="Branch"
                        dataIndex="Branch Name" 
                        key="Branch Name" 
                        sorter={(a, b) => (a["Branch Name"] || '').localeCompare(b["Branch Name"] || '')}
                        render={(text) => <span>{text}</span>}
                    />
                    <Column 
                        title="Company Position" 
                        dataIndex="Position Title" 
                        key="Position Title" 
                        sorter={(a, b) => (a["Position Title"] || '').localeCompare(b["Position Title"] || '')}
                        render={(text) => <span>{text}</span>}
                    />
                    <Column 
                        title="Schedule"
                        dataIndex="Schedule" 
                        key="Schedule" 
                        sorter={(a, b) => (a["Schedule"] || '').localeCompare(b["Schedule"] || '')}
                        render={(text) => <span>{text}</span>}
                    />
                    <Column 
                        title="Member Since" 
                        dataIndex="Member Since" 
                        key="Member Since" 
                        sorter={(a, b) => {
                            const [aMonth, aDay, aYear] = a["Member Since"].split('/');
                            const [bMonth, bDay, bYear] = b["Member Since"].split('/');
                            return new Date(`${aYear}-${aMonth}-${aDay}`) - new Date(`${bYear}-${bMonth}-${bDay}`);
                        }}
                        render={(text) => <span>{text}</span>}
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

                <div style={{ textAlign: 'center', marginTop: 16 }}>
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
                        style={{ justifyContent: 'center' }}
                    />
                </div>

                <Modal 
                    title={
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
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
                    okButtonProps={{ danger: modalType === 'Delete' }}
                    width={screenWidth > 480 ? '40%' : '90%'}
                    centered
                    styles={{ body: { minHeight: '100px', padding: '20px', margin: 20 } }}
                >
                    {(modalType === 'Add' || modalType === 'Edit') && (
                        <Form form={form} layout="vertical">
                            <Form.Item 
                                label={<span>Employee Name<span style={{ color: 'red' }}>*</span></span>} 
                                name="EmployeeName" 
                                rules={[{ required: true, message: <span>Please enter Employee Name!</span> }]}
                            >
                                <Input placeholder="Enter Employee Name" />
                            </Form.Item>
                            <Form.Item 
                                label={<span>Branch<span style={{ color: 'red' }}>*</span></span>}
                                name="BranchID" 
                            >
                                <Select 
                                    placeholder="Select Branch" 
                                    loading={loading}
                                    showSearch
                                    optionFilterProp="children"
                                    allowClear
                                >
                                    {branchOptions.map((branch) => (
                                        <Option key={branch.BranchID} value={String(branch.BranchID)}>
                                            {branch.BranchName}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Form.Item 
                                label={<span>Company Position<span style={{ color: 'red' }}>*</span></span>}
                                name="PositionID" 
                            >
                                <Select 
                                    placeholder="Select Position" 
                                    loading={loading}
                                    showSearch
                                    optionFilterProp="children"
                                    allowClear
                                >
                                    {positions.map((position) => (
                                        <Option key={position.PositionID} value={String(position.PositionID)}>
                                            {position.PositionTitle}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Form.Item 
                                label={<span>Schedule<span style={{ color: 'red' }}>*</span></span>} 
                                name="ScheduleID" 
                                rules={[{ required: true, message: <span>Please select a company schedule!</span> }]}
                            >
                                <Select 
                                    placeholder="Select Schedule" 
                                    loading={loading}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {schedules.map((schedule) => (
                                        <Option key={schedule.ScheduleID} value={String(schedule.ScheduleID)}>
                                            {`${schedule.ShiftStart} - ${schedule.ShiftEnd}`}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Form.Item 
                                label={<span>Member Since<span style={{ color: 'red' }}>*</span></span>} 
                                name="MemberSince" 
                                rules={[{ required: true, message: <span>Please select a joined date!</span> }]}
                            >
                                <DatePicker 
                                    format="MM/DD/YYYY"
                                    placeholder="Select Date (MM/DD/YYYY)"
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        </Form>
                    )}

                    {modalType === 'View' && selectedEmployee && (
                        <div style={{ lineHeight: '1.6', maxHeight: 'calc(80vh - 150px)', overflowY: 'auto', boxSizing: 'border-box' }}>
                            <p><strong>Employee Name:</strong> {selectedEmployee["Employee Name"]}</p>
                            <p><strong>Branch Name:</strong> {selectedEmployee["Branch Name"]}</p>
                            <p><strong>Position Title:</strong> {selectedEmployee["Position Title"]}</p>
                            <p><strong>Rate per Hour:</strong> {ratePerHour ? `₱${formatMoney(ratePerHour)}` : 'N/A'}</p>
                            <p><strong>Schedule:</strong> {selectedEmployee["Schedule"]}</p>
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
                            <div className="loans-contributions-section" style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                <div className="loans-contributions-section" style={{ flex: 1, minWidth: 0 }}> 
                                    <strong>Loans:</strong>
                                    {loans.length > 0 ? (
                                        <ul>
                                            {loans.map((loan) => (
                                                <li key={loan.LoanID}>
                                                    {loan.LoanKey} {loan.LoanType} Loan: ₱{formatMoney(loan.Amount)}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p>No loans recorded.</p>
                                    )}
                                </div>
                                <div className="loans-contributions-section" style={{ flex: 1, minWidth: 0 }}>
                                    <strong>Contributions:</strong>
                                    {contributions.length > 0 ? (
                                        <ul>
                                            {contributions.map((contribution) => (
                                                <li key={contribution.ContributionID}>
                                                    {contribution.ContributionType}: ₱{formatMoney(contribution.Amount)} 
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p>No contributions assigned.</p>
                                    )}
                                </div>
                            </div>
                            <div style={{ marginTop: '20px' }}>
                                <strong>Cash Advance Record:</strong>
                                {cashAdvances.length > 0 ? (
                                    <Table
                                        dataSource={cashAdvances.map(cashAdvance => ({
                                            key: cashAdvance.CashAdvanceID,
                                            Date: formatDateToMMDDYYYY(cashAdvance.Date),
                                            Amount: `₱${formatMoney(cashAdvance.Amount)}`,
                                            Balance: `₱${formatMoney(calculateBalance(cashAdvance.Amount, paymentHistory.filter(p => p.cashAdvanceId === cashAdvance.CashAdvanceID)))}`
                                        }))}
                                        bordered
                                        pagination={false}
                                        style={{ marginTop: '10px' }}
                                        size="small"
                                    >
                                        <Column title="Date" dataIndex="Date" key="Date" />
                                        <Column title="Amount" dataIndex="Amount" key="Amount" />
                                        <Column title="Balance" dataIndex="Balance" key="Balance" />
                                    </Table>
                                ) : (
                                    <p>No cash advances recorded.</p>
                                )}
                            </div>
                            <div style={{ marginTop: '20px' }}>
                                <strong>Cash Advance Payment History:</strong>
                                {paymentHistory.length > 0 ? (
                                    <Table
                                        dataSource={paymentHistory.map((payment, index) => ({
                                            key: index,
                                            Date: payment.date,
                                            Amount: `₱${formatMoney(payment.amount)}`,
                                            Paid: `₱${formatMoney(payment.paid)}`
                                        }))}
                                        bordered
                                        pagination={false}
                                        style={{ marginTop: '10px' }}
                                        size="small"
                                    >
                                        <Column title="Date" dataIndex="Date" key="Date" />
                                        <Column title="Amount" dataIndex="Amount" key="Amount" />
                                        <Column title="Paid" dataIndex="Paid" key="Paid" />
                                    </Table>
                                ) : (
                                    <p>No cash advance payments recorded.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {modalType === 'Delete' && selectedEmployee && (
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                                ⚠️ Are you sure you want to delete this employee?
                            </p>
                            <p>
                                This action <strong>cannot be undone</strong>. The employee "<strong>{selectedEmployee["Employee Name"]}</strong>" 
                                will be permanently removed including all the records <strong>(Attendance Records, Overtime Records, 
                                Leave Records, Allowance Records, Deduction Records, Cash Advance Records, and Payroll Records)</strong> 
                                that they have.
                            </p>
                        </div>
                    )}
                </Modal>
            </div>
        </ConfigProvider>
    );
};

export default EmployeesTable;