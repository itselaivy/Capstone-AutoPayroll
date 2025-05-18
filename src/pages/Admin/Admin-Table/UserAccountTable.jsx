// Import useState and useEffect hooks from React for managing state and side effects
import { useState, useEffect } from 'react';
// Import Ant Design components for UI elements like tables, modals, and inputs
import { ConfigProvider, Modal, Space, Table, Button, Input, Form, message, Select, Typography, Tag, Pagination, DatePicker, Tooltip } from 'antd';
// Import Ant Design icons for action buttons and search functionality
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
// Import custom CSS file for additional styling
import './AdminTable.css';

// Destructure Table.Column for defining table columns
const { Column } = Table;
// Destructure Select.Option for dropdown options
const { Option } = Select;
// Destructure Typography.Title for styled headings
const { Title } = Typography;
// Destructure DatePicker.RangePicker for selecting date ranges
const { RangePicker } = DatePicker;

// Define the UserAccountTable functional component
const UserAccountTable = () => {
  // Initialize state for storing user data fetched from the server
  const [data, setData] = useState([]);
  // Initialize state for storing filtered user data based on search and filters
  const [filteredData, setFilteredData] = useState([]);
  // Initialize state for storing branch data for dropdowns
  const [branches, setBranches] = useState([]);
  // Initialize state to control visibility of the modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Initialize state to track the modal type (Add, Edit, View, Delete)
  const [modalType, setModalType] = useState('');
  // Initialize state to store the currently selected user for modal operations
  const [selectedUser, setSelectedUser] = useState(null);
  // Initialize state for search text input
  const [searchText, setSearchText] = useState('');
  // Initialize state to indicate data loading status
  const [loading, setLoading] = useState(false);
  // Initialize form instance for managing form inputs and validation
  const [form] = Form.useForm();
  // Initialize state for tracking screen width for responsive design
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  // Initialize state for tracking selected role in the form
  const [selectedRole, setSelectedRole] = useState('');
  // Initialize state for current page in pagination
  const [currentPage, setCurrentPage] = useState(1);
  // Initialize state for number of items per page
  const [pageSize, setPageSize] = useState(10);
  // Initialize state for total number of user records
  const [totalItems, setTotalItems] = useState(0);
  // Initialize state for branch filter selection
  const [branchFilter, setBranchFilter] = useState(null);
  // Initialize state for role filter selection
  const [roleFilter, setRoleFilter] = useState(null);
  // Initialize state for date range filter
  const [dateRange, setDateRange] = useState(null);

  // Define constant for the base API URL
  const BASE_URL = "http://localhost/AdminTableDB/AdminDB";
  // Retrieve user ID from localStorage
  const userId = localStorage.getItem('userId');
  // Retrieve user role from localStorage
  const role = localStorage.getItem('role');

  // Define async function to fetch user data with pagination and filters
  const fetchData = async (page = currentPage, size = pageSize, filters = {}) => {
    // Set loading state to true to show loading indicator
    setLoading(true);
    try {
      // Check if user is logged in
      if (!userId || !role) {
        // Display error message if user is not logged in
        message.error('Please log in to continue');
        // Exit function if no user ID or role
        return;
      }  

      // Create query parameters for API request
      const queryParams = new URLSearchParams({
        // Set page number (zero-based for backend)
        page: page - 1,
        // Set page size
        size,
        // Include branch filter if provided
        ...(filters.branch && { branch: filters.branch }),
        // Include role filter if provided
        ...(filters.role && { role: filters.role }),
        // Include start date filter if provided
        ...(filters.startDate && { startDate: filters.startDate }),
        // Include end date filter if provided
        ...(filters.endDate && { endDate: filters.endDate }),
        // Include search text if provided
        ...(searchText && { search: searchText }),
      });

      // Fetch user data from the server
      const res = await fetch(`${BASE_URL}/fetch_useraccount.php?${queryParams}`);
      // Parse response as JSON
      const response = await res.json();
      // Log fetched data for debugging
      console.log('Fetched User Data:', response.data);
      
      // Check if response indicates failure
      if (!response.success) throw new Error(response.error || "Failed to fetch data");
      
      // Format response data for table display
      const formattedData = response.data.map(item => ({
        // Set unique key for table row
        key: item.UserID,
        // Store user ID
        UserID: item.UserID,
        // Store user name
        Name: item.Name,
        // Store username
        Username: item.Username,
        // Store user role
        Role: item.Role,
        // Store user email
        Email: item.Email,
        // Store branches or 'None' if none assigned
        Branches: item.Branches || 'None',
        // Store creation date
        CreatedOn: item.CreatedOn,
      }));
      
      // Update data state with formatted data
      setData(formattedData);
      // Update filtered data state with formatted data
      setFilteredData(formattedData);
      // Update total items for pagination
      setTotalItems(response.total);
    } catch (err) {
      // Log error for debugging
      console.error('Fetch Data Error:', err);
      // Display error message to user
      message.error(err.message || "Failed to load users");
    } finally {
      // Set loading state to false
      setLoading(false);
    }
  };

  // Define async function to fetch branch data
  const fetchBranches = async () => {
    try {
      // Fetch branch data from the server
      const res = await fetch(`${BASE_URL}/fetch_userbranches.php`);
      // Parse response as JSON
      const data = await res.json();
      // Log fetched branches for debugging
      console.log('Fetched Branches:', data.data);
      // Update branches state with fetched data or empty array
      setBranches(data.data || []);
    } catch (err) {
      // Log error for debugging
      console.error('Fetch Branches Error:', err);
      // Display error message to user
      message.error("Failed to load branches");
    }
  };

  // Define async function to check if a username already exists
  const checkUsernameExists = async (username) => {
    try {
      // Fetch username check from server
      const res = await fetch(`${BASE_URL}/check_username.php?username=${encodeURIComponent(username)}`);
      // Parse response as JSON
      const response = await res.json();
      // Log response for debugging
      console.log('Check Username Response:', response);
      // Return whether username exists
      return response.exists;
    } catch (err) {
      // Log error for debugging
      console.error('Check Username Error:', err);
      // Return false on error
      return false;
    }
  };

  // Define async function to check if an email already exists
  const checkEmailExists = async (email) => {
    try {
      // Fetch email check from server
      const res = await fetch(`${BASE_URL}/check_email.php?email=${encodeURIComponent(email)}`);
      // Parse response as JSON
      const response = await res.json();
      // Log response for debugging
      console.log('Check Email Response:', response);
      // Return whether email exists
      return response.exists;
    } catch (err) {
      // Log error for debugging
      console.error('Check Email Error:', err);
      // Return false on error
      return false;
    }
  };

  // Fetch branches and user data on component mount
  useEffect(() => {
    // Call function to fetch branches
    fetchBranches();
    // Call function to fetch user data
    fetchData();
  // Empty dependency array ensures this runs only once on mount
  }, []);

  // Apply filters when pagination or filter states change
  useEffect(() => {
    // Call function to apply filters and fetch data
    applyFilters();
  // Re-run when these dependencies change
  }, [currentPage, pageSize, branchFilter, roleFilter, dateRange, searchText]);

  // Handle window resize for responsive design
  useEffect(() => {
    // Define function to update screen width state
    const handleResize = () => setScreenWidth(window.innerWidth);
    // Call resize handler initially
    handleResize();
    // Add resize event listener
    window.addEventListener('resize', handleResize);
    // Cleanup: remove event listener on unmount
    return () => window.removeEventListener('resize', handleResize);
  // Empty dependency array ensures this runs only once
  }, []);

  // Determine if button labels should be shown based on screen width
  const showLabels = screenWidth >= 600;

  // Handle search input changes
  const handleSearch = (value) => {
    // Update search text state
    setSearchText(value);
    // Reset to first page
    setCurrentPage(1);
  };

  // Apply filters and fetch data
  const applyFilters = () => {
    // Create filter object with current filter values
    const filters = {
      // Include branch filter if set
      ...(branchFilter && { branch: branchFilter }),
      // Include role filter if set
      ...(roleFilter && { role: roleFilter }),
      // Include start date if date range is set
      ...(dateRange && dateRange[0] && { startDate: dateRange[0].format('YYYY-MM-DD') }),
      // Include end date if date range is set
      ...(dateRange && dateRange[1] && { endDate: dateRange[1].format('YYYY-MM-DD') }),
    };
    // Fetch data with current filters
    fetchData(currentPage, pageSize, filters);
  };

  // Handle pagination changes
  const handlePageChange = (page, pageSize) => {
    // Update current page state
    setCurrentPage(page);
    // Update page size state
    setPageSize(pageSize);
  };

  // Open modal for Add, Edit, View, or Delete actions
  const openModal = (type, record = null) => {
    // Set modal type (Add, Edit, View, Delete)
    setModalType(type);
    // Set selected user record
    setSelectedUser(record);
    // If editing, populate form with user data
    if (type === 'Edit' && record) {
      // Split branch IDs if branches are assigned
      const branchIds = record.Branches !== 'None' ? record.Branches.split('|') : [];
      // Set form values with user data
      form.setFieldsValue({
        name: record.Name,
        username: record.Username,
        role: record.Role,
        email: record.Email,
        branches: branchIds,
      });
      // Update selected role state
      setSelectedRole(record.Role);
      // If Payroll Admin, select all branches
      if (record.Role === 'Payroll Admin') {
        form.setFieldsValue({ branches: branches.map(branch => String(branch.BranchID)) });
      // If System Administrator, clear branches
      } else if (record.Role === 'System Administrator') {
        form.setFieldsValue({ branches: [] });
      }
    }
    // If adding, reset form
    if (type === 'Add') {
      // Clear form fields
      form.resetFields();
      // Clear selected role
      setSelectedRole('');
    }
    // Show modal
    setIsModalOpen(true);
  };

  // Handle modal OK button click
  const handleOk = async () => {
    // Set loading state to true
    setLoading(true);
    // Get current user ID from localStorage, default to '1'
    const currentUserId = localStorage.getItem('userId') || '1';
    try {
      // Get form values
      const values = form.getFieldsValue();

      // Validate required fields for Add or Edit
      if (modalType === 'Add' || modalType === 'Edit') {
        // Initialize array for validation errors
        const errors = [];
        // Check if name is provided
        if (!values.name) errors.push('Name is required');
        // Check if username is provided
        if (!values.username) errors.push('Username is required');
        // Check if role is provided
        if (!values.role) errors.push('Role is required');
        // Check if branches are provided for Payroll Staff
        if (values.role === 'Payroll Staff' && (!values.branches || values.branches.length === 0)) {
          errors.push('Branch is required for Payroll Staff');
        }
        // Check if email is provided
        if (!values.email) errors.push('Email is required');
        // Check if password is provided for Add
        if (modalType === 'Add' && !values.password) errors.push('Password is required');

        // If errors exist, show message and exit
        if (errors.length > 0) {
          setLoading(false);
          message.error('"Failed to add user: Please ensure all required fields are completed correctly."');
          return;
        }
      }

      // Validate form fields
      await form.validateFields();
      // Create payload for API request
      const payload = {
        // Include current user ID
        current_user_id: currentUserId,
        // Include user ID for Edit or Delete
        ...(modalType !== 'Add' && { UserID: selectedUser?.UserID }),
        // Include name
        name: values.name,
        // Include username
        username: values.username,
        // Include role
        role: values.role,
        // Include email
        email: values.email,
        // Include password if provided
        ...(values.password && { password: values.password }),
        // Set branches based on role
        branches: values.role === 'System Administrator' ? [] :
                 values.role === 'Payroll Admin' ? branches.map(b => String(b.BranchID)) :
                 values.branches || [],
      };
      // Log payload for debugging
      console.log('Payload sent to backend:', payload);

      // Define API URL
      const url = `${BASE_URL}/fetch_useraccount.php`;
      // Determine HTTP method based on modal type
      const method = modalType === 'Add' ? 'POST' : 
                    modalType === 'Edit' ? 'PUT' : 
                    'DELETE';

      // Send API request
      const res = await fetch(url, {
        // Set HTTP method
        method,
        // Set content type header
        headers: { "Content-Type": "application/json" },
        // Send payload as JSON
        body: JSON.stringify(payload),
      });

      // Parse response as JSON
      const data = await res.json();
      // Check if operation failed
      if (!data.success) throw new Error(data.error || "Operation failed");

      // Show success message
      message.success(`User ${modalType}ed successfully!`);
      // Hide modal
      setIsModalOpen(false);
      // Reset form
      form.resetFields();
      // Clear selected user
      setSelectedUser(null);
      // Clear selected role
      setSelectedRole('');
      // Refresh data
      fetchData();
    } catch (err) {
      // Log error for debugging
      console.error('HandleOk Error:', err);
      // Show error message
      message.error(err.message || "Failed to update employee: Please ensure all required fields are completed correctly.");
    } finally {
      // Set loading state to false
      setLoading(false);
    }
  };

  // Handle modal cancel button click
  const handleCancel = () => {
    // Hide modal
    setIsModalOpen(false);
    // Reset form
    form.resetFields();
    // Clear selected user
    setSelectedUser(null);
    // Clear selected role
    setSelectedRole('');
  };

  // Handle role selection change in form
  const handleRoleChange = (role) => {
    // Update selected role state
    setSelectedRole(role);
    // If System Administrator, clear branches
    if (role === 'System Administrator') {
      form.setFieldsValue({ branches: [] });
    // If Payroll Admin, select all branches
    } else if (role === 'Payroll Admin') {
      form.setFieldsValue({ branches: branches.map(branch => String(branch.BranchID)) });
    // If Payroll Staff, keep current branches
    } else if (role === 'Payroll Staff') {
      form.setFieldsValue({ branches: form.getFieldValue('branches') || [] });
    }
  };

  // Get branch names from branch IDs
  const getBranchNames = (branchIds) => {
    // Return 'None' if no branches
    if (!branchIds || branchIds === 'None') return 'None';
    // Split branch IDs by pipe
    const ids = branchIds.split('|');
    // Map IDs to branch names
    const names = ids.map(id => {
      // Find branch by ID
      const branch = branches.find(b => String(b.BranchID) === String(id));
      // Return branch name or unknown placeholder
      return branch ? branch.BranchName : `Unknown (${id})`;
    });
    // Join names with pipe separator
    return names.join(' | ');
  };

  // Validate that branches are not duplicated
  const validateNoDuplicateBranches = (_, value) => {
    // Check for duplicates if Payroll Staff
    if (selectedRole === 'Payroll Staff' && value) {
      // Create set to check uniqueness
      const uniqueBranches = new Set(value);
      // Reject if duplicates found
      if (uniqueBranches.size !== value.length) {
        return Promise.reject(new Error('Each branch can only be assigned once!'));
      }
    }
    // Resolve if valid
    return Promise.resolve();
  };

  // Validate username uniqueness
  const validateUniqueUsername = async (_, value) => {
    // Resolve if no value
    if (!value) return Promise.resolve();
    // Check if username exists
    const exists = await checkUsernameExists(value);
    // Reject if username exists and not editing same user
    if (exists && (modalType !== 'Edit' || (modalType === 'Edit' && selectedUser?.Username.toLowerCase() !== value.toLowerCase()))) {
      return Promise.reject(new Error('Username already exists!'));
    }
    // Resolve if valid
    return Promise.resolve();
  };

  // Validate email format and uniqueness
  const validateEmail = async (_, value) => {
    // Resolve if no value
    if (!value) return Promise.resolve();
    // Define email regex pattern
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Reject if email format is invalid
    if (!emailRegex.test(value)) {
      return Promise.reject(new Error('Please enter a valid email address!'));
    }
    // Check if email exists
    const exists = await checkEmailExists(value);
    // Reject if email exists and not editing same user
    if (exists && (modalType !== 'Edit' || (modalType === 'Edit' && selectedUser?.Email.toLowerCase() !== value.toLowerCase()))) {
      return Promise.reject(new Error('Email address already exists!'));
    }
    // Resolve if valid
    return Promise.resolve();
  };

  // Validate password strength
  const validatePasswordStrength = (_, value) => {
    // Allow empty password for Edit mode
    if (!value && modalType === 'Edit') return Promise.resolve();
    // Reject if no password
    if (!value) return Promise.reject(new Error('Please enter password!'));
    // Check minimum length
    const minLength = value.length >= 8;
    // Check for lowercase letters
    const hasLowercase = /[a-z]/.test(value);
    // Check for uppercase letters
    const hasUppercase = /[A-Z]/.test(value);
    // Check for numbers
    const hasNumber = /\d/.test(value);
    // Check for special characters
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);

    // Reject if password requirements not met
    if (!(minLength && hasLowercase && hasUppercase && hasNumber && hasSpecial)) {
      return Promise.reject(new Error(
        'Password must be at least 8 characters long and contain lowercase, uppercase, numbers, and special characters!'
      ));
    }
    // Resolve if valid
    return Promise.resolve();
  };

  // Validate name presence
  const validateName = (_, value) => {
    // Reject if no name
    if (!value) return Promise.reject(new Error('Please enter name!'));
    // Resolve if valid
    return Promise.resolve();
  };

  // Format date string to 12-hour format
  const formatDateTo12Hour = (dateString) => {
    // Return 'N/A' if no date
    if (!dateString) return 'N/A';
    // Create Date object from string
    const date = new Date(dateString);
    // Define formatting options
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    // Format date and replace 'at' with comma
    return date.toLocaleString('en-US', options).replace(' at ', ', ');
  };

  // Render component UI
  return (
    // Wrap component in ConfigProvider to set Poppins font globally
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="user-account-table">
        <Title level={2} style={{ marginBottom: 20 }}>User Account List</Title>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20, alignItems: 'center' }}>
          <Space direction={screenWidth < 768 ? 'vertical' : 'horizontal'}>
            <Select
              // Placeholder text for branch filter
              placeholder="Filter by Branch"
              // Allow clearing selection
              allowClear
              // Set width to 200px
              style={{ width: 200 }}
              // Update branch filter and reset page
              onChange={value => { setBranchFilter(value); setCurrentPage(1); }}
            >
              {branches.map(branch => (
                // Option for each branch
                <Option key={branch.BranchID} value={branch.BranchName}>{branch.BranchName}</Option>
              ))}
            </Select>
            
            <Select
              // Placeholder text for role filter
              placeholder="Filter by Role"
              // Allow clearing selection
              allowClear
              // Set width to 200px
              style={{ width: 200 }}
              // Update role filter and reset page
              onChange={value => { setRoleFilter(value); setCurrentPage(1); }}
            >
              <Option value="System Administrator">System Administrator</Option>
              <Option value="Payroll Admin">Payroll Admin</Option>
              <Option value="Payroll Staff">Payroll Staff</Option>
            </Select>
            
            <RangePicker
              // Update date range and reset page
              onChange={dates => { setDateRange(dates); setCurrentPage(1); }}
              // Set width to 250px
              style={{ width: 250 }}
            />
          </Space>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              // Add icon
              icon={<PlusOutlined />}
              // Set button size
              size="middle"
              // Apply custom styles
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
              // Open Add modal
              onClick={() => openModal('Add')}
            >
              {showLabels && 'Add User'}
            </Button>
            
            <Input
              // Placeholder text
              placeholder="Search user"
              // Allow clearing input
              allowClear
              // Bind to search text state
              value={searchText}
              // Update search text on change
              onChange={(e) => handleSearch(e.target.value)}
              // Add search icon prefix
              prefix={<SearchOutlined />}
              // Set responsive width
              style={{ width: screenWidth < 480 ? '100%' : '250px' }}
            />
          </div>
        </div>

        <Table
          // Set data source to filtered data
          dataSource={filteredData}
          // Add borders to table
          bordered
          // Enable horizontal scrolling
          scroll={{ x: true }}
          // Show loading indicator
          loading={loading}
          // Disable built-in pagination
          pagination={false}
        >
          <Column 
            // Set column title
            title="Name" 
            // Bind to Name field
            dataIndex="Name" 
            // Set unique key
            key="Name" 
            // Enable sorting by name
            sorter={(a, b) => a.Name.localeCompare(b.Name)} 
          />
          <Column 
            // Set column title
            title="Username" 
            // Bind to Username field
            dataIndex="Username" 
            // Set unique key
            key="Username" 
            // Enable sorting by username
            sorter={(a, b) => a.Username.localeCompare(b.Username)} 
          />
          <Column 
            // Set column title
            title="Role" 
            // Bind to Role field
            dataIndex="Role" 
            // Set unique key
            key="Role" 
            // Enable sorting by role
            sorter={(a, b) => a.Role.localeCompare(b.Role)} 
          />
          <Column 
            // Set column title
            title="Email" 
            // Bind to Email field
            dataIndex="Email" 
            // Set unique key
            key="Email" 
            // Enable sorting by email
            sorter={(a, b) => a.Email.localeCompare(b.Email)} 
          />
          <Column
            // Set column title
            title="Branch"
            // Bind to Branches field
            dataIndex="Branches"
            // Set unique key
            key="Branches"
            // Enable sorting by branches
            sorter={(a, b) => a.Branches.localeCompare(b.Branches)}
            // Custom render function for branch display
            render={(branches, record) => {
              // Show 'None' for System Administrator
              if (record.Role === 'System Administrator') return <Tag color="blue">None</Tag>;
              // Show 'All Branches' for Payroll Admin
              if (record.Role === 'Payroll Admin') return <Tag color="blue">All Branches</Tag>;
              // Get branch names
              const branchNames = getBranchNames(branches);
              // Show 'None' if no branches
              if (branchNames === 'None') return <Tag color="blue">None</Tag>;
              // Display branch names as tags
              return (
                <Space wrap>
                  {branchNames.split('|').map((branch, index) => (
                    // Tag for each branch
                    <Tag key={index} color="blue">{branch}</Tag>
                  ))}
                </Space>
              );
            }}
          />
          <Column 
            // Set column title
            title="Created On"
            // Bind to CreatedOn field
            dataIndex="CreatedOn"
            // Set unique key
            key="CreatedOn"
            // Enable sorting by date
            sorter={(a, b) => new Date(a.CreatedOn) - new Date(b.CreatedOn)}
            // Format date for display
            render={(createdOn) => formatDateTo12Hour(createdOn)}
          />
          <Column
            // Set column title
            title="Action"
            // Set unique key
            key="action"
            // Custom render function for action buttons
            render={(_, record) => (
              // Space component to layout buttons
              <Space size={7} wrap>
                <Tooltip title="View">
                  <Button
                    // Set view icon
                    icon={<EyeOutlined />}
                    // Set button size
                    size="middle"
                    // Apply styles
                    style={{
                      width: '40px',
                      backgroundColor: '#52c41a',
                      borderColor: '#52c41a',
                      color: 'white'
                    }}
                    // Open View modal
                    onClick={() => openModal('View', record)}
                  />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button
                    // Set edit icon
                    icon={<EditOutlined />}
                    // Set button size
                    size="middle"
                    // Apply styles
                    style={{
                      width: '40px',
                      backgroundColor: '#722ed1',
                      borderColor: '#722ed1',
                      color: 'white'
                    }}
                    // Open Edit modal
                    onClick={() => openModal('Edit', record)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    // Set delete icon
                    icon={<DeleteOutlined />}
                    // Set button size
                    size="middle"
                    // Apply styles
                    style={{
                      width: '40px',
                      backgroundColor: '#ff4d4f',
                      borderColor: '#ff4d4f',
                      color: 'white'
                    }}
                    // Open Delete modal
                    onClick={() => openModal('Delete', record)}
                  />
                </Tooltip>
              </Space>
            )}
          />
        </Table>

        <Pagination
          // Set current page
          current={currentPage}
          // Set page size
          pageSize={pageSize}
          // Set total items
          total={totalItems}
          // Handle page changes
          onChange={handlePageChange}
          // Show page size changer
          showSizeChanger
          // Show quick jumper
          showQuickJumper
          // Display total items
          showTotal={total => `Total ${total} user records`}
          // Set page size options
          pageSizeOptions={['10', '20', '50', '100']}
          // Apply styles
          style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center' }}
        />

        <Modal
          // Set modal title based on type
          title={<span style={{ fontSize: '22px', fontWeight: 'bold' }}>
            {modalType === 'Add' ? 'Add a New User' :
             modalType === 'Edit' ? 'Edit User Details' :
             modalType === 'View' ? 'View User Information' :
             'Confirm User Deletion'}
          </span>}
          // Control modal visibility
          open={isModalOpen}
          // Handle OK button (Cancel for View mode)
          onOk={modalType === 'View' ? handleCancel : handleOk}
          // Handle Cancel button
          onCancel={handleCancel}
          // Set OK button text
          okText={modalType === 'Delete' ? 'Delete' : 'OK'}
          // Set OK button properties
          okButtonProps={{ danger: modalType === 'Delete', loading: loading, style: modalType !== 'Delete' ? { backgroundColor: '#0023B0', borderColor: '#0023B0' } : {} }}
          // Set modal width
          width={600}
          // Center modal
          centered
          // Apply class for delete modal
          className={modalType === 'Delete' ? 'delete-modal' : ''}
          // Style modal body
          styles={{ minHeight: '100px', padding: '20px', margin: 20 }}
        >
          {modalType === 'Add' && (
            // Form component with vertical layout
            <Form form={form} layout="vertical">
              <Form.Item 
                // Label with required indicator
                label={<span>Name<span style={{ color: 'red' }}>*</span></span>}
                // Bind to name field
                name="name"
                // Apply validation rules
                rules={[{ validator: validateName }]}
                // Validate on change
                validateTrigger="onChange"
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter name" />
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Username<span style={{ color: 'red' }}>*</span></span>}
                // Bind to username field
                name="username"
                // Apply validation rules
                rules={[{ validator: validateUniqueUsername }]}
                // Validate on change and blur
                validateTrigger={['onChange', 'onBlur']}
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter username" />
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Role<span style={{ color: 'red' }}>*</span></span>}
                // Bind to role field
                name="role"
                // Require role selection
                rules={[{ required: true, message: 'Please select role!' }]}
                // Disable colon after label
                colon={false}
              >
                <Select 
                  // Placeholder text
                  placeholder="Select a role" 
                  // Handle role change
                  onChange={handleRoleChange}
                >
                  <Option value="System Administrator">System Administrator</Option>
                  <Option value="Payroll Admin">Payroll Admin</Option>
                  <Option value="Payroll Staff">Payroll Staff</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                // Label with conditional required indicator
                label={<span>Branch{selectedRole === 'Payroll Staff' && <span style={{ color: 'red' }}>*</span>}</span>}
                // Bind to branches field
                name="branches"
                // Apply validation rules
                rules={[
                  { required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' },
                  { validator: validateNoDuplicateBranches },
                ]}
                // Disable colon after label
                colon={false}
              >
                <Select
                  // Set placeholder based on role
                  placeholder={
                    selectedRole === 'System Administrator' ? 'None' :
                    selectedRole === 'Payroll Admin' ? 'All Branches' :
                    'Select a Role first!'
                  }
                  // Enable multiple selections
                  mode="multiple"
                  // Allow clearing for Payroll Staff
                  allowClear={selectedRole === 'Payroll Staff'}
                  // Disable for certain roles
                  disabled={!selectedRole || selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                  // Set value based on role
                  value={
                    selectedRole === 'Payroll Admin' ? branches.map(branch => String(branch.BranchID)) :
                    selectedRole === 'System Administrator' ? [] :
                    undefined
                  }
                >
                  {branches.map(branch => (
                    // Option for each branch
                    <Option key={branch.BranchID} value={String(branch.BranchID)}>{branch.BranchName}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Email<span style={{ color: 'red' }}>*</span></span>}
                // Bind to email field
                name="email"
                // Apply validation rules
                rules={[{ validator: validateEmail }]}
                // Validate on change and blur
                validateTrigger={['onChange', 'onBlur']}
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter email" />
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Password<span style={{ color: 'red' }}>*</span></span>}
                // Bind to password field
                name="password"
                // Apply validation rules
                rules={[{ validator: validatePasswordStrength }]}
                // Validate on change
                validateTrigger="onChange"
                // Disable colon after label
                colon={false}
              >
                <Input.Password placeholder="Enter password" />
              </Form.Item>
            </Form>
          )}

          {modalType === 'Edit' && (
            // Form component with vertical layout
            <Form form={form} layout="vertical">
              <Form.Item 
                // Label with required indicator
                label={<span>Name<span style={{ color: 'red' }}>*</span></span>}
                // Bind to name field
                name="name"
                // Apply validation rules
                rules={[{ validator: validateName }]}
                // Validate on change
                validateTrigger="onChange"
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter name" />
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Username<span style={{ color: 'red' }}>*</span></span>}
                // Bind to username field
                name="username"
                // Apply validation rules
                rules={[{ validator: validateUniqueUsername }]}
                // Validate on change and blur
                validateTrigger={['onChange', 'onBlur']}
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter username" />
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Role<span style={{ color: 'red' }}>*</span></span>}
                // Bind to role field
                name="role"
                // Require role selection
                rules={[{ required: true, message: 'Please select role!' }]}
                // Disable colon after label
                colon={false}
              >
                <Select 
                  // Placeholder text
                  placeholder="Select a role" 
                  // Handle role change
                  onChange={handleRoleChange}
                >
                  <Option value="System Administrator">System Administrator</Option>
                  <Option value="Payroll Admin">Payroll Admin</Option>
                  <Option value="Payroll Staff">Payroll Staff</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                // Label with conditional required indicator
                label={<span>Branch{selectedRole === 'Payroll Staff' && <span style={{ color: 'red' }}>*</span>}</span>}
                // Bind to branches field
                name="branches"
                // Apply validation rules
                rules={[
                  { required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' },
                  { validator: validateNoDuplicateBranches },
                ]}
                // Disable colon after label
                colon={false}
              >
                <Select
                  // Set placeholder based on role
                  placeholder={
                    selectedRole === 'System Administrator' ? 'None' :
                    selectedRole === 'Payroll Admin' ? 'All Branches' :
                    'Select branch(es)'
                  }
                  // Enable multiple selections
                  mode="multiple"
                  // Allow clearing for Payroll Staff
                  allowClear={selectedRole === 'Payroll Staff'}
                  // Disable for certain roles
                  disabled={selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                  // Set value based on role
                  value={
                    selectedRole === 'Payroll Admin' ? branches.map(branch => String(branch.BranchID)) :
                    selectedRole === 'System Administrator' ? [] :
                    undefined
                  }
                >
                  {branches.map(branch => (
                    // Option for each branch
                    <Option key={branch.BranchID} value={String(branch.BranchID)}>{branch.BranchName}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item 
                // Label with required indicator
                label={<span>Email<span style={{ color: 'red' }}>*</span></span>}
                // Bind to email field
                name="email"
                // Apply validation rules
                rules={[{ validator: validateEmail }]}
                // Validate on change and blur
                validateTrigger={['onChange', 'onBlur']}
                // Disable colon after label
                colon={false}
              >
                <Input placeholder="Enter email" />
              </Form.Item>
      
              <Form.Item 
                // Label without required indicator
                label={<span>Password (Optional)</span>}
                // Bind to password field
                name="password"
                // Apply validation rules
                rules={[{ validator: validatePasswordStrength }]}
                // Validate on change
                validateTrigger="onChange"
                // Disable colon after label
                colon={false}
              >
                <Input.Password placeholder="Enter new password or leave blank" />
              </Form.Item>
            </Form>
          )}

          {modalType === 'View' && (
            // Container for user details
            <div>
              <p><strong>Name:</strong> {selectedUser?.Name}</p>
              <p><strong>Username:</strong> {selectedUser?.Username}</p>
              <p><strong>Role:</strong> {selectedUser?.Role}</p>
              <Table
                dataSource={
                  selectedUser?.Role === 'System Administrator' ? [{ key: 'none', name: 'None' }] :
                  selectedUser?.Role === 'Payroll Admin' ? branches.map(branch => ({ key: branch.BranchID, name: branch.BranchName })) :
                  selectedUser?.Branches === 'None' ? [{ key: 'none', name: 'None' }] :
                  selectedUser?.Branches.split('|').map((id, index) => {
                    const branch = branches.find(b => String(b.BranchID) === String(id));
                    return { key: id, name: branch ? branch.BranchName : `Unknown (${id})` };
                  })
                }
                pagination={false}
                bordered
                size="small"
              >
                <Column
                  title="Assigned Branches"
                  dataIndex="name"
                  key="name"
                />
              </Table>
              <p><strong>Email:</strong> {selectedUser?.Email}</p>
              <p><strong>Created On:</strong> {formatDateTo12Hour(selectedUser?.CreatedOn)}</p>
            </div>
          )}

          {modalType === 'Delete' && (
            // Container for delete confirmation
            <div>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                ⚠️ Are you sure you want to delete this user?
              </p>
              <p>
                This action <strong>cannot be undone</strong>.
                The user "<strong>{selectedUser?.Name}</strong>" will be permanently removed 
                including all their <strong>Activity Records</strong> that they have.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
};

// Export the component for use in other parts of the application
export default UserAccountTable;