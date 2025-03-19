import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Typography } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;
const { Title } = Typography;

const BranchesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
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
        console.log("Fetched Data:", data);
        setData(data);
        setFilteredData(data);
      })
      .catch((err) => console.error("Error fetching branches:", err));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showLabels = screenWidth >= 600;

  // Search functionality across BranchName, BranchAddress, and BranchContact
  const handleSearch = (value) => {
    const filtered = data.filter((item) =>
      item.BranchName.toLowerCase().includes(value.toLowerCase()) ||
      item.BranchAddress.toLowerCase().includes(value.toLowerCase()) ||
      item.BranchContact.toLowerCase().includes(value.toLowerCase())
    );
    setSearchText(value);
    setFilteredData(filtered);
  };

  // Open modal for Add, Edit, View, or Delete
  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedBranch(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      form.setFieldsValue({
        branchName: record.BranchName,
        branchAddress: record.BranchAddress,
        branchContact: record.BranchContact,
      });
    } else if (type === 'Add') {
      form.resetFields();
    }
  };

  // Handle Add, Edit, or Delete operations
  const handleOk = () => {
    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchName: values.branchName,
              branchAddress: values.branchAddress,
              branchContact: values.branchContact,
            }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Network response was not ok");
              return res.json();
            })
            .then((data) => {
              message.success("Branch added successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to add branch. Please try again.");
            });
        })
        .catch((errorInfo) => console.log("Validation Failed:", errorInfo));
    } else if (modalType === "Edit" && selectedBranch) {
      form.validateFields()
        .then((values) => {
          fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchID: selectedBranch.key,
              branchName: values.branchName,
              branchAddress: values.branchAddress,
              branchContact: values.branchContact,
            }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Network response was not ok");
              return res.json();
            })
            .then((data) => {
              message.success("Branch updated successfully!");
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => {
              console.error("Error:", err);
              message.error("Failed to update branch. Please try again.");
            });
        })
        .catch((errorInfo) => console.log("Validation Failed:", errorInfo));
    } else if (modalType === "Delete" && selectedBranch) {
      fetch("http://localhost/UserTableDB/UserDB/fetch_branches.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchID: selectedBranch.key }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then((data) => {
          message.success("Branch deleted successfully!");
          setIsModalOpen(false);
          fetchData();
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
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Branches
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
            color: 'white', 
            fontFamily: 'Poppins, sans-serif' 
          }}
          onClick={() => openModal('Add')}
        >
          {showLabels && 'Add Branch'}
        </Button>
        <Input
          placeholder="Search Branch"
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ 
            width: screenWidth < 480 ? '100%' : '250px', 
            marginTop: screenWidth < 480 ? 10 : 0, 
            fontFamily: 'Poppins, sans-serif' 
          }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={{ responsive: true, position: ['bottomCenter'] }}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title="Branch Name" 
          dataIndex="BranchName" 
          key="BranchName" 
          sorter={(a, b) => a.BranchName.localeCompare(b.BranchName)}
          render={(text) => (
            <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>
          )}
        />
        <Column 
          title="Branch Address" 
          dataIndex="BranchAddress" 
          key="BranchAddress" 
          sorter={(a, b) => a.BranchAddress.localeCompare(b.BranchAddress)}
          render={(text) => (
            <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>
          )}
        />
        <Column 
          title="Branch Contact" 
          dataIndex="BranchContact" 
          key="BranchContact" 
          sorter={(a, b) => a.BranchContact.localeCompare(b.BranchContact)}
          render={(text) => (
            <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>
          )}
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
                  color: 'white', 
                  fontFamily: 'Poppins, sans-serif' 
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
                  color: 'white', 
                  fontFamily: 'Poppins, sans-serif' 
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
                  color: 'white', 
                  fontFamily: 'Poppins, sans-serif' 
                }}
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && 'Delete'}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Modal 
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Branch' :
               modalType === 'Edit' ? 'Edit Branch Details' :
               modalType === 'View' ? 'View Branch Information' :
               'Confirm Branch Deletion'}
            </span>
          </div>
        }
        visible={isModalOpen}
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ 
          danger: modalType === 'Delete', 
          style: { fontFamily: 'Poppins, sans-serif' } 
        }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        bodyStyle={{ minHeight: '200px', padding: '20px', margin: 20 }}
      >
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter branch name!' }]}
            >
              <Input 
                placeholder="e.g., Kia, Cebu Branch" 
                style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item
              label="Branch Address"
              name="branchAddress"
              rules={[{ required: true, message: 'Please enter branch address!' }]}
            >
              <Input 
                placeholder="e.g., 123 Main St, Cebu City" 
                style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item
              label="Branch Contact"
              name="branchContact"
              rules={[{ required: true, message: 'Please enter branch contact!' }]}
            >
              <Input 
                placeholder="e.g., +63-912-345-6789" 
                style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'Edit' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter branch name!' }]}
            >
              <Input style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item
              label="Branch Address"
              name="branchAddress"
              rules={[{ required: true, message: 'Please enter branch address!' }]}
            >
              <Input style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item
              label="Branch Contact"
              name="branchContact"
              rules={[{ required: true, message: 'Please enter branch contact!' }]}
            >
              <Input style={{ border: '1px solid black', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10 }}>Branch Details:</p>
            <p><strong>Name:</strong> {selectedBranch?.BranchName}</p>
            <p><strong>Address:</strong> {selectedBranch?.BranchAddress}</p>
            <p><strong>Contact:</strong> {selectedBranch?.BranchContact}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this branch?
            </p>
            <p>This action <strong>cannot be undone</strong>. The branch "<strong>{selectedBranch?.BranchName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BranchesTable;