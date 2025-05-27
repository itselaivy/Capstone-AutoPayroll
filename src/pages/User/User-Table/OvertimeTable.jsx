import { useState, useEffect } from 'react';
import { ConfigProvider, Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Upload, Typography, Pagination, Tooltip, TimePicker } from 'antd';
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
  const [dateRange, setDateRange] = useState([null, null]);
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState(null);

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

      let url = `${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}&page=${
        currentPage - 1
      }&limit=${encodeURIComponent(pageSize)}`;

      if (selectedBranch) {
        url += `&branch_id=${encodeURIComponent(selectedBranch)}`;
      }

      if (dateRange[0] && dateRange[1]) {
        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');
        url += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Overtime fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch overtime');

      if (response.data.length === 0) {

      }

      const mappedData = response.data.map(overtime => ({
        key: overtime.OvertimeID,
        date: moment(overtime.Date, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: overtime.EmployeeID,
        employeeName: overtime.EmployeeName,
        branchId: overtime.BranchID,
        branch: overtime.BranchName || 'N/A',
        hours: parseInt(overtime["No_of_Hours"], 10),
        startOvertime1: overtime.StartOvertime1 || 'N/A',
        endOvertime1: overtime.EndOvertime1 || 'N/A',
        startOvertime2: overtime.StartOvertime2 || 'N/A',
        endOvertime2: overtime.EndOvertime2 || 'N/A',
      }));

      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Overtime Error:", err.message);
      message.error(`Failed to load overtime data: ${err.message}. Check filters or contact support.`, 5);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize, selectedBranch, dateRange]);

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
    setPaginationTotal(filtered.length);
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
      message.warning('Selected employee has no assigned branch', 5);
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
        startOvertime1: record.startOvertime1 !== 'N/A' && record.startOvertime1 ? moment(record.startOvertime1, 'HH:mm') : null,
        endOvertime1: record.endOvertime1 !== 'N/A' && record.endOvertime1 ? moment(record.endOvertime1, 'HH:mm') : null,
        startOvertime2: record.startOvertime2 !== 'N/A' && record.startOvertime2 ? moment(record.startOvertime2, 'HH:mm') : null,
        endOvertime2: record.endOvertime2 !== 'N/A' && record.endOvertime2 ? moment(record.endOvertime2, 'HH:mm') : null,
      });
    } else {
      form.resetFields();
    }
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role') || '';
    if (!userId || !role) {
      message.error('Please log in to perform this action', 5);
      return;
    }

    if (modalType === "Add") {
      try {
        const values = await form.validateFields();
        const payload = {
          Date: values.date.format('YYYY-MM-DD'),
          EmployeeID: parseInt(values.employeeId, 10),
          BranchID: values.branch ? parseInt(values.branch, 10) : null,
          No_of_Hours: parseInt(values.hours, 10),
          StartOvertime1: values.startOvertime1 ? values.startOvertime1.format('HH:mm') : null,
          EndOvertime1: values.endOvertime1 ? values.endOvertime1.format('HH:mm') : null,
          StartOvertime2: values.startOvertime2 ? values.startOvertime2.format('HH:mm') : null,
          EndOvertime2: values.endOvertime2 ? values.endOvertime2.format('HH:mm') : null,
        };

        const res = await fetch(`${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          message.success(`Overtime added successfully!`, 5);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else if (data.warning) {
          message.warning(data.warning, 5);
          setIsModalOpen(false);
          form.resetFields();
        } else {
          throw new Error(data.error || "Failed to add overtime");
        }
      } catch (err) {
        console.error("Add Overtime Error:", err.message);
        message.error(`Failed to add overtime: ${err.message}`, 5);
      }
    } else if (modalType === "Edit" && selectedOvertime) {
      try {
        const values = await form.validateFields();
        const payload = {
          Date: values.date.format('YYYY-MM-DD'),
          EmployeeID: parseInt(selectedOvertime.employeeId, 10),
          BranchID: selectedOvertime.branchId ? parseInt(selectedOvertime.branchId, 10) : null,
          No_of_Hours: parseInt(values.hours, 10),
          StartOvertime1: values.startOvertime1 ? values.startOvertime1.format('HH:mm') : null,
          EndOvertime1: values.endOvertime1 ? values.endOvertime1.format('HH:mm') : null,
          StartOvertime2: values.startOvertime2 ? values.startOvertime2.format('HH:mm') : null,
          EndOvertime2: values.endOvertime2 ? values.endOvertime2.format('HH:mm') : null,
          OvertimeID: selectedOvertime.key,
        };

        const res = await fetch(`${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          message.success(`Overtime updated successfully!`, 5);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else if (data.warning) {
          message.warning(data.warning, 5);
          setIsModalOpen(false);
          form.resetFields();
        } else {
          throw new Error(data.error || "Failed to update overtime");
        }
      } catch (err) {
        console.error("Edit Overtime Error:", err.message);
        message.error(`Failed to update overtime: ${err.message}`, 5);
      }
    } else if (modalType === "Delete" && selectedOvertime) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
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
    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role') || '';
    if (!userId || !role) {
      message.error('Please log in to import CSV', 5);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true,
        complete: (results) => {
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

          const requiredHeaders = ['Date', 'EmployeeName', 'BranchName', 'No. of Hours'];
          const headers = Object.keys(normalizedData[0] || {});
          const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

          if (missingHeaders.length > 0) {
            message.error(`Invalid CSV format. Missing columns: ${missingHeaders.join(', ')}. Expected: ${requiredHeaders.join(', ')}.`, 5);
            return;
          }

          const data = normalizedData
            .filter(row => 
              row.Date && 
              row.EmployeeName?.trim() && 
              row['No. of Hours'] !== undefined
            )
            .map((row, index) => {
              const hours = parseInt(row['No. of Hours'], 10);

              if (isNaN(hours) || hours < 0 || hours > 12) {
                message.error(`Row ${index + 1}: Invalid 'No. of Hours'. Must be a number between 0 and 12.`, 5);
                return null;
              }

              const date = moment(row.Date, 'MM/DD/YYYY', true);
              if (!date.isValid()) {
                message.error(`Row ${index + 1}: Invalid 'Date'. Must be in MM/DD/YYYY format (e.g., 04/13/2025).`, 5);
                return null;
              }

              const timeFormat = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
              if (row.StartOvertime1 && !timeFormat.test(row.StartOvertime1)) {
                message.error(`Row ${index + 1}: Invalid 'StartOvertime1'. Must be in HH:MM 24-hour format (e.g., 18:00).`, 5);
                return null;
              }
              if (row.EndOvertime1 && !timeFormat.test(row.EndOvertime1)) {
                message.error(`Row ${index + 1}: Invalid 'EndOvertime1'. Must be in HH:MM 24-hour format (e.g., 20:00).`, 5);
                return null;
              }
              if (row.StartOvertime2 && !timeFormat.test(row.StartOvertime2)) {
                message.error(`Row ${index + 1}: Invalid 'StartOvertime2'. Must be in HH:MM 24-hour format (e.g., 21:00).`, 5);
                return null;
              }
              if (row.EndOvertime2 && !timeFormat.test(row.EndOvertime2)) {
                message.error(`Row ${index + 1}: Invalid 'EndOvertime2'. Must be in HH:MM 24-hour format (e.g., 23:00).`, 5);
                return null;
              }

              return {
                Date: date.format('YYYY-MM-DD'),
                EmployeeName: row.EmployeeName.trim(),
                BranchName: row.BranchName ? row.BranchName.trim() : '',
                No_of_Hours: hours,
                StartOvertime1: row.StartOvertime1 || null,
                EndOvertime1: row.EndOvertime1 || null,
                StartOvertime2: row.StartOvertime2 || null,
                EndOvertime2: row.EndOvertime2 || null,
              };
            })
            .filter(row => row !== null);

          if (data.length === 0) {
            message.error('No valid records found in CSV. Ensure all required fields are filled correctly and match system data.', 5);
            return;
          }

          fetch(`${API_BASE_URL}/fetch_overtime.php?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
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

  const handlePaginationChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

  const showLabels = screenWidth >= 600;

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Date: '04/13/2025',
        EmployeeName: 'John Doe',
        BranchName: 'Main Branch',
        'No. of Hours': '2',
        'StartOvertime1': '18:00',
        'EndOvertime1': '20:00',
        'StartOvertime2': '',
        'EndOvertime2': '',
      },
    ];
    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'overtime_template.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="fade-in" style={{ padding: '20px' }}>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
            
            /* Ensure custom elements use Poppins */
            .fade-in, .fade-in * {
              font-family: 'Poppins', sans-serif !important;
            }
          `}
        </style>
        <Title level={2} style={{ marginBottom: '20px' }}>
          Overtime
        </Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <DatePicker.RangePicker
              format={DATE_FORMAT}
              onChange={(dates) => {
                setDateRange(dates || [null, null]);
                setCurrentPage(1);
              }}
              style={{ width: screenWidth < 480 ? '100%' : '250px' }}
            />
            <Select
              placeholder="Filter by Branch"
              value={selectedBranch || 'all'}
              onChange={handleBranchFilterChange}
              style={{ width: screenWidth < 480 ? '100%' : '200px' }}
            >
              <Option value="all">All Branches</Option>
              {branches.map((branch) => (
                <Option key={branch.BranchID} value={branch.BranchID}>
                  {branch.BranchName}
                </Option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button 
              icon={<PlusOutlined />} 
              size="middle" 
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }} 
              onClick={() => openModal('Add')}
            >
              {showLabels && 'Add Overtime'}
            </Button>
            
            <Button 
              icon={<UploadOutlined />} 
              size="middle" 
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
              onClick={handleCsvButtonClick}
            >
              {showLabels && 'Import CSV'}
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
              style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
            />
          </div>
        </div>

        {/* Rest of the JSX remains unchanged */}
        <Table 
          dataSource={filteredData} 
          bordered 
          scroll={{ x: true }} 
          pagination={false}
        >
          <Column 
            title="Date" 
            dataIndex="date" 
            key="date" 
            sorter={(a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT))}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Employee ID" 
            dataIndex="employeeId" 
            key="employeeId" 
            sorter={(a, b) => a.employeeId - b.employeeId}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Employee Name" 
            dataIndex="employeeName" 
            key="employeeName" 
            sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Branch" 
            dataIndex="branch" 
            key="branch" 
            sorter={(a, b) => a.branch.localeCompare(b.branch)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="No. of Hours" 
            dataIndex="hours" 
            key="hours" 
            sorter={(a, b) => a.hours - b.hours}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Start Overtime 1" 
            dataIndex="startOvertime1" 
            key="startOvertime1" 
            sorter={(a, b) => a.startOvertime1.localeCompare(b.startOvertime1)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="End Overtime 1" 
            dataIndex="endOvertime1" 
            key="endOvertime1" 
            sorter={(a, b) => a.endOvertime1.localeCompare(b.endOvertime1)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Start Overtime 2" 
            dataIndex="startOvertime2" 
            key="startOvertime2" 
            sorter={(a, b) => a.startOvertime2.localeCompare(b.startOvertime2)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="End Overtime 2" 
            dataIndex="endOvertime2" 
            key="endOvertime2" 
            sorter={(a, b) => a.endOvertime2.localeCompare(b.endOvertime2)}
            render={(text) => <span>{text}</span>}
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

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={paginationTotal}
            onChange={handlePaginationChange}
            onShowSizeChange={handlePaginationChange}
            showSizeChanger
            pageSizeOptions={['10', '20', '50', '100']}
            showQuickJumper={{ goButton: false }}
            showTotal={(total) => `Total ${total} overtime records`}
            style={{ justifyContent: 'center' }}
          />
        </div>

        <Modal
          title={
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
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
          okButtonProps={{ danger: modalType === 'Delete' }}
          cancelButtonProps={{}}
          width={600}
          centered
          styles={{ body: { padding: '20px' } }}
        >
          {(modalType === 'Add') && (
            <Form form={form} layout="vertical">
              <Form.Item 
                label={<span>Date<span style={{ color: 'red' }}>*</span></span>} 
                name="date" 
                rules={[{ required: true, message: 'Please select a date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>Employee<span style={{ color: 'red' }}>*</span></span>} 
                name="employeeId" 
                rules={[{ required: true, message: 'Please select an employee!' }]}
              >
                <Select
                  showSearch
                  placeholder="Type or select an employee"
                  optionFilterProp="children"
                  onChange={handleEmployeeChange}
                  filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                  allowClear
                >
                  {employees.map((employee) => (
                    <Option key={employee.EmployeeID} value={employee.EmployeeID}>
                      {employee.EmployeeName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="branch"
                rules={[{ required: true, message: 'Employee must be assigned to a valid branch!' }]}
                noStyle
              >
                <Input type="hidden" />
              </Form.Item>
              <Form.Item 
                label={<span>No. of Hours<span style={{ color: 'red' }}>*</span></span>} 
                name="hours" 
                rules={[
                  { required: true, message: 'Please enter the number of hours!' },
                  { pattern: /^\d+$/, message: 'Hours must be a whole number' },
                  { validator: (_, value) => value >= 0 && value <= 12 ? Promise.resolve() : Promise.reject('Hours must be between 0 and 12') }
                ]}
              >
                <Input 
                  type="number" 
                  step="1" 
                  min="0" 
                  max="12"
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>Start Overtime 1<span style={{ color: 'red' }}>*</span></span>} 
                name="startOvertime1"
                rules={[{ required: true, type: 'object', message: 'Please select a valid start time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 18:00"
                />
              </Form.Item>
              <Form.Item 
                label={<span>End Overtime 1<span style={{ color: 'red' }}>*</span></span>} 
                name="endOvertime1"
                rules={[{ required: true, type: 'object', message: 'Please select a valid end time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 20:00"
                />
              </Form.Item>
              <Form.Item 
                label="Start Overtime 2" 
                name="startOvertime2"
                rules={[{ type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 21:00"
                />
              </Form.Item>
              <Form.Item 
                label="End Overtime 2" 
                name="endOvertime2"
                rules={[{ type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 23:00"
                />
              </Form.Item>
            </Form>
          )}

          {(modalType === 'Edit') && (
            <Form form={form} layout="vertical">
              <Form.Item 
                label={<span>Date<span style={{ color: 'red' }}>*</span></span>} 
                name="date" 
                rules={[{ required: true, message: 'Please select a date!' }]}
              >
                <DatePicker 
                  format={DATE_FORMAT} 
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item
                name="employeeId"
                rules={[{ required: true, message: 'Employee ID is required!' }]}
                noStyle
              >
                <Input type="hidden" />
              </Form.Item>
              <Form.Item
                name="branch"
                rules={[{ required: true, message: 'Branch ID is required!' }]}
                noStyle
              >
                <Input type="hidden" />
              </Form.Item>
              <Form.Item 
                label={<span>No. of Hours<span style={{ color: 'red' }}>*</span></span>} 
                name="hours" 
                rules={[
                  { required: true, message: 'Please enter the number of hours!' },
                  { pattern: /^\d+$/, message: 'Hours must be a whole number' },
                  { validator: (_, value) => value >= 0 && value <= 12 ? Promise.resolve() : Promise.reject('Hours must be between 0 and 12') }
                ]}
              >
                <Input 
                  type="number" 
                  step="1" 
                  min="0" 
                  max="12"
                  style={{ width: '100%' }} 
                />
              </Form.Item>
              <Form.Item 
                label={<span>Start Overtime 1<span style={{ color: 'red' }}>*</span></span>} 
                name="startOvertime1"
                rules={[{ required: true, type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 18:00"
                />
              </Form.Item>
              <Form.Item 
                label={<span>End Overtime 1<span style={{ color: 'red' }}>*</span></span>} 
                name="endOvertime1"
                rules={[{ required: true, type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 20:00"
                />
              </Form.Item>
              <Form.Item 
                label="Start Overtime 2" 
                name="startOvertime2"
                rules={[{ type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 21:00"
                />
              </Form.Item>
              <Form.Item 
                label="End Overtime 2" 
                name="endOvertime2"
                rules={[{ type: 'object', message: 'Please select a valid time!' }]}
              >
                <TimePicker 
                  format="HH:mm" 
                  style={{ width: '100%' }} 
                  placeholder="e.g., 23:00"
                />
              </Form.Item>
            </Form>
          )}

          {(modalType === 'View') && selectedOvertime && (
            <div>
              <p><strong>Date:</strong> {selectedOvertime.date}</p>
              <p><strong>Employee Name:</strong> {selectedOvertime.employeeName}</p>
              <p><strong>Branch:</strong> {selectedOvertime.branch}</p>
              <p><strong>No. of Hours:</strong> {selectedOvertime.hours}</p>
              <p><strong>Start Overtime 1:</strong> {selectedOvertime.startOvertime1}</p>
              <p><strong>End Overtime 1:</strong> {selectedOvertime.endOvertime1}</p>
              <p><strong>Start Overtime 2:</strong> {selectedOvertime.startOvertime2}</p>
              <p><strong>End Overtime 2:</strong> {selectedOvertime.endOvertime2}</p>
            </div>
          )}

          {modalType === 'Delete' && selectedOvertime && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                ⚠️ Are you sure you want to delete this overtime record?
              </p>
              <p>
                This action <strong>cannot be undone</strong>. The overtime record for "<strong>{selectedOvertime.employeeName}</strong>" will be permanently removed.
              </p>
            </div>
          )}
        </Modal>

        <Modal
          title={<span style={{ fontSize: '20px', fontWeight: 'bold' }}>How to Import Overtime CSV</span>}
          open={isCsvInstructionModalOpen}
          onOk={handleCsvInstructionOk}
          onCancel={handleCsvInstructionCancel}
          okText="Proceed with Upload"
          cancelText="Cancel"
          width={screenWidth > 480 ? '40%' : '90%'}
          styles={{ body: { padding: '20px' } }}
          footer={[
            <Button key="cancel" onClick={handleCsvInstructionCancel}>
              Cancel
            </Button>,
            <Button
              key="download"
              onClick={handleDownloadTemplate}
              style={{ backgroundColor: '#3291AD', borderColor: '#3291AD', color: 'white', fontFamily: 'Poppins, sans-serif', marginRight: 8 }}
            >
              Download Template
            </Button>,
            <Upload key="upload" {...uploadProps}>
              <Button 
                type="primary" 
                onClick={handleCsvInstructionOk}
                style={{ backgroundColor: '#9532AD', borderColor: '#9532AD', color: 'white', fontFamily: 'Poppins, sans-serif'}}>
                Proceed with Upload
              </Button>
            </Upload>,
          ]}
        >
          <div style={{ lineHeight: '1.6', maxHeight: 'calc(80vh - 150px)', overflowY: 'auto', boxSizing: 'border-box' }}>
            <Text strong style={{ fontSize: '16px' }}>Steps on how to Upload a CSV File:</Text>
            <ol>
              <li>Download the template CSV file using the "Download Template" button below.</li>
              <li>Fill the spreadsheet with the following columns:</li>
              <ul>
                <li><strong>Date</strong>: The date of overtime (e.g., "04/13/2025"). Format: MM/DD/YYYY.</li>
                <li><strong>EmployeeName</strong>: Full name of the employee as it appears in the system (e.g., "John Doe").</li>
                <li><strong>BranchName</strong>: Exact branch name from the system (e.g., "Main Branch").</li>
                <li><strong>No. of Hours</strong>: Total overtime hours (e.g., "2"). Must be 0-12.</li>
                <li><strong>StartOvertime1</strong>: Start time of first overtime period in 24-hour format (e.g., "18:00").</li>
                <li><strong>EndOvertime1</strong>: End time of first overtime period in 24-hour format (e.g., "20:00").</li>
                <li><strong>StartOvertime2</strong>: Start time of second overtime period in 24-hour format (e.g., "21:00"). Optional.</li>
                <li><strong>EndOvertime2</strong>: End time of second overtime period in 24-hour format (e.g., "23:00"). Optional.</li>
              </ul>
              <li>Double check if the file format is a CSV (e.g., "overtime.csv").</li>
              <li>After clicking "Proceed with Upload," select your CSV file to import.</li>
            </ol>

            <Text strong style={{ fontSize: '16px' }}>Reminders:</Text>
            <ul>
              <li>Ensure <strong>EmployeeName</strong> and <strong>BranchName</strong> match exactly with system records (case-insensitive).</li>
              <li>The <strong>No. of Hours</strong> column should be more than 0 but less than 12.</li>
              <li><strong>StartOvertime1</strong> and <strong>EndOvertime1</strong> are required and must be in HH:MM format if provided.</li>
              <li><strong>StartOvertime2</strong> and <strong>EndOvertime2</strong> are optional and can be left blank.</li>
              <li>All required fields must be filled—missing data will skip the row.</li>
              <li>Duplicate records (same EmployeeName and Date) will update existing entries.</li>
              <li>Check for errors after upload—invalid names or formats will be flagged.</li>
              <li>For Payroll Staff, only employees and branches assigned to you can be imported.</li>
            </ul>
          </div>
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default OvertimeTable;