import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Tag, Radio, Typography, Pagination, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const AllowancesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deleteOption, setDeleteOption] = useState('all');
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null); // Default to null for "All Branches"

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  const fetchDropdownData = async () => {
    setLoading(true);
    try {
      if (!userId || !role) throw new Error('Missing userId or role');
      const [employeesRes, branchesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_allowances.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_allowances.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`)
      ]);

      if (!employeesRes.ok || !branchesRes.ok || !assignedBranchesRes.ok) {
        throw new Error('Failed to fetch dropdown data');
      }

      const [employeesData, branchesData, assignedBranchesData] = await Promise.all([
        employeesRes.json(),
        branchesRes.json(),
        assignedBranchesRes.json()
      ]);

      setEmployees(employeesData);
      setBranches(branchesData);
      setAssignedBranches(assignedBranchesData.data || []);
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      if (!userId || !role) {
        message.error('Please log in to view allowances');
        return;
      }

      const url = `${API_BASE_URL}/fetch_allowances.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}${selectedBranch ? `&branch_id=${selectedBranch}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Allowances fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch allowances');

      const mappedRawData = response.data.map(allowance => ({
        key: allowance.AllowanceID,
        employeeId: allowance.EmployeeID,
        employeeName: allowance.EmployeeName,
        branchId: allowance.BranchID,
        branchName: allowance.BranchName,
        description: allowance.Description,
        amount: parseFloat(allowance.Amount).toFixed(2),
      }));
      setRawData(mappedRawData);

      const groupedData = Object.values(
        response.data.reduce((acc, allowance) => {
          const { EmployeeID, EmployeeName, BranchID, BranchName, AllowanceID, Description, Amount } = allowance;
          if (!acc[EmployeeID]) {
            acc[EmployeeID] = {
              key: EmployeeID,
              employeeId: EmployeeID,
              employeeName: EmployeeName,
              branchId: BranchID,
              branchName: BranchName,
              allowances: [],
              totalAmount: 0,
            };
          }
          acc[EmployeeID].allowances.push({
            allowanceId: AllowanceID,
            description: Description,
            amount: parseFloat(Amount).toFixed(2),
          });
          acc[EmployeeID].totalAmount += parseFloat(Amount);
          return acc;
        }, {})
      );

      setOriginalData(groupedData);
      setFilteredData(groupedData);
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(groupedData.length);
    } catch (err) {
      console.error("Fetch Allowances Error:", err.message);
      message.error(`Failed to load allowances data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
    const lowerValue = value.toLowerCase().trim();
    let filtered = originalData;
    if (lowerValue) {
      filtered = originalData.filter(item =>
        item.employeeId.toString().toLowerCase().includes(lowerValue) ||
        item.employeeName.toLowerCase().includes(lowerValue) ||
        item.branchName.toLowerCase().includes(lowerValue) ||
        item.allowances.some(a => a.description.toLowerCase().includes(lowerValue))
      );
    }
    setFilteredData(filtered);
    setFilteredPaginationTotal(filtered.length);
    setSearchText(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

  const handleBranchFilterChange = (value) => {
    setSelectedBranch(value === 'all' ? null : value);
    setCurrentPage(1);
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedEmployee(record);
    setDeleteOption('all');
    if (type === "Edit" && record) {
      form.setFieldsValue({
        allowances: record.allowances.map(a => ({
          allowanceId: a.allowanceId,
          description: a.description,
          amount: a.amount,
        })),
      });
    } else if (type === "Add") {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const checkDuplicateAllowance = (employeeId, description) => {
    return rawData.some(
      (record) =>
        Number(record.employeeId) === Number(employeeId) &&
        record.description.trim().toLowerCase() === description.trim().toLowerCase()
    );
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add") {
      try {
        const values = await form.validateFields();
        const { employeeId, description } = values;

        if (checkDuplicateAllowance(employeeId, description)) {
          message.warning("Warning: An employee with this allowance record already exists.");
          return;
        }

        const payload = {
          EmployeeID: employeeId,
          Description: description,
          Amount: parseFloat(values.amount).toFixed(2),
          user_id: userId,
        };

        const res = await fetch(`${API_BASE_URL}/fetch_allowances.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        const data = await res.json();

        if (data.success) {
          message.success("Allowance added successfully!");
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else {
          throw new Error(data.error || "Failed to add allowance");
        }
      } catch (err) {
        message.error(`Failed to add allowance: ${err.message || 'Validation failed'}`);
      }
    } else if (modalType === "Edit" && selectedEmployee) {
      form.validateFields()
        .then((values) => {
          const payloads = values.allowances.map(allowance => ({
            AllowanceID: allowance.allowanceId,
            EmployeeID: selectedEmployee.employeeId,
            Description: allowance.description,
            Amount: parseFloat(allowance.amount).toFixed(2),
            user_id: userId,
          }));

          const updatePromises = payloads.map(payload =>
            fetch(`${API_BASE_URL}/fetch_allowances.php`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }).then(res => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
          );

          return Promise.all(updatePromises)
            .then((results) => {
              if (results.every(result => result.success)) {
                message.success("Allowances updated successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else {
                throw new Error("Failed to update some allowances");
              }
            });
        })
        .catch((err) => {
          message.error(`Failed to update allowances: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      try {
        let deletePromises;
        if (deleteOption === 'all') {
          deletePromises = selectedEmployee.allowances.map(allowance =>
            fetch(`${API_BASE_URL}/fetch_allowances.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ AllowanceID: allowance.allowanceId, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          );
        } else {
          deletePromises = [
            fetch(`${API_BASE_URL}/fetch_allowances.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ AllowanceID: deleteOption, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          ];
        }

        const results = await Promise.all(deletePromises);

        if (results.every(result => result.success)) {
          message.success(`Allowance${deleteOption === 'all' ? 's' : ''} deleted successfully!`);
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error("Failed to delete some allowances");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete allowances: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleEmployeeChange = (employeeId) => {
    const selectedEmployee = employees.find(emp => emp.EmployeeID === employeeId);
    if (selectedEmployee) {
      const branch = branches.find(b => b.BranchID === selectedEmployee.BranchID);
      form.setFieldsValue({
        branchName: branch ? branch.BranchName : '',
      });
    } else {
      form.setFieldsValue({ branchName: '' });
    }
  };

  const getAllowanceLabel = (description) => {
    return description;
  };

  const getAllowanceDescriptions = () => {
    const descriptions = [...new Set(rawData.map(item => item.description))];
    return descriptions.sort();
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Allowances
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Branch Filter */}
        <Select
          placeholder="Filter by Branch"
          value={selectedBranch || 'all'}
          onChange={handleBranchFilterChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', fontFamily: 'Poppins, sans-serif' }}
          loading={loading}
          disabled={loading}
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {(role === 'Payroll Admin' ? branches : assignedBranches).map(branch => (
            <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {branch.BranchName}
            </Option>
          ))}
        </Select>

        {/* Existing Add Button and Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button 
            icon={<PlusOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
            onClick={() => openModal('Add')}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Allowance</span>}
          </Button>
          <Input
            placeholder="Search by any field (e.g., name, description, branch)"
            allowClear
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          />
        </div>
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={false}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>} 
          dataIndex="employeeId" 
          key="employeeId" 
          sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name</span>} 
          dataIndex="employeeName" 
          key="employeeName" 
          sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>} 
          dataIndex="branchName" 
          key="branchName" 
          sorter={(a, b) => a.branchName.localeCompare(b.branchName)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Allowances</span>}
          dataIndex="allowances"
          key="allowances"
          render={(allowances) => (
            <Space wrap>
              {allowances.map((allowance) => (
                <Tag key={allowance.allowanceId} color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {allowance.description}: ₱{formatNumberWithCommas(allowance.amount)}
                </Tag>
              ))}
            </Space>
          )}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Total Amount</span>}
          dataIndex="totalAmount"
          key="totalAmount"
          sorter={(a, b) => a.totalAmount - b.totalAmount}
          render={(totalAmount) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(totalAmount)}</span>}
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
                      width: '40px',
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
                      width: '40px',
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
                      width: '40px',
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
        showTotal={(total) => `Total ${total} employee records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Allowance' : 
               modalType === 'Edit' ? 'Edit Allowance Details' : 
               modalType === 'View' ? 'View Allowance Details' : 
               'Confirm Allowances Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete', style: { fontFamily: 'Poppins, sans-serif' } }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
      >
        {modalType === 'Add' && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee<span style={{ color: 'red' }}>*</span></span>} 
              name="employeeId" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select an employee!</span> }]}
            >
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
                filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                style={{ fontFamily: 'Poppins, sans-serif' }}
                loading={loading}
                disabled={loading}
                onChange={handleEmployeeChange}
              >
                {employees.map((employee) => (
                  <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {employee.EmployeeName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Allowance Type<span style={{ color: 'red' }}>*</span></span>} 
              name="description" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter an allowance type!</span> }]}
            >
              <Input style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="amount" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount cannot be negative!</span>) }
              ]}
            >
              <Input type="number" step="0.01" min="0" style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'Edit' && selectedEmployee && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.List name="allowances">
              {(fields) => (
                <>
                  {fields.map((field, index) => (
                    <div key={field.key} style={{ marginBottom: 16 }}>
                      <Form.Item
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Allowance Type<span style={{ color: 'red' }}>*</span></span>}
                        name={[field.name, 'description']}
                        rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a description!</span> }]}
                      >
                        <Select 
                          placeholder="Select allowance description" 
                          disabled 
                          style={{ fontFamily: 'Poppins, sans-serif' }}
                        >
                          {getAllowanceDescriptions().map(description => (
                            <Option key={description} value={description} style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {description} Allowance
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount (₱)<span style={{ color: 'red' }}>*</span></span>}
                        name={[field.name, 'amount']}
                        rules={[
                          { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the amount!</span> },
                          { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Amount cannot be negative!</span>) }
                        ]}
                      >
                        <Input type="number" step="0.01" min="0" style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'allowanceId']} hidden>
                        <Input type="hidden" />
                      </Form.Item>
                    </div>
                  ))}
                </>
              )}
            </Form.List>
          </Form>
        )}

        {modalType === 'View' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '14.5px', fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name:</strong> {selectedEmployee.employeeName}
            </p>
            <p style={{ fontSize: '14.5px', fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedEmployee.branchName}
            </p>
            {selectedEmployee.allowances.map((allowance) => (
              <div key={allowance.allowanceId} style={{ marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
                <p style={{ fontFamily: 'Poppins, sans-serif' }}>
                  <strong style={{ fontFamily: 'Poppins, sans-serif' }}>{allowance.description}:</strong> ₱{formatNumberWithCommas(allowance.amount)}
                </p>
              </div>
            ))}
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Total Amount:</strong> ₱{formatNumberWithCommas(selectedEmployee.totalAmount)}
            </p>
          </div>
        )}

        {modalType === 'Delete' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#ff4d4f', marginBottom: 16, fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
              ⚠️ Select what to delete an allowance record for {selectedEmployee.employeeName}:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center', marginBottom: 16 }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The allowance record assigned to employee "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedEmployee.employeeName}</strong>" will be permanently removed.
            </p>
            <Radio.Group
              onChange={(e) => setDeleteOption(e.target.value)}
              value={deleteOption}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Poppins, sans-serif' }}
            >
              <Radio value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>Delete all allowances</Radio>
              {selectedEmployee.allowances.map((allowance) => (
                <Radio key={allowance.allowanceId} value={allowance.allowanceId} style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Delete {getAllowanceLabel(allowance.description)} (₱{formatNumberWithCommas(allowance.amount)})
                </Radio>
              ))}
            </Radio.Group>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AllowancesTable;