// Import React hooks to manage component state and lifecycle
import { useState, useEffect } from 'react';
// Import Ant Design components for UI elements like tables, modals, and forms
import { Modal, Space, Table, Button, Input, Form, message, Select, Typography, Tag, Pagination, DatePicker } from 'antd';
// Import Ant Design icons for visual button actions
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
// Import custom CSS file to apply additional styling to the component
import './AdminTable.css';

// Destructure specific Ant Design components for cleaner code access
const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;
const { RangePicker } = DatePicker;

// Define the main functional component for managing user accounts
const UserAccountTable = () => {
  // Initialize state to store all user records fetched from the server
  const [data, setData] = useState([]);
  // Initialize state to store filtered user records for display in the table
  const [filteredData, setFilteredData] = useState([]);
  // Initialize state to store the list of branches fetched from the server
  const [branches, setBranches] = useState([]);
  // Initialize state to control the visibility of the modal (Add/Edit/View/Delete)
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Initialize state to determine the modal's current purpose (e.g., 'Add', 'Edit')
  const [modalType, setModalType] = useState('');
  // Initialize state to track the currently selected user for viewing or editing
  const [selectedUser, setSelectedUser] = useState(null);
  // Initialize state to store the current search input text
  const [searchText, setSearchText] = useState('');
  // Initialize state to indicate if data is being fetched (for loading spinner)
  const [loading, setLoading] = useState(false);
  // Create a form instance to manage form inputs and validation rules
  const [form] = Form.useForm();
  // Initialize state to track the browser window width for responsive design
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  // Initialize state to store the currently selected role in the form
  const [selectedRole, setSelectedRole] = useState('');
  // Initialize state to track the current page number in pagination
  const [currentPage, setCurrentPage] = useState(1);
  // Initialize state to set the number of items per page in pagination
  const [pageSize, setPageSize] = useState(10);
  // Initialize state to store the total number of items for pagination
  const [totalItems, setTotalItems] = useState(0);
  // Initialize state to store the selected branch filter value
  const [branchFilter, setBranchFilter] = useState(null);
  // Initialize state to store the selected role filter value
  const [roleFilter, setRoleFilter] = useState(null);
  // Initialize state to store the selected date range filter
  const [dateRange, setDateRange] = useState(null);

  // Define the base URL for all API endpoints used in the component
  const BASE_URL = "http://localhost/AdminTableDB/AdminDB";

  // Define an async function to fetch user data from the server
  const fetchData = async (page = currentPage, size = pageSize, filters = {}) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page - 1,
        size,
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.role && { role: filters.role }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(searchText && { search: searchText }),
      });

      const res = await fetch(`${BASE_URL}/fetch_useraccount.php?${queryParams}`);
      const response = await res.json();
      console.log('Fetched User Data:', response.data);
      
      if (!response.success) throw new Error(response.error || "Failed to fetch data");
      
      const formattedData = response.data.map(item => ({
        key: item.UserID,
        UserID: item.UserID,
        Name: item.Name,
        Username: item.Username,
        Role: item.Role,
        Email: item.Email,
        Branches: item.Branches || 'None',
        CreatedOn: item.CreatedOn,
      }));
      
      setData(formattedData);
      setFilteredData(formattedData);
      setTotalItems(response.total);
    } catch (err) {
      console.error('Fetch Data Error:', err);
      message.error(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Define an async function to fetch branch data from the server
  const fetchBranches = async () => {
    try {
      const res = await fetch(`${BASE_URL}/fetch_userbranches.php`);
      const data = await res.json();
      console.log('Fetched Branches:', data.data);
      setBranches(data.data || []);
    } catch (err) {
      console.error('Fetch Branches Error:', err);
      message.error("Failed to load branches");
    }
  };

  // Define an async function to check if a username already exists in the database
  const checkUsernameExists = async (username) => {
    try {
      const res = await fetch(`${BASE_URL}/check_username.php?username=${encodeURIComponent(username)}`);
      const response = await res.json();
      console.log('Check Username Response:', response);
      return response.exists;
    } catch (err) {
      console.error('Check Username Error:', err);
      return false;
    }
  };

  // Define an async function to check if an email already exists in the database
  const checkEmailExists = async (email) => {
    try {
      const res = await fetch(`${BASE_URL}/check_email.php?email=${encodeURIComponent(email)}`);
      const response = await res.json();
      console.log('Check Email Response:', response);
      return response.exists;
    } catch (err) {
      console.error('Check Email Error:', err);
      return false;
    }
  };

  // Use effect hook to fetch initial data when the component mounts
  useEffect(() => {
    fetchBranches();
    fetchData();
  }, []);

  // Use effect hook to re-fetch data when filter or pagination states change
  useEffect(() => {
    applyFilters();
  }, [currentPage, pageSize, branchFilter, roleFilter, dateRange, searchText]);

  // Use effect hook to handle window resizing for responsive design
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine if button labels should be shown based on screen width (responsive design)
  const showLabels = screenWidth >= 600;

  // Define a function to handle search input changes
  const handleSearch = (value) => {
    setSearchText(value);
    setCurrentPage(1);
  };

  // Define a function to apply filters and fetch updated data
  const applyFilters = () => {
    const filters = {
      ...(branchFilter && { branch: branchFilter }),
      ...(roleFilter && { role: roleFilter }),
      ...(dateRange && dateRange[0] && { startDate: dateRange[0].format('YYYY-MM-DD') }),
      ...(dateRange && dateRange[1] && { endDate: dateRange[1].format('YYYY-MM-DD') }),
    };
    fetchData(currentPage, pageSize, filters);
  };

  // Define a function to handle pagination changes
  const handlePageChange = (page, pageSize) => {
    setCurrentPage(page);
    setPageSize(pageSize);
  };

  // Define a function to open a modal for a specific action (Add/Edit/View/Delete)
  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedUser(record);
    if (type === 'Edit' && record) {
      const branchIds = record.Branches !== 'None' ? record.Branches.split('|') : [];
      form.setFieldsValue({
        name: record.Name,
        username: record.Username,
        role: record.Role,
        email: record.Email,
        branches: branchIds,
      });
      setSelectedRole(record.Role);
      if (record.Role === 'Payroll Admin') {
        form.setFieldsValue({ branches: branches.map(branch => String(branch.BranchID)) });
      } else if (record.Role === 'System Administrator') {
        form.setFieldsValue({ branches: [] });
      }
    }
    if (type === 'Add') {
      form.resetFields();
      setSelectedRole('');
    }
    setIsModalOpen(true);
  };

  // Define an async function to handle the modal's OK button action
  const handleOk = async () => {
    setLoading(true);
    const currentUserId = localStorage.getItem('userId') || '1';
    try {
      const values = form.getFieldsValue();

      if (modalType === 'Add' || modalType === 'Edit') {
        const errors = [];
        if (!values.name) errors.push('Name is required');
        if (!values.username) errors.push('Username is required');
        if (!values.role) errors.push('Role is required');
        if (values.role === 'Payroll Staff' && (!values.branches || values.branches.length === 0)) {
          errors.push('Branch is required for Payroll Staff');
        }
        if (!values.email) errors.push('Email is required');
        if (modalType === 'Add' && !values.password) errors.push('Password is required');

        if (errors.length > 0) {
          setLoading(false);
          message.error('Please fill in all required fields');
          return;
        }
      }

      await form.validateFields();
      const payload = {
        current_user_id: currentUserId,
        ...(modalType !== 'Add' && { UserID: selectedUser?.UserID }),
        name: values.name,
        username: values.username,
        role: values.role,
        email: values.email,
        ...(values.password && { password: values.password }),
        branches: values.role === 'System Administrator' ? [] :
                 values.role === 'Payroll Admin' ? branches.map(b => String(b.BranchID)) :
                 values.branches || [],
      };
      console.log('Payload sent to backend:', payload);

      const url = `${BASE_URL}/fetch_useraccount.php`;
      const method = modalType === 'Add' ? 'POST' : 
                    modalType === 'Edit' ? 'PUT' : 
                    'DELETE';

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Operation failed");

      message.success(`${modalType} successful`);
      setIsModalOpen(false);
      form.resetFields();
      setSelectedUser(null);
      setSelectedRole('');
      fetchData();
    } catch (err) {
      console.error('HandleOk Error:', err);
      message.error(err.message || "Please comply with the requirements!");
    } finally {
      setLoading(false);
    }
  };

  // Define a function to handle the modal's cancel button action
  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setSelectedUser(null);
    setSelectedRole('');
  };

  // Define a function to handle changes in the role selection dropdown
  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (role === 'System Administrator') {
      form.setFieldsValue({ branches: [] });
    } else if (role === 'Payroll Admin') {
      form.setFieldsValue({ branches: branches.map(branch => String(branch.BranchID)) });
    } else if (role === 'Payroll Staff') {
      form.setFieldsValue({ branches: form.getFieldValue('branches') || [] });
    }
  };

  // Define a function to convert branch IDs into readable branch names
  const getBranchNames = (branchIds) => {
    if (!branchIds || branchIds === 'None') return 'None';
    const ids = branchIds.split('|');
    const names = ids.map(id => {
      const branch = branches.find(b => String(b.BranchID) === String(id));
      return branch ? branch.BranchName : `Unknown (${id})`;
    });
    return names.join(' | ');
  };

  // Define a validation function to prevent duplicate branch selections
  const validateNoDuplicateBranches = (_, value) => {
    if (selectedRole === 'Payroll Staff' && value) {
      const uniqueBranches = new Set(value);
      if (uniqueBranches.size !== value.length) {
        return Promise.reject(new Error('Each branch can only be assigned once!'));
      }
    }
    return Promise.resolve();
  };

  // Define an async validation function to check username uniqueness in the database
  const validateUniqueUsername = async (_, value) => {
    if (!value) return Promise.resolve();
    const exists = await checkUsernameExists(value);
    if (exists && (modalType !== 'Edit' || (modalType === 'Edit' && selectedUser?.Username.toLowerCase() !== value.toLowerCase()))) {
      return Promise.reject(new Error('Username already exists!'));
    }
    return Promise.resolve();
  };

  // Define an async validation function to check email format and uniqueness
  const validateEmail = async (_, value) => {
    if (!value) return Promise.resolve();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return Promise.reject(new Error('Please enter a valid email address!'));
    }
    const exists = await checkEmailExists(value);
    if (exists && (modalType !== 'Edit' || (modalType === 'Edit' && selectedUser?.Email.toLowerCase() !== value.toLowerCase()))) {
      return Promise.reject(new Error('Email address already exists!'));
    }
    return Promise.resolve();
  };

  // Define a validation function to enforce password strength requirements
  const validatePasswordStrength = (_, value) => {
    if (!value && modalType === 'Edit') return Promise.resolve();
    if (!value) return Promise.reject(new Error('Please enter password!'));
    const minLength = value.length >= 8;
    const hasLowercase = /[a-z]/.test(value);
    const hasUppercase = /[A-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);

    if (!(minLength && hasLowercase && hasUppercase && hasNumber && hasSpecial)) {
      return Promise.reject(new Error(
        'Password must be at least 8 characters long and contain lowercase, uppercase, numbers, and special characters!'
      ));
    }
    return Promise.resolve();
  };

  // Define a validation function to ensure a name is provided
  const validateName = (_, value) => {
    if (!value) return Promise.reject(new Error('Please enter name!'));
    return Promise.resolve();
  };

  // Define a function to format a date string into a readable 12-hour format
  const formatDateTo12Hour = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    return date.toLocaleString('en-US', options).replace(' at ', ', ');
  };

  // Render the component's UI
  return (
    <div className="user-account-table" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <Title level={2} style={{ marginBottom: 20, fontFamily: 'Poppins, sans-serif' }}>User Account List</Title>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20, alignItems: 'center', fontFamily: 'Poppins, sans-serif' }}>
        <Space direction={screenWidth < 768 ? 'vertical' : 'horizontal'}>
          <Select
            placeholder="Filter by Branch"
            allowClear
            style={{ width: 200, fontFamily: 'Poppins, sans-serif' }}
            onChange={value => { setBranchFilter(value); setCurrentPage(1); }}
          >
            {branches.map(branch => (
              <Option key={branch.BranchID} value={branch.BranchName}>{branch.BranchName}</Option>
            ))}
          </Select>
          
          <Select
            placeholder="Filter by Role"
            allowClear
            style={{ width: 200, fontFamily: 'Poppins, sans-serif' }}
            onChange={value => { setRoleFilter(value); setCurrentPage(1); }}
          >
            <Option value="System Administrator">System Administrator</Option>
            <Option value="Payroll Admin">Payroll Admin</Option>
            <Option value="Payroll Staff">Payroll Staff</Option>
          </Select>
          
          <RangePicker
            onChange={dates => { setDateRange(dates); setCurrentPage(1); }}
            style={{ width: 250, fontFamily: 'Poppins, sans-serif' }}
          />
        </Space>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'Poppins, sans-serif' }}>
          <Button
            icon={<PlusOutlined />}
            size="middle"
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
            onClick={() => openModal('Add')}
          >
            {showLabels && 'Add User'}
          </Button>
          
          <Input
            placeholder="Search user"
            allowClear
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ width: screenWidth < 480 ? '100%' : '250px', fontFamily: 'Poppins, sans-serif' }}
          />
        </div>
      </div>

      <Table
        dataSource={filteredData}
        bordered
        scroll={{ x: true }}
        loading={loading}
        pagination={false}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column title="Name" dataIndex="Name" key="Name" sorter={(a, b) => a.Name.localeCompare(b.Name)} />
        <Column title="Username" dataIndex="Username" key="Username" sorter={(a, b) => a.Username.localeCompare(b.Username)} />
        <Column title="Role" dataIndex="Role" key="Role" sorter={(a, b) => a.Role.localeCompare(b.Role)} />
        <Column title="Email" dataIndex="Email" key="Email" sorter={(a, b) => a.Email.localeCompare(b.Email)} />
        <Column
          title="Branch"
          dataIndex="Branches"
          key="Branches"
          sorter={(a, b) => a.Branches.localeCompare(b.Branches)}
          render={(branches, record) => {
            if (record.Role === 'System Administrator') return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>None</Tag>;
            if (record.Role === 'Payroll Admin') return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Tag>;
            const branchNames = getBranchNames(branches);
            if (branchNames === 'None') return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>None</Tag>;
            return (
              <Space wrap>
                {branchNames.split('|').map((branch, index) => (
                  <Tag key={index} color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>{branch}</Tag>
                ))}
              </Space>
            );
          }}
        />
        <Column 
          title="Created On"
          dataIndex="CreatedOn"
          key="CreatedOn"
          sorter={(a, b) => new Date(a.CreatedOn) - new Date(b.CreatedOn)}
          render={(createdOn) => formatDateTo12Hour(createdOn)}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button 
                icon={<EyeOutlined />}
                size="middle"
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('View', record)}
              >
                {showLabels && 'View'}
              </Button>
              <Button 
                icon={<EditOutlined />}
                size="middle"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button 
                icon={<DeleteOutlined />}
                size="middle"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={totalItems}
        onChange={handlePageChange}
        showSizeChanger
        showQuickJumper
        showTotal={total => `Total ${total} items`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

      <Modal
        title={<span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
          {modalType === 'Add' ? 'Add a New User' :
           modalType === 'Edit' ? 'Edit User Details' :
           modalType === 'View' ? 'View User Information' :
           'Confirm User Deletion'}
        </span>}
        open={isModalOpen}
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete', loading: loading, style: modalType !== 'Delete' ? { backgroundColor: '#0023B0', borderColor: '#0023B0' } : {} }}
        width={600}
        centered
        className={modalType === 'Delete' ? 'delete-modal' : ''}
        bodyStyle={{ minHeight: '100px', padding: '20px', margin: 20, fontFamily: 'Poppins, sans-serif' }}
      >
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Name<span style={{ color: 'red' }}>*</span></span>}
              name="name"
              rules={[{ validator: validateName }]}
              validateTrigger="onChange"
              colon={false}
            >
              <Input placeholder="Enter name" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Username<span style={{ color: 'red' }}>*</span></span>}
              name="username"
              rules={[{ validator: validateUniqueUsername }]}
              validateTrigger={['onChange', 'onBlur']}
              colon={false}
            >
              <Input placeholder="Enter username" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Role<span style={{ color: 'red' }}>*</span></span>}
              name="role"
              rules={[{ required: true, message: 'Please select role!' }]}
              colon={false}
            >
              <Select placeholder="Select a role" onChange={handleRoleChange} style={{ fontFamily: 'Poppins, sans-serif' }}>
                <Option value="System Administrator">System Administrator</Option>
                <Option value="Payroll Admin">Payroll Admin</Option>
                <Option value="Payroll Staff">Payroll Staff</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch{selectedRole === 'Payroll Staff' && <span style={{ color: 'red' }}>*</span>}</span>}
              name="branches"
              rules={[
                { required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' },
                { validator: validateNoDuplicateBranches },
              ]}
              colon={false}
            >
              <Select
                placeholder={
                  selectedRole === 'System Administrator' ? 'None' :
                  selectedRole === 'Payroll Admin' ? 'All Branches' :
                  'Select a Role first!'
                }
                mode="multiple"
                allowClear={selectedRole === 'Payroll Staff'}
                disabled={!selectedRole || selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                value={
                  selectedRole === 'Payroll Admin' ? branches.map(branch => String(branch.BranchID)) :
                  selectedRole === 'System Administrator' ? [] :
                  undefined
                }
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {branches.map(branch => (
                  <Option key={branch.BranchID} value={String(branch.BranchID)}>{branch.BranchName}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Email<span style={{ color: 'red' }}>*</span></span>}
              name="email"
              rules={[{ validator: validateEmail }]}
              validateTrigger={['onChange', 'onBlur']}
              colon={false}
            >
              <Input placeholder="Enter email" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Password<span style={{ color: 'red' }}>*</span></span>}
              name="password"
              rules={[{ validator: validatePasswordStrength }]}
              validateTrigger="onChange"
              colon={false}
            >
              <Input.Password placeholder="Enter password" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'Edit' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Name<span style={{ color: 'red' }}>*</span></span>}
              name="name"
              rules={[{ validator: validateName }]}
              validateTrigger="onChange"
              colon={false}
            >
              <Input placeholder="Enter name" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Username<span style={{ color: 'red' }}>*</span></span>}
              name="username"
              rules={[{ validator: validateUniqueUsername }]}
              validateTrigger={['onChange', 'onBlur']}
              colon={false}
            >
              <Input placeholder="Enter username" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Role<span style={{ color: 'red' }}>*</span></span>}
              name="role"
              rules={[{ required: true, message: 'Please select role!' }]}
              colon={false}
            >
              <Select placeholder="Select a role" onChange={handleRoleChange} style={{ fontFamily: 'Poppins, sans-serif' }}>
                <Option value="System Administrator">System Administrator</Option>
                <Option value="Payroll Admin">Payroll Admin</Option>
                <Option value="Payroll Staff">Payroll Staff</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch{selectedRole === 'Payroll Staff' && <span style={{ color: 'red' }}>*</span>}</span>}
              name="branches"
              rules={[
                { required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' },
                { validator: validateNoDuplicateBranches },
              ]}
              colon={false}
            >
              <Select
                placeholder={
                  selectedRole === 'System Administrator' ? 'None' :
                  selectedRole === 'Payroll Admin' ? 'All Branches' :
                  'Select branch(es)'
                }
                mode="multiple"
                allowClear={selectedRole === 'Payroll Staff'}
                disabled={selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                value={
                  selectedRole === 'Payroll Admin' ? branches.map(branch => String(branch.BranchID)) :
                  selectedRole === 'System Administrator' ? [] :
                  undefined
                }
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {branches.map(branch => (
                  <Option key={branch.BranchID} value={String(branch.BranchID)}>{branch.BranchName}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Email<span style={{ color: 'red' }}>*</span></span>}
              name="email"
              rules={[{ validator: validateEmail }]}
              validateTrigger={['onChange', 'onBlur']}
              colon={false}
            >
              <Input placeholder="Enter email" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
    
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Password (Optional)</span>}
              name="password"
              rules={[{ validator: validatePasswordStrength }]}
              validateTrigger="onChange"
              colon={false}
            >
              <Input.Password placeholder="Enter new password or leave blank" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Name:</strong> {selectedUser?.Name}</p>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Username:</strong> {selectedUser?.Username}</p>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Role:</strong> {selectedUser?.Role}</p>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {getBranchNames(selectedUser?.Branches)}</p>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Email:</strong> {selectedUser?.Email}</p>
            <p><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Created On:</strong> {formatDateTo12Hour(selectedUser?.CreatedOn)}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this user?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>.
              The user "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedUser?.Name}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Export the component for use in other parts of the application
export default UserAccountTable;