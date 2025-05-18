import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, Select, Tag, Radio, Typography, Pagination, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const ContributionsTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
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

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  const fetchDropdownData = async () => {
    try {
      if (!userId || !role) throw new Error('Missing userId or role');
      const [employeesRes, branchesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_contribution.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_contribution.php?type=branches`),
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
    }
  };

  const fetchData = async () => {
    try {
      if (!userId || !role) {
        message.error('Please log in to view contributions');
        return;
      }

      let url = `${API_BASE_URL}/fetch_contribution.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      if (searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Contributions fetch failed: ${res.statusText} - ${errorText}`);
      }
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch contributions');

      const mappedRawData = response.data.map(contribution => ({
        key: contribution.ContributionID,
        employeeId: contribution.EmployeeID,
        employeeName: contribution.EmployeeName,
        branchId: contribution.BranchID,
        branchName: contribution.BranchName,
        contributionType: contribution.ContributionType,
        amount: parseFloat(contribution.Amount).toFixed(2),
      }));
      setRawData(mappedRawData);

      const groupedData = Object.values(
        response.data.reduce((acc, contribution) => {
          const { EmployeeID, EmployeeName, BranchID, BranchName, ContributionID, ContributionType, Amount } = contribution;
          if (!acc[EmployeeID]) {
            acc[EmployeeID] = {
              key: EmployeeID,
              employeeId: EmployeeID,
              employeeName: EmployeeName,
              branchId: BranchID,
              branchName: BranchName,
              contributions: [],
              totalAmount: 0,
            };
          }
          acc[EmployeeID].contributions.push({
            contributionId: ContributionID,
            type: ContributionType,
            amount: parseFloat(Amount).toFixed(2),
          });
          acc[EmployeeID].totalAmount += parseFloat(Amount);
          return acc;
        }, {})
      );

      // Verify all employees have complete contributions
      const employeeIds = [...new Set(response.data.map(d => d.EmployeeID))];
      console.log(`Fetched ${groupedData.length} employees for page ${currentPage}, expected up to ${pageSize}`);
      if (groupedData.length !== employeeIds.length) {
        console.warn("Incomplete employee data: some contributions may be missing.");
      }

      setOriginalData(groupedData);
      setFilteredData(groupedData);
      setPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Contributions Error:", err.message);
      message.error(`Failed to load contributions data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch, searchText]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
    setSearchText(value);
    setCurrentPage(1);
  };

  const handleBranchChange = (value) => {
    setSelectedBranch(value || 'all');
    setCurrentPage(1);
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedEmployee(record);
    setDeleteOption('all');
    if (type === "Edit" && record) {
      form.setFieldsValue({
        contributions: record.contributions.map(d => ({
          contributionId: d.contributionId,
          contributionType: d.type,
          amount: d.amount,
        })),
      });
    } else if (type === "Add") {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add") {
      form.validateFields()
        .then((values) => {
          const payload = {
            EmployeeID: values.employeeId,
            BranchID: values.branchId,
            ContributionType: values.contributionType,
            Amount: parseFloat(values.amount).toFixed(2),
            user_id: userId,
          };

          return fetch(`${API_BASE_URL}/fetch_contribution.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then((data) => {
              if (data.success) {
                message.success("Contribution added successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else if (data.warning) {
                message.warning(data.warning);
              } else {
                throw new Error(data.error || "Failed to add contribution");
              }
            })
            .catch((err) => {
              message.error(`Failed to add contribution: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
            });
        })
        .catch((err) => {
          message.error(`Failed to add contribution: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
        });
    } else if (modalType === "Edit" && selectedEmployee) {
      form.validateFields()
        .then((values) => {
          const payloads = values.contributions.map(contribution => ({
            ContributionID: contribution.contributionId,
            EmployeeID: selectedEmployee.employeeId,
            ContributionType: contribution.contributionType,
            Amount: parseFloat(contribution.amount).toFixed(2),
            user_id: userId,
          }));

          const updatePromises = payloads.map(payload =>
            fetch(`${API_BASE_URL}/fetch_contribution.php`, {
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
                message.success("Contributions updated successfully!");
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else {
                throw new Error("Failed to update some contributions");
              }
            });
        })
        .catch((err) => {
          message.error(`Failed to update contributions: ${err.message || 'Validation failed'}`);
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      try {
        let deletePromises;
        if (deleteOption === 'all') {
          deletePromises = selectedEmployee.contributions.map(contribution =>
            fetch(`${API_BASE_URL}/fetch_contribution.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ContributionID: contribution.contributionId, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          );
        } else {
          deletePromises = [
            fetch(`${API_BASE_URL}/fetch_contribution.php`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ContributionID: deleteOption, user_id: userId }),
            }).then(res => {
              if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
              return res.json();
            })
          ];
        }

        const results = await Promise.all(deletePromises);

        if (results.every(result => result.success)) {
          message.success(`Contribution${deleteOption === 'all' ? 's' : ''} deleted successfully!`);
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error("Failed to delete some contributions");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete contributions: ${err.message}`);
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

  const getContributionLabel = (type) => {
    switch (type) {
      case 'Pag-Ibig':
        return 'Pag-Ibig Contribution';
      case 'SSS':
        return 'SSS Contribution';
      case 'PhilHealth':
        return 'PhilHealth Contribution';
      default:
        return type;
    }
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      form.setFieldsValue({ branchId: employee.BranchID });
    } else {
      form.setFieldsValue({ branchId: undefined });
    }
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Contributions
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select
          placeholder="Select Branch"
          allowClear
          value={selectedBranch}
          onChange={handleBranchChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', fontFamily: 'Poppins, sans-serif' }}
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {(role === 'Payroll Admin' ? branches : assignedBranches).map(branch => (
            <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {branch.BranchName}
            </Option>
          ))}
        </Select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button 
            icon={<PlusOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
            onClick={() => openModal('Add')}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Contribution</span>}
          </Button>
          <Input
            placeholder="Search by name or contribution type"
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Contributions</span>}
          dataIndex="contributions"
          key="contributions"
          render={(contributions) => (
            <Space wrap>
              {contributions.map((contribution) => (
                <Tag key={contribution.contributionId} color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {contribution.type}: ₱{formatNumberWithCommas(contribution.amount)}
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
        total={paginationTotal}
        onChange={handlePageChange}
        onShowSizeChange={handlePageChange}
        showSizeChanger
        showQuickJumper={{ goButton: false }}
        showTotal={(total) => `Total ${total} employee records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'center', fontFamily: 'Poppins, sans-serif', justifyContent: 'center' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Contribution Details' : 
               modalType === 'Edit' ? 'Edit Contribution Details' : 
               modalType === 'View' ? 'View Contribution Details' : 
               'Confirm Contributions Deletion'}
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
                onChange={handleEmployeeChange}
              >
                {(role === 'Payroll Admin' ? employees : employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID)))
                  .map((employee) => (
                    <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {employee.EmployeeName}
                    </Option>
                  ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Contribution Type<span style={{ color: 'red' }}>*</span></span>} 
              name="contributionType" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a contribution type!</span> }]}
            >
              <Select placeholder="Select contribution type" style={{ fontFamily: 'Poppins, sans-serif' }}>
                <Option value="Pag-Ibig" style={{ fontFamily: 'Poppins, sans-serif' }}>Pag-Ibig</Option>
                <Option value="SSS" style={{ fontFamily: 'Poppins, sans-serif' }}>SSS</Option>
                <Option value="PhilHealth" style={{ fontFamily: 'Poppins, sans-serif' }}>PhilHealth</Option>
              </Select>
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
            <Form.List name="contributions">
              {(fields) => (
                <>
                  {fields.map((field, index) => (
                    <div key={field.key} style={{ marginBottom: 16 }}>
                      <Form.Item
                        label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>{getContributionLabel(selectedEmployee.contributions[index]?.type)}<span style={{ color: 'red' }}>*</span></span>}
                        name={[field.name, 'contributionType']}
                        rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a contribution type!</span> }]}
                      >
                        <Select placeholder="Select contribution type" disabled style={{ fontFamily: 'Poppins, sans-serif' }}>
                          <Option value="Pag-Ibig" style={{ fontFamily: 'Poppins, sans-serif' }}>Pag-Ibig</Option>
                          <Option value="SSS" style={{ fontFamily: 'Poppins, sans-serif' }}>SSS</Option>
                          <Option value="PhilHealth" style={{ fontFamily: 'Poppins, sans-serif' }}>PhilHealth</Option>
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
                      <Form.Item name={[field.name, 'contributionId']} hidden>
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
            <p style={{ fontSize: '14px', fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name:</strong> {selectedEmployee.employeeName}
            </p>
            <p style={{ fontSize: '14px', fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedEmployee.branchName}
            </p>
            {selectedEmployee.contributions.map((contribution) => (
              <div key={contribution.contributionId} style={{ marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
                <p style={{ fontFamily: 'Poppins, sans-serif' }}>
                  <strong style={{ fontFamily: 'Poppins, sans-serif' }}>{getContributionLabel(contribution.type)}:</strong> ₱{formatNumberWithCommas(contribution.amount)}
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
              ⚠️ Select what to delete a contribution record for {selectedEmployee.employeeName}:
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center', marginBottom: 16 }}>This action <strong>cannot be undone</strong>. The contribution record assigned to employee "<strong>{selectedEmployee.employeeName}</strong>" will be permanently removed.</p>
            <Radio.Group
              onChange={(e) => setDeleteOption(e.target.value)}
              value={deleteOption}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Poppins, sans-serif' }}
            >
              <Radio value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>Delete all contributions</Radio>
              {selectedEmployee.contributions.map((contribution) => (
                <Radio key={contribution.contributionId} value={contribution.contributionId} style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Delete {getContributionLabel(contribution.type)} (₱{formatNumberWithCommas(contribution.amount)})
                </Radio>
              ))}
            </Radio.Group>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ContributionsTable;