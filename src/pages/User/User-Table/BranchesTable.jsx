import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;

const BranchesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]); // Original data
  const [filteredData, setFilteredData] = useState([]); // Filtered data
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [form] = Form.useForm();

  // Fetch data from the database
  const fetchData = () => {
    fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched Data:", data); // Log fetched data
        setData(data);
        setFilteredData(data); // Initialize filteredData with the fetched data
      })
      .catch((err) => console.error("Error fetching branches:", err));
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
      item.BranchName.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Open modal for Add, Edit, View, or Delete
  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record); // Log modal type and record
    setModalType(type);
    setSelectedBranch(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      form.setFieldsValue({ branchName: record.BranchName });
    }
  };

  // Handle Add, Edit, or Delete operations
  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          console.log("Add Payload:", values); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branchName: values.branchName }),
          })
            .then((res) => {
              console.log("Add Response Status:", res.status); // Log response status
              if (!res.ok) {
                throw new Error("Network response was not ok");
              }
              return res.json();
            })
            .then((data) => {
              console.log("Add Response Data:", data); // Log response data
              message.success("Branch added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after adding
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to add branch. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Edit" && selectedBranch) {
      form.validateFields()
        .then((values) => {
          console.log("Edit Payload:", values); // Log payload
          fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchID: selectedBranch.key,
              branchName: values.branchName,
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
              message.success("Branch updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData(); // Refetch data after editing
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to update branch. Please try again.");
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo); // Log validation errors
        });
    } else if (modalType === "Delete" && selectedBranch) {
      console.log("Delete Payload:", selectedBranch.key); // Log payload
      fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchID: selectedBranch.key }),
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
          message.success("Branch deleted successfully!");
          setIsModalOpen(false);
          fetchData(); // Refetch data after deleting
        })
        .catch((err) => {
          console.error("Error:", err);
          message.error("Failed to delete branch. Please try again.");
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
          {showLabels && 'Add Branch'} 
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
          title="Branch Name" 
          dataIndex="BranchName"  // Match the key in your PHP response
          key="BranchName" 
          sorter={(a, b) => a.BranchName.localeCompare(b.BranchName)}
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
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {modalType === 'Add' ? 'Add New Branch' :
              modalType === 'Edit' ? 'Edit Branch Details' :
              modalType === 'View' ? 'View Branch Information' :
              'Confirm Employee Deletion'}
            </span>
          </div>
        }
        visible={isModalOpen}  // Use 'visible' instead of 'open'
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
            <Form form={form} layout="vertical">
              <Form.Item
                label="Branch Name"
                name="branchName"
                rules={[{ required: true, message: 'Please enter branch name!' }]}
              >
                <Input 
                  placeholder="e.g., Kia, Cebu Branch"  
                  className="custom-input"
                  style={{ border: '1px solid black' }} 
                />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'Edit' && (
          <>
            <Form form={form} layout="vertical">
              <Form.Item
                label="Branch Name"
                name="branchName"
                rules={[{ required: true, message: 'Please enter branch name!' }]}
              >
                <Input />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'View' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10}}>Branch Details:</p>
            <p><strong>Name:</strong> {selectedBranch?.BranchName}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this branch?
            </p>
            <p>This action <strong>cannot be undone</strong>. The branch "<strong>{selectedBranch?.BranchName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default BranchesTable;