import React, { useState, useEffect, useMemo } from 'react';
import { Space, Table, Tag, Button, Input, Modal, Form, message, DatePicker, TimePicker, Select, Upload, Typography, Pagination } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';

const { Column } = Table;
const { Option } = Select;
const { Title, Text } = Typography;

const AttendanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [isCsvInstructionModalOpen, setIsCsvInstructionModalOpen] = useState(false);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const DATE_FORMAT = 'MM/DD/YYYY';

  const fetchDropdownData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) throw new Error('Missing userId or role');
      const [branchesRes, employeesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`)
      ]);
      const [branchesData, employeesData, assignedBranchesResData] = await Promise.all([
        branchesRes.json(),
        employeesRes.json(),
        assignedBranchesRes.json()
      ]);
      console.log('Branches Data:', branchesData);
      console.log('Employees Data:', employeesData);
      console.log('Assigned Branches Data:', assignedBranchesResData);
      setBranches(branchesData);
      setEmployees(employeesData);
      setAssignedBranches(assignedBranchesResData.data || []);
    } catch (err) {
      message.error('Unable to load dropdown options');
      console.error('Fetch Dropdown Error:', err);
    }
  };

  const fetchData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        message.error('Please log in to view attendance');
        return;
      }

      let url = `${API_BASE_URL}/fetch_attendance.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch !== 'all') {
        url += `&branch=${encodeURIComponent(selectedBranch)}`;
      }

      console.log('Fetching URL:', url);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Attendance fetch failed: ${res.status}`);
      const response = await res.json();

      console.log('Response:', response);

      if (!response.success) throw new Error(response.error || 'Failed to fetch attendance');

      const mappedData = response.data.map(attendance => ({
        key: attendance.AttendanceID,
        date: moment(attendance.Date, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: attendance.EmployeeID,
        employeeName: attendance.EmployeeName,
        branchId: attendance.BranchID,
        branch: attendance.BranchName,
        timeIn: attendance.TimeIn, // Display as HH:mm
        timeOut: attendance.TimeOut, // Display as HH:mm
        status: attendance.TimeInStatus,
      }));

      console.log('Mapped Data:', mappedData);

      setFilteredData(mappedData);
      setOriginalData(mappedData);
      setPaginationTotal(response.total);
    } catch (err) {
      message.error(`Unable to load attendance data: ${err.message}`);
      console.error('Fetch error:', err);
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
    setSearchText(value);
    const lowerValue = value.toLowerCase().trim();
    setFilteredData(originalData.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(lowerValue)
      )
    ));
    setCurrentPage(1);
  };

  const handleBranchChange = (value) => {
    setSelectedBranch(value);
    setCurrentPage(1);
  };

  const handleEmployeeChange = (employeeId) => {
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      const branch = branches.find(br => String(br.BranchID) === String(employee.BranchID));
      console.log('handleEmployeeChange - Employee BranchID:', employee.BranchID, 'Branches:', branches, 'Found Branch:', branch);
      form.setFieldsValue({
        branchId: employee.BranchID,
        branchName: branch ? branch.BranchName : 'Branch Not Found'
      });
      console.log('Set Branch in Form - BranchID:', employee.BranchID, 'BranchName:', form.getFieldValue('branchName'));
    } else {
      form.setFieldsValue({
        branchId: '',
        branchName: 'No Branch Assigned'
      });
      console.log('No Branch Set - Form Values:', form.getFieldsValue());
    }
  };

  const handlePageChange = (page, pageSize) => {
    setCurrentPage(page);
    setPageSize(pageSize);
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedAttendance(record);
    setIsModalOpen(true);

    if (record) {
      const branch = branches.find(br => String(br.BranchID) === String(record.branchId));
      console.log('openModal Edit - Record BranchID:', record.branchId, 'Record BranchName:', record.branch, 'Branches:', branches, 'Found Branch:', branch);
      form.setFieldsValue({
        date: moment(record.date, DATE_FORMAT),
        employeeId: record.employeeId,
        branchId: record.branchId,
        branchName: record.branch,
        timeIn: moment(record.timeIn, 'HH:mm'),
        timeOut: moment(record.timeOut, 'HH:mm'),
      });
      console.log('Edit Modal Form Values:', form.getFieldsValue());
    } else {
      form.resetFields();
      form.setFieldsValue({
        date: moment(),
        branchId: '',
        branchName: ''
      });
      console.log('Add Modal Form Values:', form.getFieldsValue());
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
          const timeIn = values.timeIn.format('HH:mm');
          const timeInMoment = moment(timeIn, 'HH:mm');
          const lateThreshold = moment('08:11', 'HH:mm');
          const startDuty = moment('08:00', 'HH:mm');
          const timeInStatus = timeInMoment.isBefore(startDuty) ||
                              (timeInMoment.isSameOrAfter(startDuty) && timeInMoment.isBefore(lateThreshold))
                              ? 'On-Time' : 'Late';

          const payload = {
            Date: values.date.format('YYYY-MM-DD'),
            EmployeeID: values.employeeId,
            BranchID: values.branchId,
            TimeIn: timeIn,
            TimeOut: values.timeOut.format('HH:mm'),
            TimeInStatus: timeInStatus,
          };

          if (modalType === "Edit" && selectedAttendance) {
            payload.AttendanceID = selectedAttendance.key;
          }

          console.log('Submitting Payload:', payload);

          return fetch(`${API_BASE_URL}/fetch_attendance.php`, {
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
                message.success(`Attendance record ${modalType === "Add" ? "added" : "updated"} successfully.`);
                setIsModalOpen(false);
                form.resetFields();
                fetchData();
              } else {
                throw new Error(data.error || "An unexpected error occurred.");
              }
            })
            .catch((err) => {
              message.error(
                err.message.includes("already exists")
                  ? `An attendance record for this employee on ${moment(values.date).format('MM/DD/YYYY')} already exists.`
                  : `Failed to ${modalType === "Add" ? "add" : "update"} the attendance record. Please try again or contact the System Administrator.`
              );
            });
        })
        .catch((err) => {
          message.error(`Failed to add attendance: Please ensure all required fields are completed correctly.`);
          console.log('Form Validation Error:', err);
        });
    } else if (modalType === "Delete" && selectedAttendance) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_attendance.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ AttendanceID: selectedAttendance.key }),
        });

        const responseText = await res.text();
        console.log("Delete Response:", responseText);

        if (!res.ok) {
          throw new Error(`Delete failed: ${res.statusText} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.success) {
          message.success("Attendance record deleted successfully.");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "An unexpected error occurred during deletion.");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete attendance record. Please try again or contact the System Administrator.`);
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

  const handleCSVUpload = ({ file }) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true,
        complete: (results) => {
          const role = localStorage.getItem('role');
          let data = results.data
            .filter(row => row.Date && row.EmployeeName && row.BranchName && row.TimeIn && row.TimeOut)
            .map((row, index) => {
              const parsedDate = moment(row.Date, DATE_FORMAT).format('YYYY-MM-DD');
              const timeIn24 = moment(row.TimeIn, 'HH:mm').format('HH:mm');
              const timeOut24 = moment(row.TimeOut, 'HH:mm').format('HH:mm');
              const timeInMoment = moment(timeIn24, 'HH:mm');
              const timeInStatus = timeInMoment.isSameOrAfter(moment('08:11', 'HH:mm')) ? 'Late' : 'On-Time';

              let employeeId = null;
              let employeeBranchId = null;
              if (row.EmployeeName) {
                const employee = employees.find(emp => emp.EmployeeName.toLowerCase() === row.EmployeeName.toLowerCase());
                if (employee) {
                  employeeId = employee.EmployeeID;
                  employeeBranchId = employee.BranchID;
                } else {
                  console.warn(`EmployeeName "${row.EmployeeName}" not found in employees list at row ${index + 1}`);
                }
              }

              let branchId = null;
              if (row.BranchName) {
                const branch = branches.find(br => br.BranchName.toLowerCase() === row.BranchName.toLowerCase());
                if (branch) {
                  branchId = branch.BranchID;
                } else {
                  console.warn(`BranchName "${row.BranchName}" not found in branches list at row ${index + 1}`);
                }
              }

              return {
                Date: parsedDate,
                EmployeeID: employeeId,
                BranchID: branchId,
                TimeIn: timeIn24,
                TimeOut: timeOut24,
                TimeInStatus: timeInStatus,
                EmployeeName: row.EmployeeName,
                BranchName: row.BranchName,
                EmployeeBranchID: employeeBranchId,
              };
            });

          const initialFilteredData = data.filter(row => {
            if (!row.EmployeeID) {
              message.error(`Employee "${row.EmployeeName}" not found in your assigned branch.`);
              return false;
            }
            if (!row.BranchID) {
              message.error(`Branch "${row.BranchName}" not found in the system.`);
              return false;
            }
            return true;
          });

          if (initialFilteredData.length === 0) {
            message.error("Invalid CSV File: Required fields missing or names not found.");
            return;
          }

          if (role === 'Payroll Staff') {
            const assignedBranchIds = assignedBranches.map(ab => String(ab.BranchID));
            const validationErrors = [];

            const validData = initialFilteredData.filter((row, index) => {
              if (!assignedBranchIds.includes(String(row.BranchID))) {
                validationErrors.push(`There is no Branch '${row.BranchName}' assigned to you at row ${index + 3}.`);
                return false;
              }

              if (String(row.EmployeeBranchID) !== String(row.BranchID)) {
                validationErrors.push(`There’s no employee named '${row.EmployeeName}' in the Branch of ${row.BranchName} at row ${index + 3}.`);
                return false;
              }

              return true;
            });

            if (validationErrors.length > 0) {
              message.error({
                content: validationErrors.join(' '),
                duration: 5,
              });
              if (validData.length === 0) return;
              data = validData;
            } else {
              data = validData;
            }
          } else {
            data = initialFilteredData;
          }

          if (data.length === 0) {
            return;
          }

          const payload = data.map(row => ({
            Date: row.Date,
            EmployeeID: row.EmployeeID,
            BranchID: row.BranchID,
            TimeIn: row.TimeIn,
            TimeOut: row.TimeOut,
            TimeInStatus: row.TimeInStatus,
          }));

          fetch(`${API_BASE_URL}/fetch_attendance.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => res.text().then(text => ({ status: res.status, text })))
            .then(({ status, text }) => {
              if (status !== 200) throw new Error(`Server error: ${text}`);
              const json = JSON.parse(text);

              if (json.success) {
                let messageContent = [];
                if (json.successCount > 0) messageContent.push(`Successfully imported ${json.successCount} new attendance record(s).`);
                if (json.updatedCount > 0) messageContent.push(`${json.updatedCount} existing record(s) updated with new data.`);
                if (messageContent.length > 0) {
                  message.success({ content: messageContent.join(" "), duration: 5 });
                  fetchData();
                } else if (json.allDuplicates) {
                  message.warning({ content: "All records in the CSV already exist. No changes made.", duration: 5 });
                } else if (json.errors && json.errors.length > 0) {
                  message.error({ content: "Issues: " . json.errors.join(" "), duration: 5 });
                } else {
                  message.error({ content: "No records processed. Check the CSV file.", duration: 5 });
                }
              } else {
                throw new Error(json.error || "Unexpected error during CSV import.");
              }
            })
            .catch((err) => {
              console.error("CSV Import Error:", err.message);
              message.error({ content: "Unable to import CSV. Check format or contact support.", duration: 5 });
            });
        },
      });
    };
    reader.readAsText(file);
  };

  const handleCsvButtonClick = () => {
    setIsCsvInstructionModalOpen(true);
  };

  const uploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      handleCSVUpload({ file });
      return false;
    },
  };

  const showLabels = screenWidth >= 600;
  const role = localStorage.getItem('role');

  const showBranchFilter = useMemo(() => {
    const shouldShow = role !== 'Payroll Staff' || (role === 'Payroll Staff' && assignedBranches.length > 1);
    console.log('Evaluating showBranchFilter - Role:', role, 'Assigned Branches Length:', assignedBranches.length, 'Result:', shouldShow);
    return shouldShow;
  }, [role, assignedBranches]);

  console.log('Rendering - Role:', role, 'Assigned Branches:', assignedBranches, 'Show Branch Filter:', showBranchFilter);

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Attendance
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Space>
          {showBranchFilter && (
            <Select
              value={selectedBranch}
              onChange={handleBranchChange}
              style={{
                width: screenWidth < 480 ? '100%' : '200px',
                marginTop: screenWidth < 480 ? 10 : 0,
                fontFamily: 'Poppins, sans-serif'
              }}
              placeholder="Filter by Branch"
            >
              <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>
                All Branches
              </Option>
              {(role === 'Payroll Staff' ? assignedBranches : branches).map(branch => (
                <Option
                  key={branch.BranchID}
                  value={branch.BranchID}
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  {branch.BranchName}
                </Option>
              ))}
            </Select>
          )}
        </Space>
        <Space>
          <Button
            icon={<PlusOutlined />}
            size="middle"
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
            onClick={() => openModal('Add')}
          >
            {showLabels && 'Add Attendance'}
          </Button>
          <Button
            icon={<UploadOutlined />}
            size="middle"
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
            onClick={handleCsvButtonClick}
          >
            {showLabels && 'Import CSV'}
          </Button>
          <Upload {...uploadProps} style={{ display: 'none' }}>
            <input id="csv-upload-input" type="file" style={{ display: 'none' }} />
          </Upload>
          <Input
            placeholder="Search Attendance Records"
            allowClear
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          />
        </Space>
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
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee ID</span>}
          dataIndex="employeeId"
          key="employeeId"
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Employee Name</span>}
          dataIndex="employeeName"
          key="employeeName"
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>}
          dataIndex="branch"
          key="branch"
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Check In</span>}
          dataIndex="timeIn"
          key="timeIn"
          sorter={(a, b) => moment(a.timeIn, 'HH:mm').diff(moment(b.timeIn, 'HH:mm'))}
          render={(text, record) => (
            <Space>
              <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>
              <Tag
                color={record.status === 'Late' ? 'volcano' : 'green'}
                style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}
              >
                {record.status}
              </Tag>
            </Space>
          )}
        />
        <Column
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Check Out</span>}
          dataIndex="timeOut"
          key="timeOut"
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
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('View', record)}
              >
                {showLabels && 'View'}
              </Button>
              <Button
                icon={<EditOutlined />}
                size="middle"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && 'Edit'}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="middle"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }}
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
        total={paginationTotal}
        onChange={handlePageChange}
        showSizeChanger
        showQuickJumper
        showTotal={(total) => `Total ${total} attendance records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Attendance' :
               modalType === 'Edit' ? 'Edit Attendance Details' :
               modalType === 'View' ? 'View Attendance Information' :
               'Confirm Attendance Deletion'}
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
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>}
              name="date"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
            >
              <DatePicker
                format={DATE_FORMAT}
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
                disabled={modalType === 'Add'}
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
              >
                {(role === 'Payroll Staff' && modalType === 'Add'
                  ? employees.filter(emp => assignedBranches.some(ab => ab.BranchID === emp.BranchID))
                  : employees).map((employee) => (
                    <Option
                      key={employee.EmployeeID}
                      value={employee.EmployeeID}
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      {employee.EmployeeName}
                    </Option>
                  ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="branchId"
              hidden
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch<span style={{ color: 'red' }}>*</span></span>}
              name="branchName"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch will be auto-set!</span> }]}
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              <Input
                placeholder="Employee Branch"
                disabled
                style={{ fontFamily: 'Poppins, sans-serif', color: '#000' }}
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Check In<span style={{ color: 'red' }}>*</span></span>}
              name="timeIn"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a Check In!</span> }]}
            >
              <TimePicker
                format="HH:mm"
                showSecond={false}
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Check Out<span style={{ color: 'red' }}>*</span></span>}
              name="timeOut"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a Check Out!</span> }]}
            >
              <TimePicker
                format="HH:mm"
                showSecond={false}
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
              />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedAttendance && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p><strong>Date:</strong> {selectedAttendance.date}</p>
            <p><strong>Employee Name:</strong> {selectedAttendance.employeeName}</p>
            <p><strong>Branch:</strong> {selectedAttendance.branch}</p>
            <p><strong>Check In:</strong> {selectedAttendance.timeIn}</p>
            <p><strong>Check Out:</strong> {selectedAttendance.timeOut}</p>
            <p><strong>Status:</strong> {selectedAttendance.status}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedAttendance && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this attendance record?
            </p>
            <p>This action <strong>cannot be undone</strong>. The attendance record for "<strong>{selectedAttendance.employeeName}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>

      <Modal
        title={<span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>How to Import Attendance CSV</span>}
        open={isCsvInstructionModalOpen}
        onOk={handleCsvInstructionOk}
        onCancel={handleCsvInstructionCancel}
        okText="Proceed with Upload"
        cancelText="Cancel"
        width={700}
        style={{ fontFamily: 'Poppins, sans-serif' }}
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
          <Text strong style={{ fontSize: '16px' }}>Steps to Create and Upload a CSV:</Text>
          <ol>
            <li>Create a spreadsheet (e.g., Excel, Google Sheets) with the following columns:</li>
            <ul>
              <li><strong>Date</strong>: The date of attendance (e.g., "04/06/2025"). Format: MM/DD/YYYY.</li>
              <li><strong>EmployeeName</strong>: Full name of the employee as it appears in the system (e.g., "John Doe").</li>
              <li><strong>BranchName</strong>: Exact branch name from the system (e.g., "Main Branch").</li>
              <li><strong>TimeIn</strong>: Check-in time in 24-hour format (e.g., "08:00").</li>
              <li><strong>TimeOut</strong>: Check-out time in 24-hour format (e.g., "17:00").</li>
            </ul>
            <li>Save the file as a CSV (e.g., "attendance.csv"). Ensure it’s comma-separated.</li>
            <li>After clicking "Proceed with Upload," select your CSV file to import.</li>
          </ol>

          <Text strong style={{ fontSize: '16px' }}>Example CSV Format:</Text>
          <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            Date, EmployeeName, BranchName, TimeIn, TimeOut
            04/06/2025, John Doe, Main Branch, 08:00, 17:00
            04/06/2025, Jane Smith, West Branch, 09:00, 18:00
          </pre>

          <Text strong style={{ fontSize: '16px' }}>Reminders:</Text>
          <ul>
            <li>Ensure <strong>EmployeeName</strong> and <strong>BranchName</strong> match exactly with system records (case-insensitive).</li>
            <li>Use <strong>24-hour time format without seconds</strong> (e.g., "08:00", not "08:00:00" or "8:00 AM").</li>
            <li>All fields are required—missing data will skip the row.</li>
            <li>Duplicate records (same EmployeeName and Date) will update existing entries.</li>
            <li>Check for errors after upload—invalid names or formats will be flagged.</li>
            <li>For Payroll Staff, only employees and branches assigned to you can be imported.</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default AttendanceTable;