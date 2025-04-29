import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Typography, Pagination } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;
const { Title, Text } = Typography;

const BranchesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [form] = Form.useForm();
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchUserData = async () => {
    const storedUserId = localStorage.getItem('userId');
    const storedRole = localStorage.getItem('role');

    if (!storedUserId || !storedRole) {
      console.error('Missing userId or role in localStorage');
      message.error('Please log in to view branches');
      return;
    }

    setUserId(storedUserId);
    setUserRole(storedRole);

    try {
      const url = `${API_BASE_URL}/fetch_branches.php?user_id=${storedUserId}&role=${encodeURIComponent(storedRole)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP error! Status: ${res.status} - ${text}`);
      }

      const response = await res.json();
      if (!response.success) {
        throw new Error(response.error || "Failed to fetch branches from server");
      }

      const formattedData = response.data.map(item => ({
        key: item.BranchID,
        BranchID: item.BranchID,
        BranchName: item.BranchName,
        BranchAddress: item.BranchAddress,
        BranchContact: item.BranchContact,
      }));

      setData(formattedData);

      if (storedRole === 'Payroll Staff' && formattedData.length === 0) {
        message.warning('No assigned branch found for your account.');
      }

      const searchedData = formattedData.filter(item => {
        const searchLower = searchText.toLowerCase();
        return (
          item.BranchName.toLowerCase().includes(searchLower) ||
          item.BranchAddress.toLowerCase().includes(searchLower) ||
          item.BranchContact.toLowerCase().includes(searchLower)
        );
      });
      setFilteredData(searchedData);
    } catch (err) {
      console.error("Error fetching branches:", err.message);
      message.error("Failed to load branches: " + err.message);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [searchText]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showLabels = screenWidth >= 600;

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handlePageChange = (page, pageSize) => {
    setCurrentPage(page);
    setPageSize(pageSize);
  };

  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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

  const handleOk = async () => {
    if (modalType === 'Add') {
      form.validateFields()
        .then(async (values) => {
          const res = await fetch(`${API_BASE_URL}/fetch_branches.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              branchName: values.branchName,
              branchAddress: values.branchAddress,
              branchContact: values.branchContact,
            }),
          });
          const data = await res.json();

          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add branch');

          message.success('Branch added successfully!');
          setIsModalOpen(false);
          form.resetFields();
          fetchUserData();
        })
        .catch((err) => {
          console.error('Add Error:', err);
          message.error('Failed to add a branch: Please ensure all required fields are completed correctly.');
        });
    } else if (modalType === 'Edit' && selectedBranch) {
      form.validateFields()
        .then(async (values) => {
          const res = await fetch(`${API_BASE_URL}/fetch_branches.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              branchID: selectedBranch.key,
              branchName: values.branchName,
              branchAddress: values.branchAddress,
              branchContact: values.branchContact,
            }),
          });
          const data = await res.json();

          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update branch');

          message.success('Branch updated successfully!');
          setIsModalOpen(false);
          form.resetFields();
          fetchUserData();
        })
        .catch((err) => {
          console.error('Edit Error:', err);
          message.error('Failed to update branch: ' + err.message);
        });
    } else if (modalType === 'Delete' && selectedBranch) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_branches.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            branchID: selectedBranch.key,
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete branch');

        message.success('Branch deleted successfully!');
        setIsModalOpen(false);
        fetchUserData();
      } catch (err) {
        console.error('Delete Error:', err);
        message.error('Failed to delete branch: ' + err.message);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
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
        {userRole === 'Payroll Admin' && (
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
        )}
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

      {userRole === 'Payroll Staff' && filteredData.length === 0 && (
        <Text type="warning" style={{ display: 'block', marginBottom: 20, fontFamily: 'Poppins, sans-serif' }}>
        </Text>
      )}

      <Table
        dataSource={paginatedData}
        bordered
        scroll={{ x: true }}
        pagination={false}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Name</span>}
          dataIndex="BranchName"
          key="BranchName"
          sorter={(a, b) => a.BranchName.localeCompare(b.BranchName)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Address</span>}
          dataIndex="BranchAddress"
          key="BranchAddress"
          sorter={(a, b) => a.BranchAddress.localeCompare(b.BranchAddress)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Contact</span>}
          dataIndex="BranchContact"
          key="BranchContact"
          sorter={(a, b) => a.BranchContact.localeCompare(b.BranchContact)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
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

      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={filteredData.length}
        onChange={handlePageChange}
        showSizeChanger
        showQuickJumper
        showTotal={(total) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>Total {total} branch records</span>}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

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
        open={isModalOpen}
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        ottonProps={{
          danger: modalType === 'Delete',
          style: { fontFamily: 'Poppins, sans-serif' }
        }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        bodyStyle={{ minHeight: '180px', padding: '20px', margin: 20 }}
      >
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Name<span style={{ color: 'red' }}>*</span></span>}
              name="branchName"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch name!</span> }]}
            >
              <Input
                placeholder="e.g., Kia, Cebu Branch"
                style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Address<span style={{ color: 'red' }}>*</span></span>}
              name="branchAddress"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch address!</span> }]}
            >
              <Input
                placeholder="e.g., 123 Main St, Cebu City"
                style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Contact<span style={{ color: 'red' }}>*</span></span>}
              name="branchContact"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch contact!</span> }]}
            >
              <Input
                placeholder="e.g., +63-912-345-6789"
                style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'Edit' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Name<span style={{ color: 'red' }}>*</span></span>}
              name="branchName"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch name!</span> }]}
            >
              <Input style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Address<span style={{ color: 'red' }}>*</span></span>}
              name="branchAddress"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch address!</span> }]}
            >
              <Input style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch Contact<span style={{ color: 'red' }}>*</span></span>}
              name="branchContact"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter branch contact!</span> }]}
            >
              <Input style={{ border: '1px solid #d9d9d9', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Name:</strong> {selectedBranch?.BranchName}</p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Address:</strong> {selectedBranch?.BranchAddress}</p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}><strong style={{ fontFamily: 'Poppins, sans-serif' }}>Contact:</strong> {selectedBranch?.BranchContact}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this branch?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The branch "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedBranch?.BranchName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BranchesTable;