import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Upload, Typography, Pagination } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;
const { Title, Text } = Typography;

const OvertimeTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCsvInstructionModalOpen, setIsCsvInstructionModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedOvertime, setSelectedOvertime] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState(null); // Default to null for "All Branches"

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const DATE_FORMAT = 'MM/DD/YYYY';

  const fetchDropdownData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId || !role) throw new Error('Missing userId or role');

      const [branchesRes, employeesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_overtime.php?type=branches&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_overtime.php?type=employees&user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`)
      ]);

      if (!branchesRes.ok) throw new Error(`Branches fetch failed: ${branchesRes.statusText}`);
      if (!employeesRes.ok) throw new Error(`Employees fetch failed: ${employeesRes.statusText}`);

      const branchesData = await branchesRes.json();
      const employeesData = await employeesRes.json();

      setBranches(branchesData);
      setEmployees(employeesData);
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown options: ${err.message}`, 5);
    }
  };

  const fetchData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId || !role) {
        message.error('Please log in to view overtime', 5);
        return;
      }

      const branchParam = selectedBranch ? `&branch_id=${encodeURIComponent(selectedBranch)}` : '';
      const res = await fetch(
        `${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}&page=${
          currentPage - 1
        }&limit=${encodeURIComponent(pageSize)}${branchParam}`
      );
      if (!res.ok) throw new Error(`Overtime fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch overtime');

      const mappedData = response.data.map(overtime => ({
        key: overtime.OvertimeID,
        date: moment(overtime.Date, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: overtime.EmployeeID,
        employeeName: overtime.EmployeeName,
        branchId: overtime.BranchID,
        branch: overtime.BranchName,
        hours: parseInt(overtime["No_of_Hours"], 10),
        minutes: parseInt(overtime["No_of_Mins"], 10),
        rate: parseFloat(overtime["Rate"]).toFixed(2),
      }));

      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Overtime Error:", err.message);
      message.error(`Failed to load overtime data: ${err.message}`, 5);
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
    const sanitizedValue = value.replace(/[<>]/g, '');
    const lowerValue = sanitizedValue.toLowerCase().trim();
    let filtered = originalData;
    if (lowerValue) {
      filtered = originalData.filter(item =>
        Object.values(item)
          .filter(val => typeof val === 'string' || typeof val === 'number')
          .map(val => val.toString().toLowerCase())
          .some(val => val.includes(lowerValue))
      );
    }
    setFilteredData(filtered);
    setPaginationTotal(filtered.length); // Update pagination total to match filtered data
    setSearchText(sanitizedValue);
    setCurrentPage(1);
  };

  const handleBranchFilterChange = (value) => {
    setSelectedBranch(value === 'all' ? null : value);
    setCurrentPage(1);
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      form.setFieldsValue({ branch: employee.BranchID });
    } else {
      form.setFieldsValue({ branch: null });
    }
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedOvertime(record);
    setIsModalOpen(true);

    if (record) {
      const employee = employees.find(emp => emp.EmployeeID === record.employeeId);
      form.setFieldsValue({
        date: moment(record.date, DATE_FORMAT),
        employeeId: record.employeeId,
        branch: employee ? employee.BranchID : record.branchId,
        hours: record.hours,
        minutes: record.minutes,
        rate: record.rate,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ date: moment() });
    }
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      form.validateFields()
        .then((values) => {
          const payload = {
            Date: values.date.format('YYYY-MM-DD'),
            EmployeeID: values.employeeId,
            BranchID: values.branch,
            No_of_Hours: parseInt(values.hours, 10),
            No_of_Mins: parseInt(values.minutes, 10),
            Rate: parseFloat(values.rate).toFixed(2),
          };

          if (modalType === "Edit" && selectedOvertime) {
            payload.OvertimeID = selectedOvertime.key;
          }

          return fetch(`${API_BASE_URL}/fetch_overtime.php`, {
            method: modalType === "Add" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then((data) => {
              if (data.success) {
                message.success(`Overtime ${modalType === "Add" ? "added" : "updated"} successfully!`, 5);
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else if (data.warning) {
                message.warning(data.warning, 5);
              } else {
                throw new Error(data.error || "Operation failed");
              }
            });
        })
        .catch((err) => {
          message.error(`Failed to ${modalType === "Add" ? "add" : "update"} overtime: ${err.message || 'Please ensure all required fields are completed correctly.'}`, 5);
        });
    } else if (modalType === "Delete" && selectedOvertime) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_overtime.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ OvertimeID: selectedOvertime.key }),
        });

        const data = await res.json();
        if (data.success) {
          message.success("Overtime deleted successfully!", 5);
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Delete failed");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete overtime: ${err.message}`, 5);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleCsvInstructionOk = () => {
    setIsCsvInstructionModalOpen(false);
  };

  const handleCsvInstructionCancel = () => {
    setIsCsvInstructionModalOpen(false);
  };

  const handleCsvButtonClick = () => {
    setIsCsvInstructionModalOpen(true);
  };

  const handleCSVUpload = ({ file }) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true,
        complete: (results) => {
          // Normalize headers to handle spaces and case sensitivity
          const normalizedData = results.data.map(row => {
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
              const normalizedKey = key
                .replace(/\s+/g, ' ')
                .replace('No.of', 'No. of')
                .trim();
              normalizedRow[normalizedKey] = row[key];
            });
            return normalizedRow;
          });

          // Define required headers
          const requiredHeaders = ['Date', 'EmployeeName', 'BranchName', 'No. of Hours', 'No. of Mins', 'Rate'];
          const headers = Object.keys(normalizedData[0] || {});
          const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

          if (missingHeaders.length > 0) {
            message.error(`Invalid CSV format. Missing columns: ${missingHeaders.join(', ')}. Expected: ${requiredHeaders.join(', ')}.`, 5);
            return;
          }

          // Validate and transform data
          const data = normalizedData
            .filter(row => 
              row.Date && 
              row.EmployeeName?.trim() && 
              row.BranchName?.trim() && 
              row['No. of Hours'] !== undefined && 
              row['No. of Mins'] !== undefined && 
              row.Rate !== undefined
            )
            .map((row, index) => {
              const hours = parseInt(row['No. of Hours'], 10);
              const mins = parseInt(row['No. of Mins'], 10);
              const rate = parseFloat(row.Rate);

              // Validate data types and ranges
              if (isNaN(hours) || hours < 0 || hours > 12) {
                message.error(`Row ${index + 1}: Invalid 'No. of Hours'. Must be a number between 0 and 12.`, 5);
                return null;
              }
              if (isNaN(mins) || mins < 0 || mins > 59) {
                message.error(`Row ${index + 1}: Invalid 'No. of Mins'. Must be a number between 0 and 59.`, 5);
                return null;
              }
              if (isNaN(rate) || rate < 0) {
                message.error(`Row ${index + 1}: Invalid 'Rate'. Must be a non-negative number.`, 5);
                return null;
              }

              const date = moment(row.Date, 'MM/DD/YYYY', true);
              if (!date.isValid()) {
                message.error(`Row ${index + 1}: Invalid 'Date'. Must be in MM/DD/YYYY format (e.g., 04/13/2025).`, 5);
                return null;
              }

              return {
                Date: date.format('YYYY-MM-DD'),
                EmployeeName: row.EmployeeName.trim(),
                BranchName: row.BranchName.trim(),
                No_of_Hours: hours,
                No_of_Mins: mins,
                Rate: rate.toFixed(2),
              };
            })
            .filter(row => row !== null);

          if (data.length === 0) {
            message.error('No valid records found in CSV. Ensure all required fields are filled correctly and match system data.', 5);
            return;
          }

          // Send data to backend
          fetch(`${API_BASE_URL}/fetch_overtime.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
            .then(res => {
              if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
              return res.json();
            })
            .then(data => {
              if (data.success) {
                message.success(`Imported ${data.successCount} overtime records successfully.`, 5);
                fetchData();
              } else {
                const errorMsg = data.errors 
                  ? `Some records failed: ${data.errors.join(', ')}`
                  : data.warning || 'Some records could not be imported.';
                message.warning(errorMsg, 5);
              }
            })
            .catch(err => {
              console.error('CSV Import Error:', err);
              message.error(`Failed to import CSV: ${err.message}. Check server logs for details.`, 5);
            });
        },
        error: error => {
          console.error('CSV Parse Error:', error);
          message.error(`Error parsing CSV file: ${error.message}. Check file format.`, 5);
        },
      });
    };
    reader.readAsText(file);
    return false;
  };

  const uploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      handleCSVUpload({ file });
      return false;
    },
  };

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handlePaginationChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px', fontFamily: 'Poppins, sans-serif' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Overtime
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap', fontFamily: 'Poppins, sans-serif' }}>
        <Select
          placeholder="Filter by Branch"
          value={selectedBranch || 'all'}
          onChange={handleBranchFilterChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', fontFamily: 'Poppins, sans-serif' }}
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {branches.map((branch) => (
            <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {branch.BranchName}
            </Option>
          ))}
        </Select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontFamily: 'Poppins, sans-serif' }}>
          <Button 
            icon={<PlusOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
            onClick={() => openModal('Add')}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Overtime</span>}
          </Button>
          <Button 
            icon={<UploadOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
            onClick={handleCsvButtonClick}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Import CSV</span>}
          </Button>
          <Upload {...uploadProps} style={{ display: 'none' }}>
            <input id="csv-upload-input" type="file" style={{ display: 'none' }} />
          </Upload>
          <Input
            placeholder="Search by any field (e.g., name, date, hours)"
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
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date</span>} 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT))}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>} 
          dataIndex="employeeId" 
          key="employeeId" 
          sorter={(a, b) => a.employeeId - b.employeeId}
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
          dataIndex="branch" 
          key="branch" 
          sorter={(a, b) => a.branch.localeCompare(b.branch)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours</span>} 
          dataIndex="hours" 
          key="hours" 
          sorter={(a, b) => a.hours - b.hours}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins</span>} 
          dataIndex="minutes" 
          key="minutes" 
          sorter={(a, b) => a.minutes - b.minutes}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate (₱)</span>} 
          dataIndex="rate" 
          key="rate" 
          sorter={(a, b) => a.rate - b.rate}
          render={(rate) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>₱{formatNumberWithCommas(rate)}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
          key="action"
          render={(_, record) => (
            <Space size="middle" wrap style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Button 
                icon={<EyeOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('View', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>View</span>}
              </Button>
              <Button 
                icon={<EditOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Edit</span>}
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Delete</span>}
              </Button>
            </Space>
          )}
        />
      </Table>

      <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'Poppins, sans-serif' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={paginationTotal}
          onChange={handlePaginationChange}
          onShowSizeChange={handlePaginationChange}
          showSizeChanger
          pageSizeOptions={['10', '20', '50']}
          showQuickJumper={{ goButton: false }}
          showTotal={(total) => `Total ${total} overtime records`}
          style={{ fontFamily: 'Poppins, sans-serif', justifyContent: 'center' }}
        />
      </div>

      <Modal
        title={
          <div style={{ textAlign: 'center', fontFamily: 'Poppins, sans-serif' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Overtime' : 
               modalType === 'Edit' ? 'Edit Overtime Details' : 
               modalType === 'View' ? 'View Overtime Information' : 
               'Confirm Overtime Deletion'}
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
        {(modalType === 'Add') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>} 
              name="date" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker 
                format={DATE_FORMAT} 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee<span style={{ color: 'red' }}>*</span></span>} 
              name="employeeId" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select an employee!</span> }]}
            >
              <Select
                showSearch
                placeholder="Type or select an employee"
                optionFilterProp="children"
                onChange={handleEmployeeChange}
                filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                style={{ fontFamily: 'Poppins, sans-serif' }}
                allowClear
              >
                {employees.map((employee) => (
                  <Option key={employee.EmployeeID} value={employee.EmployeeID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {employee.EmployeeName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch<span style={{ color: 'red' }}>*</span></span>} 
              name="branch" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch will be auto-set</span> }]}
            >
              <Select 
                placeholder="Employee Branch" 
                disabled
                style={{ fontFamily: 'Poppins, sans-serif', color: '#808080' }}
              >
                {branches.map((branch) => (
                  <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif', color: '#808080' }}>
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours<span style={{ color: 'red' }}>*</span></span>} 
              name="hours" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of hours!</span> },
                { pattern: /^\d+$/, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}></span> },
                { validator: (_, value) => value >= 0 && value <= 12 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Hours must be between 0 and 12</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="1" 
                min="0" 
                max="12"
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins<span style={{ color: 'red' }}>*</span></span>} 
              name="minutes" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of minutes!</span> },
                { pattern: /^\d+$/, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}></span> },
                { validator: (_, value) => value >= 0 && value <= 59 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Minutes must be between 0 and 59</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="1" 
                min="0" 
                max="59" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="rate" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the rate!</span> },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate must be non-negative</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="0.01" 
                min="0" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
          </Form>
        )}

        {(modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>} 
              name="date" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker 
                format={DATE_FORMAT} 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours<span style={{ color: 'red' }}>*</span></span>} 
              name="hours" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of hours!</span> },
                { pattern: /^\d+$/, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}></span> },
                { validator: (_, value) => value >= 0 && value <= 12 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Hours must be between 0 and 12</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="1" 
                min="0" 
                max="12"
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins<span style={{ color: 'red' }}>*</span></span>} 
              name="minutes" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the number of minutes!</span> },
                { pattern: /^\d+$/, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}></span> },
                { validator: (_, value) => value >= 0 && value <= 59 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Minutes must be between 0 and 59</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="1" 
                min="0" 
                max="59" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate (₱)<span style={{ color: 'red' }}>*</span></span>} 
              name="rate" 
              rules={[
                { required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter the rate!</span> },
                { validator: (_, value) => value >= 0 ? Promise.resolve() : Promise.reject(<span style={{ fontFamily: 'Poppins, sans-serif' }}>Rate must be non-negative</span>) }
              ]}
            >
              <Input 
                type="number" 
                step="0.01" 
                min="0" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedOvertime && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date:</strong> {selectedOvertime.date}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name:</strong> {selectedOvertime.employeeName}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedOvertime.branch}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours:</strong> {selectedOvertime.hours}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins:</strong> {selectedOvertime.minutes}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Rate:</strong> ₱{formatNumberWithCommas(selectedOvertime.rate)}
            </p>
          </div>
        )}

        {modalType === 'Delete' && selectedOvertime && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this overtime record?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The overtime record for "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedOvertime.employeeName}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        title={<span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>How to Import Overtime CSV</span>}
        open={isCsvInstructionModalOpen}
        onOk={handleCsvInstructionOk}
        onCancel={handleCsvInstructionCancel}
        okText="Proceed with Upload"
        cancelText="Cancel"
        width={700}
        style={{ fontFamily: 'Poppins, sans-serif' }}
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
        footer={[
          <Button key="cancel" onClick={handleCsvInstructionCancel} style={{ fontFamily: 'Poppins, sans-serif', marginRight: 8 }}>
            Cancel
          </Button>,
          <Upload key="upload" {...uploadProps}>
            <Button type="primary" onClick={handleCsvInstructionOk} style={{ fontFamily: 'Poppins, sans-serif' }}>
              Proceed with Upload
            </Button>
          </Upload>,
        ]}
      >
        <div style={{ fontFamily: 'Poppins, sans-serif', lineHeight: '1.6' }}>
          <Text strong style={{ fontSize: '16px', fontFamily: 'Poppins, sans-serif' }}>Steps to Create and Upload a CSV:</Text>
          <ol style={{ fontFamily: 'Poppins, sans-serif' }}>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              Prepare a spreadsheet (e.g., Excel, Google Sheets) with the exact column headers listed below. Each row represents an overtime record.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              Save the spreadsheet as a CSV file (e.g., "overtime.csv") using comma-separated values.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              Click "Proceed with Upload" to select and upload your CSV file.
            </li>
          </ol>

          <Text strong style={{ fontSize: '16px', fontFamily: 'Poppins, sans-serif' }}>Required Columns:</Text>
          <ul style={{ fontFamily: 'Poppins, sans-serif' }}>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date</strong>: Overtime date in MM/DD/YYYY format (e.g., "04/13/2025").
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>EmployeeName</strong>: Full name of the employee, exactly as it appears in the system (e.g., "John Doe").
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>BranchName</strong>: Branch name, exactly as it appears in the system (e.g., "Main Branch").
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours</strong>: Whole number of overtime hours, between 0 and 12 (e.g., "2"). Use a space after "No.", not a period.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins</strong>: Whole number of overtime minutes, between 0 and 59 (e.g., "30"). Use a space after "No.", not a period.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Rate</strong>: Overtime rate in pesos, with up to two decimal places (e.g., "150.00").
            </li>
          </ul>

          <Text strong style={{ fontSize: '16px', fontFamily: 'Poppins, sans-serif' }}>Example CSV Format:</Text>
          <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'Poppins, sans-serif' }}>
            Date,EmployeeName,BranchName,No. of Hours,No. of Mins,Rate
            04/13/2025,John Doe,Main Branch,2,30,150.00
            04/14/2025,Jane Smith,West Branch,3,0,200.00
          </pre>

          <Text strong style={{ fontSize: '16px', fontFamily: 'Poppins, sans-serif' }}>Important Reminders:</Text>
          <ul style={{ fontFamily: 'Poppins, sans-serif' }}>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              All columns are mandatory. Rows with missing or invalid data will be skipped.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              Column headers must match exactly: use <strong style={{ fontFamily: 'Poppins, sans-serif' }}>"No. of Hours"</strong>, <strong style={{ fontFamily: 'Poppins, sans-serif' }}>"No. of Mins"</strong>, and <strong style={{ fontFamily: 'Poppins, sans-serif' }}>"Rate"</strong> as shown.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>EmployeeName</strong> and <strong style={{ fontFamily: 'Poppins, sans-serif' }}>BranchName</strong> must exactly match the names in the system. Check the employee and branch lists in the application to verify.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              If an <strong style={{ fontFamily: 'Poppins, sans-serif' }}>EmployeeName</strong> is not unique (e.g., two employees named "John Doe"), the import may fail. Contact your administrator to resolve.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date</strong> must be in MM/DD/YYYY format (e.g., "04/13/2025"). Incorrect formats will cause rows to be skipped.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Hours</strong> must be a whole number between 0 and 12.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>No. of Mins</strong> must be a whole number between 0 and 59.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Rate</strong> must be a non-negative number, with up to two decimal places.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              For Payroll Staff, you can only import records for employees and branches assigned to you.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              Ensure the CSV file is comma-separated and has no extra spaces or special characters in the data.
            </li>
            <li style={{ fontFamily: 'Poppins, sans-serif' }}>
              If the import fails, check the error message for details (e.g., invalid employee name, incorrect column headers, duplicate record).
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default OvertimeTable;