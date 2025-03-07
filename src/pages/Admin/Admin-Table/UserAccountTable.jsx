import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Select } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './AdminTable.css';

const { Column } = Table;
const { Option } = Select;

const UserAccountTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]); // Original data
  const [filteredData, setFilteredData] = useState([]); // Filtered data
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedUserAccount, setSelectedUserAccount] = useState(null);
  const [form] = Form.useForm();

  // Fetch data from the database
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

  useEffect(() => {
    fetchData(); // Fetch data on component mount
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
    console.log("Opening Modal:", type, record); // Log modal type and record
    setModalType(type);
    setSelectedUserAccount(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      form.setFieldsValue({
        name: record.Name,
        username: record.Username,
        role: record.Role,
        email: record.Email,
      });
    } else if (type === 'Add') {
      form.resetFields(); // Clear form for Add modal
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
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            message.success("User added successfully!");
            setIsModalOpen(false);
            form.resetFields();
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
          console.log("Edit Payload:", values); // Log payload
          fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              UserID: selectedUserAccount.key, // Ensure UserID is passed correctly
              name: values.name,
              username: values.username,
              role: values.role,
              email: values.email,
              password: values.password, // Only include if password is provided
            }),
          })
            .then((res) => {
              console.log("Edit Response Status:", res.status); // Log response status
              if (!res.ok) {
                throw new Error("Network response was not ok");
              }
              return res.json();
            })
            .then((data) => {
              console.log("Edit Response Data:", data); // Log response data
              message.success("User updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after editing
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to update user. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Delete" && selectedUserAccount) {
      console.log("Delete Payload:", selectedUserAccount.key); // Log payload
      fetch("http://localhost/AdminTableDB/AdminDB/fetch_useraccount.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ UserID: selectedUserAccount.key }), // Ensure UserID is passed correctly
      })
        .then((res) => {
          console.log("Delete Response Status:", res.status); // Log response status
          if (!res.ok) {
            throw new Error("Network response was not ok");
          }
          return res.json();
        })
        .then((data) => {
          console.log("Delete Response Data:", data); // Log response data
          message.success("User deleted successfully!");
          setIsModalOpen(false);
          fetchData(); // Refetch data after deleting
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
  };

  return (
    <>
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
          placeholder="Search..."
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
        title= <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
          {
            modalType === 'Add' ? 'Add a New User' :
            modalType === 'Edit' ? 'Edit User Details' :
            modalType === 'View' ? 'View User Information' :
            'Confirm User Deletion'
          } </span>
        visible={isModalOpen} 
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600}
        centered
        bodyStyle={{ minHeight: '100px', padding: '20px', margin: 20 }}
      >
        {modalType === 'Add' && (
          <>
            <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '18px' }}>
              Enter the details of the new user:
            </p>
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
                <Select placeholder="Select a role">
                  <Option value="admin">Admin</Option>
                  <Option value="user">User</Option>
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
            <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '18px' }}>Modify the user details below:</p>
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
                <Select placeholder="Select a role">
                  <Option value="admin">Admin</Option>
                  <Option value="user">User</Option>
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
                rules={[{ required: true, message: 'Please enter password!' }]}
              >
                <Input.Password placeholder="Enter new password" />
              </Form.Item>
              <Form.Item
                label="Confirm Password"
                name="confirmPassword"
                rules={[{ required: true, message: 'Please confirm password!' }]}
              >
                <Input.Password placeholder="Confirm new password" />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'View' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10}}>User Details:</p>
            <p><strong>Name:</strong> {selectedUserAccount?.Name}</p>
            <p><strong>Username:</strong> {selectedUserAccount?.Username}</p>
            <p><strong>Role:</strong> {selectedUserAccount?.Role}</p>
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
    </>
  );
};

export default UserAccountTable;