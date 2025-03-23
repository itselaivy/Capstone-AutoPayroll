import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Select, Typography, Tag } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './AdminTable.css';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const UserAccountTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]); // Original data
  const [filteredData, setFilteredData] = useState([]); // Filtered data
  const [branches, setBranches] = useState([]); // List of branches for dropdown
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedUserAccount, setSelectedUserAccount] = useState(null);
  const [selectedRole, setSelectedRole] = useState(''); // Track selected role in Add/Edit modal
  const [form] = Form.useForm();

  // Fetch user accounts from the database
  const fetchData = () => {
    fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched User Accounts:", data);
        setData(data);
        setFilteredData(data);
      })
      .catch((err) => console.error("Error fetching user accounts:", err));
  };

  // Fetch branches for the dropdown
  const fetchBranches = () => {
    fetch("http://localhost/AdminTableDB/AdminDB/fetch_userbranches.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Branches:", data);
        setBranches(data);
      })
      .catch((err) => console.error("Error fetching branches:", err));
  };

  useEffect(() => {
    fetchData(); // Fetch user accounts on component mount
    fetchBranches(); // Fetch branches on component mount
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showLabels = screenWidth >= 600;

  // Search functionality
  const handleSearch = (value) => {
    const filtered = data.filter((item) =>
      item.Name.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Open modal for Add, Edit, View, or Delete
  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    setModalType(type);
    setSelectedUserAccount(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      // Fetch the user's branches
      fetch(`http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php?UserID=${record.key}`)
        .then((res) => res.json())
        .then((data) => {
          const userBranches = data[0]?.Branches ? data[0].Branches.split('|') : [];
          const branchIDs = branches
            .filter(branch => userBranches.includes(branch.BranchName))
            .map(branch => branch.BranchID.toString());
          form.setFieldsValue({
            name: record.Name,
            username: record.Username,
            role: record.Role,
            email: record.Email,
            branches: branchIDs,
          });
          setSelectedRole(record.Role); // Set the role for conditional branch selection
          // Handle branch field based on role
          if (record.Role === 'System Administrator') {
            form.setFieldsValue({ branches: [] });
          } else if (record.Role === 'Payroll Admin') {
            form.setFieldsValue({ branches: branches.map(branch => branch.BranchID.toString()) });
          }
        });
    } else if (type === 'Add') {
      form.resetFields();
      setSelectedRole(''); // Reset role for Add modal
    }
  };

  // Handle Add, Edit, or Delete operations
  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields().then((values) => {
        fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            username: values.username,
            role: values.role,
            email: values.email,
            password: values.password,
            branches: values.branches, // Send selected branches
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            message.success("User added successfully!");
            setIsModalOpen(false);
            form.resetFields();
            setSelectedRole('');
            fetchData();
          })
          .catch(() => message.error("Failed to add user."));
      });
    } else if (modalType === "Edit" && selectedUserAccount) {
      form.validateFields()
        .then((values) => {
          if (values.password && values.password !== values.confirmPassword) {
            message.error("Passwords do not match!");
            return;
          }
          fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              UserID: selectedUserAccount.key,
              name: values.name,
              username: values.username,
              role: values.role,
              email: values.email,
              password: values.password,
              branches: values.branches, // Send updated branches
            }),
          })
            .then((res) => {
              if (!res.ok) {
                throw new Error("Network response was not ok");
              }
              return res.json();
            })
            .then((data) => {
              message.success("User updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              setSelectedRole('');
              fetchData();
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to update user. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo);
        });
    } else if (modalType === "Delete" && selectedUserAccount) {
      fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ UserID: selectedUserAccount.key }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Network response was not ok");
          }
          return res.json();
        })
        .then((data) => {
          message.success("User deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        })
        .catch((err) => {
          console.error("Error:", err);
          message.error("Failed to delete user. Please try again.");
        });
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setSelectedRole('');
  };

  // Handle role change to toggle branch selection mode
  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (role === 'System Administrator') {
      form.setFieldsValue({ branches: [] }); // Clear branches for System Administrator
    } else if (role === 'Payroll Admin') {
      form.setFieldsValue({ branches: branches.map(branch => branch.BranchID.toString()) }); // Select all branches
    } else if (role === 'Payroll Staff') {
      form.setFieldsValue({ branches: [] }); // Reset branches for Payroll Staff
    }
  };

  return (
    <div className="user-account-table">
      {/* Title */}
      <Title level={2} style={{ marginBottom: 20 }}>
        User Account List
      </Title>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'right', 
        alignItems: 'center', 
        gap: 16, 
        marginBottom: 20,
        flexWrap: 'wrap' 
      }}>
        <Button
          icon={<PlusOutlined />}
          size="middle"
          style={{ 
            backgroundColor: '#2C3743', 
            borderColor: '#2C3743', 
            color: 'white'
          }}
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
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={{ 
          responsive: true,
          position: ['bottomCenter']
        }}
      >
        <Column 
          title="Name" 
          dataIndex="Name" 
          key="Name" 
          sorter={(a, b) => a.Name.localeCompare(b.Name)}
        />
        <Column 
          title="Username" 
          dataIndex="Username" 
          key="Username" 
          sorter={(a, b) => a.Username.localeCompare(b.Username)}
        />
        <Column 
          title="Role" 
          dataIndex="Role" 
          key="Role" 
          sorter={(a, b) => a.Role.localeCompare(b.Role)}
        />
        <Column 
          title="Email" 
          dataIndex="Email" 
          key="Email" 
          sorter={(a, b) => a.Email.localeCompare(b.Email)}
        />
        <Column 
          title="Branch" 
          dataIndex="Branches" 
          key="Branches" 
          sorter={(a, b) => a.Branches.localeCompare(b.Branches)}
          render={(branches, record) => {
            // For System Administrator and Payroll Admin, show "All Branches" as a single tag
            if (record.Role === 'System Administrator' || record.Role === 'Payroll Admin') {
              return (
                <Space wrap>
                  <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    All Branches
                  </Tag>
                </Space>
              );
            }
            // For Payroll Staff or when branches is "None", handle accordingly
            if (branches === 'None') {
              return (
                <Space wrap>
                  <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    None
                  </Tag>
                </Space>
              );
            }
            // Split the branches string using the new delimiter and render each as a tag
            console.log("Raw Branches string for", record.Name, ":", branches);
            const branchList = branches.split('|').filter(branch => branch.trim() !== '');
            console.log("Branch List after split for", record.Name, ":", branchList);
            return (
              <Space wrap>
                {branchList.map((branch, index) => (
                  <Tag key={index} color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {branch}
                  </Tag>
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
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap>
              <Button
                icon={<EyeOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#52c41a', 
                  borderColor: '#52c41a', 
                  color: 'white'
                }}
                onClick={() => openModal('View', record)}
              >
                {showLabels && 'View'}
              </Button>
              <Button
                icon={<EditOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#722ed1', 
                  borderColor: '#722ed1', 
                  color: 'white'
                }}
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="middle"
                style={{ 
                  backgroundColor: '#ff4d4f', 
                  borderColor: '#ff4d4f', 
                  color: 'white'
                }}
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      {/* Modal for Add, View, Edit, Delete */}
      <Modal 
        title={<span style={{ fontSize: '22px', fontWeight: 'bold' }}>
          {
            modalType === 'Add' ? 'Add a New User' :
            modalType === 'Edit' ? 'Edit User Details' :
            modalType === 'View' ? 'View User Information' :
            'Confirm User Deletion'
          }
        </span>}
        visible={isModalOpen} 
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600}
        centered
        className={modalType === 'Delete' ? 'delete-modal' : ''}
        bodyStyle={{ minHeight: '100px', padding: '20px', margin: 20 }}
      >
        {modalType === 'Add' && (
          <>
            <Form form={form} layout="vertical">
              <Form.Item
                label="Name"
                name="name"
                rules={[{ required: true, message: 'Please enter name!' }]}
              >
                <Input placeholder="e.g., John Doe" />
              </Form.Item>
              <Form.Item
                label="Username"
                name="username"
                rules={[{ required: true, message: 'Please enter username!' }]}
              >
                <Input placeholder="e.g., johndoe123" />
              </Form.Item>
              <Form.Item
                label="Role"
                name="role"
                rules={[{ required: true, message: 'Please select role!' }]}
              >
                <Select placeholder="Select a role" onChange={handleRoleChange}>
                  <Option value="System Administrator">System Administrator</Option>
                  <Option value="Payroll Admin">Payroll Admin</Option>
                  <Option value="Payroll Staff">Payroll Staff</Option>
                </Select>
              </Form.Item>
              <Form.Item
                label="Branch"
                name="branches"
                rules={[{ required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' }]}
              >
                <Select
                  placeholder={
                    selectedRole === 'System Administrator' ? 'All Branches (Disabled)' :
                    selectedRole === 'Payroll Admin' ? 'All Branches (Auto-Selected)' :
                    'Select branch(es)'
                  }
                  mode={selectedRole === 'Payroll Staff' ? 'multiple' : 'multiple'}
                  allowClear={selectedRole === 'Payroll Staff'}
                  disabled={selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                >
                  {branches.map(branch => (
                    <Option key={branch.BranchID} value={branch.BranchID.toString()}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="Email"
                name="email"
                rules={[{ required: true, message: 'Please enter email!' }]}
              >
                <Input placeholder="e.g., johndoe@example.com" />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Please enter password!' }]}
              >
                <Input.Password placeholder="Enter password" />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'Edit' && (
          <>
            <Form form={form} layout="vertical">
              <Form.Item
                label="Name"
                name="name"
                rules={[{ required: true, message: 'Please enter name!' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label="Username"
                name="username"
                rules={[{ required: true, message: 'Please enter username!' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label="Role"
                name="role"
                rules={[{ required: true, message: 'Please select role!' }]}
              >
                <Select placeholder="Select a role" onChange={handleRoleChange}>
                  <Option value="System Administrator">System Administrator</Option>
                  <Option value="Payroll Admin">Payroll Admin</Option>
                  <Option value="Payroll Staff">Payroll Staff</Option>
                </Select>
              </Form.Item>
              <Form.Item
                label="Branch"
                name="branches"
                rules={[{ required: selectedRole === 'Payroll Staff', message: 'Please select at least one branch!' }]}
              >
                <Select
                  placeholder={
                    selectedRole === 'System Administrator' ? 'All Branches (Disabled)' :
                    selectedRole === 'Payroll Admin' ? 'All Branches (Auto-Selected)' :
                    'Select branch(es)'
                  }
                  mode={selectedRole === 'Payroll Staff' ? 'multiple' : 'multiple'}
                  allowClear={selectedRole === 'Payroll Staff'}
                  disabled={selectedRole === 'System Administrator' || selectedRole === 'Payroll Admin'}
                >
                  {branches.map(branch => (
                    <Option key={branch.BranchID} value={branch.BranchID.toString()}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="Email"
                name="email"
                rules={[{ required: true, message: 'Please enter email!' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
              >
                <Input.Password placeholder="Enter new password (optional)" />
              </Form.Item>
              <Form.Item
                label="Confirm Password"
                name="confirmPassword"
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Passwords do not match!'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Confirm new password" />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'View' && (
          <div>
            <p><strong>Name:</strong> {selectedUserAccount?.Name}</p>
            <p><strong>Username:</strong> {selectedUserAccount?.Username}</p>
            <p><strong>Role:</strong> {selectedUserAccount?.Role}</p>
            <p><strong>Branch:</strong> {selectedUserAccount?.Branches}</p>
            <p><strong>Email:</strong> {selectedUserAccount?.Email}</p>
            <p><strong>Created On:</strong> {selectedUserAccount?.CreatedOn}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this user?
            </p>
            <p>This action <strong>cannot be undone</strong>. The user "<strong>{selectedUserAccount?.Name}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserAccountTable;