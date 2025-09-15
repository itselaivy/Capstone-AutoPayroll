import React, { useState, useEffect, useMemo } from 'react';
import { Space, Table, Tag, Button, Input, Modal, Form, message, DatePicker, TimePicker, Select, Upload, Typography, Pagination, Tooltip, ConfigProvider, Row, Col, Card } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined, SolutionOutlined, FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Column } = Table;
const { Option } = Select;
const { Title, Text } = Typography;
const DATE_FORMAT = 'MM/DD/YYYY';

const AttendanceTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [modalBranchId, setModalBranchId] = useState('all');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [dateRange, setDateRange] = useState([null, null]);
  const [form] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [isCsvInstructionModalOpen, setIsCsvInstructionModalOpen] = useState(false);
  const [allAttendance, setAllAttendance] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryData, setSummaryData] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const getTotalOnTime = (employeeId) => {
    return allAttendance.filter(
      (item) => String(item.employeeId) === String(employeeId) && item.status === 'On-Time'
    ).length;
  };

  const getTotalLate = (employeeId) => {
    return allAttendance.filter(
      (item) => String(item.employeeId) === String(employeeId) && item.status === 'Late'
    ).length;
  };

  const getTotalAbsent = (employeeId) => {
    return allAttendance.filter(
      (item) => String(item.employeeId) === String(employeeId) && item.status === 'Absent'
    ).length;
  };

  const getTotalLeave = (employeeId) => {
    return allAttendance.filter(
      (item) => String(item.employeeId) === String(employeeId) && item.status === 'Leave'
    ).length;
  };

  const fetchDropdownData = async () => {
    setIsLoading(true);
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        throw new Error('Missing userId or role in localStorage. Please log in.');
      }

      const [branchesRes, employeesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_attendance.php?type=employees&user_id=${userId}&role=${encodeURIComponent(role)}`),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`)
      ]);

      if (!branchesRes.ok) throw new Error(`Branches fetch failed: ${branchesRes.status}`);
      if (!employeesRes.ok) throw new Error(`Employees fetch failed: ${employeesRes.status}`);
      if (!assignedBranchesRes.ok) throw new Error(`Assigned branches fetch failed: ${assignedBranchesRes.status}`);

      const [branchesData, employeesData, assignedBranchesResData] = await Promise.all([
        branchesRes.json(),
        employeesRes.json(),
        assignedBranchesRes.json()
      ]);

      if (!Array.isArray(branchesData)) {
        throw new Error('Branches data is not an array');
      }
      if (!Array.isArray(employeesData)) {
        throw new Error('Employees data is not an array');
      }
      if (!Array.isArray(assignedBranchesResData.data)) {
        throw new Error('Assigned branches data is not an array');
      }

      setBranches(branchesData);
      setEmployees(employeesData);
      setAssignedBranches(assignedBranchesResData.data || []);
      setFilteredEmployees(employeesData);
    } catch (err) {
      message.error(`Unable to load dropdown options: ${err.message}`);
      console.error('Fetch Dropdown Error:', err);
    } finally {
      setIsLoading(false);
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
      if (dateRange && dateRange[0] && dateRange[1]) {
        url += `&start_date=${dateRange[0].format('YYYY-MM-DD')}&end_date=${dateRange[1].format('YYYY-MM-DD')}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Attendance fetch failed: ${res.status}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch attendance');

      const mappedData = response.data.map(attendance => ({
        key: attendance.AttendanceID,
        date: moment(attendance.Date, 'YYYY-MM-DD').format(DATE_FORMAT),
        employeeId: attendance.EmployeeID,
        employeeName: attendance.EmployeeName,
        branchId: attendance.BranchID,
        branch: attendance.BranchName,
        timeIn: attendance.TimeIn,
        timeOut: attendance.TimeOut,
        status: attendance.TimeInStatus,
        totalHrs: attendance.TotalHours,
        totalOnTime: attendance.TotalOnTime,
        totalLate: attendance.TotalLate,
        totalAbsent: attendance.TotalAbsent
      }));

      setFilteredData(mappedData);
      setOriginalData(mappedData);
      setPaginationTotal(response.total);
      setServerTotal(response.total);
    } catch (err) {
      message.error(`Unable to load attendance data: ${err.message}`);
      console.error('Fetch error:', err);
    }
  };

  const fetchAllAttendance = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      let url = `${API_BASE_URL}/fetch_attendance.php?user_id=${userId}&role=${encodeURIComponent(role)}&all=1`;
      const res = await fetch(url);
      const response = await res.json();
      if (response.success) {
        setAllAttendance(response.data.map(attendance => ({
          employeeId: attendance.EmployeeID,
          status: attendance.TimeInStatus,
          timeOut: attendance.TimeOut,
          date: attendance.Date
        })));
      }
    } catch (err) {
      console.error('Fetch All Attendance Error:', err);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
    fetchAllAttendance();
  }, [currentPage, pageSize, selectedBranch, dateRange]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
    setCurrentPage(1);
  };

  const handleSearch = (value) => {
    setSearchText(value);
    const lowerValue = value.toLowerCase().trim();
    const newFilteredData = originalData.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(lowerValue)
      )
    );
    setFilteredData(newFilteredData);
    setPaginationTotal(value ? newFilteredData.length : serverTotal);
    setCurrentPage(1);
  };

  const handleBranchChange = (branchId, context) => {
    if (context === 'table') {
      setSelectedBranch(branchId);
      setCurrentPage(1);

      let filtered;
      const role = localStorage.getItem('role');
      if (role === "Payroll Staff") {
        if (branchId === "all") {
          filtered = employees.filter(emp =>
            assignedBranches.some(ab => ab.BranchID === emp.BranchID)
          );
        } else {
          filtered = employees.filter(
            emp =>
              String(emp.BranchID) === String(branchId) &&
              assignedBranches.some(ab => ab.BranchID === emp.BranchID)
          );
        }
      } else {
        if (branchId === "all") {
          filtered = employees;
        } else {
          filtered = employees.filter(
            emp => String(emp.BranchID) === String(branchId)
          );
        }
      }
      setFilteredEmployees(filtered);
      form.setFieldsValue({ employeeId: undefined });
    } else if (context === 'modal') {
      setModalBranchId(branchId);
      let filtered;
      const role = localStorage.getItem('role');
      if (role === "Payroll Staff") {
        if (branchId === "all") {
          filtered = employees.filter(emp =>
            assignedBranches.some(ab => ab.BranchID === emp.BranchID)
          );
        } else {
          filtered = employees.filter(
            emp =>
              String(emp.BranchID) === String(branchId) &&
              assignedBranches.some(ab => ab.BranchID === emp.BranchID)
          );
        }
      } else {
        if (branchId === "all") {
          filtered = employees;
        } else {
          filtered = employees.filter(
            emp => String(emp.BranchID) === String(branchId)
          );
        }
      }
      setFilteredEmployees(filtered);
      form.setFieldsValue({ employeeId: undefined });
    }
  };

  const handleEmployeeChange = (employeeId) => {
    setSelectedAttendance({ ...selectedAttendance, employeeId });
    const employee = employees.find(emp => emp.EmployeeID === employeeId);
    if (employee && employee.BranchID) {
      const branch = branches.find(br => String(br.BranchID) === String(employee.BranchID));
      form.setFieldsValue({
        branchId: branch ? String(employee.BranchID) : '',
        branchName: branch ? branch.BranchName : 'Branch Not Found'
      });
    } else {
      form.setFieldsValue({
        branchId: '',
        branchName: 'No Branch Assigned'
      });
      message.warning('Selected employee has no assigned branch');
    }
  };

  const handlePageChange = (page, pageSize) => {
    setCurrentPage(page);
    setPageSize(pageSize);
  };

  const handleAttendanceSummary = async () => {
    try {
      const values = await form.validateFields();
      const [startDate, endDate] = values.date || [];

      if (!startDate || !endDate) {
        throw new Error("Please select a date range");
      }

      const employeeId = values.employeeId;
      const branchId = values.BranchId === "all" ? null : values.BranchId;
      const startDateStr = startDate.format('YYYY-MM-DD');
      const endDateStr = endDate.format('YYYY-MM-DD');

      const employee = employees.find(emp => emp.EmployeeID === employeeId);
      const branch = employee && employee.BranchID
        ? branches.find(br => String(br.BranchID) === String(employee.BranchID))
        : null;

      const filteredAttendance = allAttendance.filter(att =>
        String(att.employeeId) === String(employeeId) &&
        moment(att.date, 'YYYY-MM-DD').isBetween(startDateStr, endDateStr, null, '[]')
      );

      const summary = {
        totalAttendance: filteredAttendance.filter(att => att.status === 'On-Time' || att.status === 'Late').length,
        onTime: filteredAttendance.filter(att => att.status === 'On-Time').length,
        late: filteredAttendance.filter(att => att.status === 'Late').length,
        absences: filteredAttendance.filter(att => att.status === 'Absent').length,
        leave: filteredAttendance.filter(att => att.status === 'Leave').length
      };

      setSummaryData({
        employeeName: employee ? employee.EmployeeName : 'Unknown',
        branchName: branch ? branch.BranchName : 'No Branch Assigned',
        startDate: startDate.format(DATE_FORMAT),
        endDate: endDate.format(DATE_FORMAT),
        summary
      });
      setIsSummaryModalOpen(true);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error generating attendance summary:", error);
      message.error("Failed to generate summary: " + error.message);
    }
  };

  const openModal = async (type, record = null) => {
    setModalType(type);
    setSelectedAttendance(record);
    setIsModalOpen(true);
    setModalBranchId('all');
    setFilteredEmployees(employees);

    if (record) {
      const branch = branches.find(br => String(br.BranchID) === String(record.branchId));
      form.setFieldsValue({
        date: moment(record.date, DATE_FORMAT),
        employeeId: record.employeeId,
        branchId: record.branchId,
        branchName: branch ? branch.BranchName : 'Branch Not Found',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        branchId: 'all',
        branchName: ''
      });
    }
  };

  const handleOk = async () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "ViewSummary") {
      await handleAttendanceSummary();
      return;
    }

    if (modalType === "Add") {
      try {
        const values = await form.validateFields();
        const timeIn = values.timeIn.format('HH:mm');
        const timeInMoment = moment(timeIn, 'HH:mm');
        const lateThreshold = moment('08:11', 'HH:mm');
        const startDuty = moment('08:00', 'HH:mm');
        const timeInStatus = timeInMoment.isBefore(startDuty) ||
          (timeInMoment.isSameOrAfter(startDuty) && timeInMoment.isBefore(lateThreshold))
          ? 'On-Time' : 'Late';
        const totalHours = values.timeOut.diff(values.timeIn, 'hours', true);

        const employee = employees.find(emp => emp.EmployeeID === values.employeeId);
        if (!employee || !employee.BranchID) {
          throw new Error('Selected employee has no assigned branch');
        }
        const branch = branches.find(br => String(br.BranchID) === String(employee.BranchID));
        if (!branch) {
          throw new Error('Branch not found for the selected employee');
        }

        const payload = {
          Date: values.date.format('YYYY-MM-DD'),
          EmployeeID: values.employeeId,
          BranchID: parseInt(employee.BranchID),
          TimeIn: timeIn,
          TimeOut: values.timeOut.format('HH:mm'),
          TimeInStatus: timeInStatus,
          TotalHours: totalHours
        };

        const res = await fetch(`${API_BASE_URL}/fetch_attendance.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Server error: ${res.statusText} - ${errorText}`);
        }

        const data = await res.json();
        if (data.success) {
          message.success(`Attendance record added successfully.`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
          fetchAllAttendance();
        } else {
          throw new Error(data.error || "An unexpected error occurred.");
        }
      } catch (err) {
        console.error('Add Error:', err);
        message.error(
          err.message.includes("already exists")
            ? `An attendance record for this employee on ${moment(form.getFieldValue('date')).format('MM/DD/YYYY')} already exists.`
            : `Failed to add the attendance record: ${err.message}`
        );
      }
    } else if (modalType === "Edit" && selectedAttendance) {
      try {
        const values = await form.validateFields();
        const timeIn = values.timeIn.format('HH:mm');
        const timeInMoment = moment(timeIn, 'HH:mm');
        const lateThreshold = moment('08:11', 'HH:mm');
        const startDuty = moment('08:00', 'HH:mm');
        const timeInStatus = timeInMoment.isBefore(startDuty) ||
          (timeInMoment.isSameOrAfter(startDuty) && timeInMoment.isBefore(lateThreshold))
          ? 'On-Time' : 'Late';
        const totalHours = values.timeOut.diff(values.timeIn, 'hours', true);

        const payload = {
          Date: values.date.format('YYYY-MM-DD'),
          EmployeeID: selectedAttendance.employeeId,
          BranchID: parseInt(selectedAttendance.branchId),
          TimeIn: timeIn,
          TimeOut: values.timeOut.format('HH:mm'),
          TimeInStatus: timeInStatus,
          AttendanceID: selectedAttendance.key,
          TotalHours: totalHours
        };

        console.log('Edit Payload:', payload);

        const res = await fetch(`${API_BASE_URL}/fetch_attendance.php`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Server error: ${res.statusText} - ${errorText}`);
        }

        const data = await res.json();
        if (data.success) {
          message.success(`Attendance record updated successfully.`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
          fetchAllAttendance();
        } else {
          throw new Error(data.error || "An unexpected error occurred.");
        }
      } catch (err) {
        console.error('Edit Error:', err);
        message.error(
          err.message.includes("already exists")
            ? `An attendance record for this employee on ${moment(form.getFieldValue('date')).format('MM/DD/YYYY')} already exists.`
            : `Failed to update the attendance record: ${err.message}`
        );
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setModalBranchId('all');
    setFilteredEmployees(employees);
    form.resetFields();
    setModalType('');
  };

  const handleSummaryModalClose = () => {
    setIsSummaryModalOpen(false);
    setSummaryData({});
  };

  const AttendanceSummaryModal = ({ visible, onClose, summaryData, setIsSummaryModalOpen, setSummaryData }) => {
    // Debug: Log summaryData to inspect branchName
    console.log('summaryData in AttendanceSummaryModal:', summaryData);

    const exportAttendanceSummaryPDF = () => {
      const doc = new jsPDF();
      console.log('jsPDF instance:', doc);

      // Set document title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Attendance Summary', 14, 20);

      // Add header information
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Employee Name: ${summaryData.employeeName || 'N/A'}`, 14, 30);
      doc.text(`Branch: ${summaryData.branchName || 'No Branch Assigned'}`, 14, 40);
      doc.text(`Date Range: ${summaryData.startDate || 'N/A'} to ${summaryData.endDate || 'N/A'}`, 14, 50);

      // Define table data
      const tableData = [
        ['Employee Name', summaryData.employeeName || 'N/A'],
        ['Branch', summaryData.branchName || 'No Branch Assigned'],
        ['Date Range', `${summaryData.startDate || 'N/A'} to ${summaryData.endDate || 'N/A'}`],
        ['Total Attendance', summaryData.summary?.totalAttendance || 0],
        ['On-Time', summaryData.summary?.onTime || 0],
        ['Late', summaryData.summary?.late || 0],
        ['Absences', summaryData.summary?.absences || 0],
        ['Leave', summaryData.summary?.leave || 0],
      ];

      // Use autoTable for structured table
      autoTable(doc, {
        startY: 60,
        head: [['Description', 'Value']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [44, 55, 67], // Match button color (#2C3743)
          textColor: [255, 255, 255],
          fontSize: 12,
          font: 'helvetica',
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 10,
          font: 'helvetica',
          textColor: [0, 0, 0],
        },
        alternateRowStyles: {
          fillColor: [240, 240, 240],
        },
        margin: { left: 14, right: 14 },
        styles: {
          cellPadding: 3,
          lineWidth: 0.2,
          lineColor: [0, 0, 0],
        },
      });

      // Save the PDF
      try {
        doc.save(`attendance_summary_${summaryData.employeeName || 'employee'}.pdf`);
      } catch (error) {
        console.error('PDF save failed:', error);
        message.error('Failed to save PDF: ' + error.message);
      }
    };

    // Table data for the modal
    const tableData = [
      { key: 'employeeName', description: 'Employee Name', value: summaryData.employeeName || 'N/A' },
      { key: 'branchName', description: 'Branch', value: summaryData.branchName || 'No Branch Assigned' },
      { key: 'dateRange', description: 'Date Range', value: `${summaryData.startDate || 'N/A'} to ${summaryData.endDate || 'N/A'}` },
      { key: 'totalAttendance', description: 'Total Attendance', value: summaryData.summary?.totalAttendance || 0 },
      { key: 'onTime', description: 'On-Time', value: summaryData.summary?.onTime || 0 },
      { key: 'late', description: 'Late', value: summaryData.summary?.late || 0 },
      { key: 'absences', description: 'Absences', value: summaryData.summary?.absences || 0 },
      { key: 'leave', description: 'Leave', value: summaryData.summary?.leave || 0 },
    ];

    const columns = [
      { title: 'Description', dataIndex: 'description', key: 'description' },
      { title: 'Value', dataIndex: 'value', key: 'value' },
    ];

    return (
      <Modal
        title={<span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>Attendance Summary</span>}
        open={visible}
        onOk={onClose}
        onCancel={onClose}
        okText="Close"
        cancelText="Cancel"
        width={600}
        style={{ fontFamily: 'Poppins, sans-serif' }}
        footer={[
          <Button
            key="download"
            type="primary"
            icon={<FileTextOutlined />}
            onClick={exportAttendanceSummaryPDF}
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
          >
            Export Report
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setIsSummaryModalOpen(false);
              setSummaryData({});
            }}
          >
            Close
          </Button>,
        ]}
      >
        <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Card
                bordered={false}
                style={{
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  borderRadius: '8px',
                }}
              >
                <Title level={4} style={{ marginBottom: '16px', fontFamily: 'Poppins, sans-serif' }}>
                  Attendance Summary for {summaryData.employeeName || 'N/A'}
                </Title>
                <Table
                  columns={columns}
                  dataSource={tableData}
                  pagination={false}
                  size="small"
                  bordered
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                  rowClassName={() => 'ant-table-row-custom'}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </Modal>
    );
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
                  console.warn(`EmployeeName "${row.EmployeeName}" not found in employees list at row ${index + 2}`);
                }
              }

              let branchId = null;
              if (row.BranchName) {
                const branch = branches.find(br => br.BranchName.toLowerCase() === row.BranchName.toLowerCase());
                if (branch) {
                  branchId = branch.BranchID;
                } else {
                  console.warn(`BranchName "${row.BranchName}" not found in branches list at row ${index + 2}`);
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

          const initialFilteredData = data.filter((row, index) => {
            if (!row.EmployeeID) {
              message.error(`Row ${index + 2}: Employee "${row.EmployeeName}" not found in your assigned branch.`);
              return false;
            }
            if (!row.BranchID) {
              message.error(`Row ${index + 2}: Branch "${row.BranchName}" not found in the system.`);
              return false;
            }
            return true;
          });

          if (initialFilteredData.length === 0) {
            message.error("Invalid CSV File: No valid records found. Ensure EmployeeName and BranchName match system records.");
            return;
          }

          let validData = initialFilteredData;
          if (role === 'Payroll Staff') {
            const assignedBranchIds = assignedBranches.map(ab => Number(ab.BranchID));
            const validationErrors = [];

            validData = initialFilteredData.filter((row, index) => {
              if (!assignedBranchIds.includes(Number(row.BranchID))) {
                validationErrors.push(`Row ${index + 2}: Branch "${row.BranchName}" is not assigned to you.`);
                return false;
              }
              if (Number(row.EmployeeBranchID) !== Number(row.BranchID)) {
                validationErrors.push(`Row ${index + 2}: Employee "${row.EmployeeName}" is not in Branch "${row.BranchName}".`);
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
            }
          }

          if (validData.length === 0) {
            message.error("No valid records to import after validation. Check CSV data and try again.");
            return;
          }

          const payload = validData.map(row => ({
            Date: row.Date,
            EmployeeID: row.EmployeeID,
            BranchID: row.BranchID,
            TimeIn: row.TimeIn,
            TimeOut: row.TimeOut,
            TimeInStatus: row.TimeInStatus,
          }));

          console.log('CSV Upload Payload:', payload);

          fetch(`${API_BASE_URL}/fetch_attendance.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then(res => res.text().then(text => ({ status: res.status, text })))
            .then(({ status, text }) => {
              if (status !== 200) throw new Error(`Server error: ${status} - ${text}`);
              const json = JSON.parse(text);

              if (json.success) {
                let messageContent = [];
                if (json.successCount > 0) messageContent.push(`Successfully imported ${json.successCount} new attendance record(s).`);
                if (json.updatedCount > 0) messageContent.push(`${json.updatedCount} existing record(s) updated with new data.`);
                if (json.errors && json.errors.length > 0) messageContent.push(`Issues: ${json.errors.join(" ")}`);
                if (messageContent.length > 0) {
                  message.success({ content: messageContent.join(" "), duration: 5 });
                  fetchData();
                  fetchAllAttendance();
                } else if (json.allDuplicates) {
                  message.warning({ content: "All records in the CSV already exist. No changes made.", duration: 5 });
                } else {
                  message.error({ content: "No records processed. Check the CSV file format.", duration: 5 });
                }
              } else {
                throw new Error(json.error || "Unexpected error during CSV import.");
              }
            })
            .catch(err => {
              console.error("CSV Import Error:", err.message);
              message.error({ content: `Unable to import CSV: ${err.message}. Check format or contact support.`, duration: 5 });
            });
        },
        error: err => {
          console.error("Papa Parse Error:", err);
          message.error("Failed to parse CSV file. Ensure it is a valid CSV with the correct format.");
        }
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
    return shouldShow;
  }, [role, assignedBranches]);

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Date: '04/06/2025',
        EmployeeName: 'John Doe',
        BranchName: 'Main Branch',
        TimeIn: '08:00',
        TimeOut: '17:00',
      },
    ];
    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'attendance_template.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  const employeesWithAttendance = employees.map(emp => {
    const totalAttendance = allAttendance.filter(
      att => String(att.employeeId) === String(emp.EmployeeID)
    ).length;
    return {
      ...emp,
      TotalAttendance: totalAttendance,
      TotalAbsent: getTotalAbsent(emp.EmployeeID),
      TotalLeave: getTotalLeave(emp.EmployeeID),
      TotalOnTime: getTotalOnTime(emp.EmployeeID),
      TotalLate: getTotalLate(emp.EmployeeID),
    };
  });

  return (
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="fade-in" style={{ padding: '20px' }}>
        <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
          Attendance
        </Title>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Space>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              format={DATE_FORMAT}
              style={{
                width: screenWidth < 480 ? '100%' : '250px',
                marginTop: screenWidth < 480 ? 10 : 0,
                fontFamily: 'Poppins, sans-serif'
              }}
              placeholder={['Start Date', 'End Date']}
            />
            {showBranchFilter && (
              <Select
                value={selectedBranch}
                onChange={(value) => handleBranchChange(value, 'table')}
                style={{
                  width: screenWidth < 480 ? '100%' : '200px',
                  marginTop: screenWidth < 480 ? 10 : 0,
                  fontFamily: 'Poppins, sans-serif'
                }}
                placeholder="Filter by Branch"
                loading={isLoading}
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
              icon={<SolutionOutlined />}
              size="middle"
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
              onClick={() => openModal('ViewSummary')}
            >
              {showLabels && 'Attendance Summary'}
            </Button>
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
            title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Total Hours</span>}
            dataIndex="totalHrs"
            key="totalHrs"
            render={hours => {
              const num = Number(hours);
              return (hours !== null && hours !== undefined && hours !== '' && !isNaN(num))
                ? num.toFixed(2)
                : '';
            }}
          />
          <Column
            title="Action"
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
                      color: 'white'
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
                      color: 'white'
                    }}
                    onClick={() => openModal('Edit', record)}
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
                {modalType === 'ViewSummary' ? 'Attendance Summary Filter' :
                  modalType === 'Add' ? 'Add New Attendance' :
                    modalType === 'Edit' ? 'Edit Attendance Details' :
                      modalType === 'View' ? 'View Attendance Information' :
                        'Delete Attendance'}
              </span>
            </div>
          }
          open={isModalOpen}
          onOk={handleOk}
          onCancel={handleCancel}
          okButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
          cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
          width={600}
          centered
        >
          {modalType === 'ViewSummary' && (
            <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Form.Item
                label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>}
                name="date"
                rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
              >
                <DatePicker.RangePicker
                  format={DATE_FORMAT}
                  style={{ width: '80%', fontFamily: 'Poppins, sans-serif' }}
                />
              </Form.Item>
              <Form.Item
                label={<span>Branch<span style={{ color: 'red' }}>*</span></span>}
                name="BranchId"
                rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a branch!</span> }]}
              >
                <Select
                  showSearch
                  onChange={(value) => handleBranchChange(value, 'modal')}
                  style={{
                    width: screenWidth < 768 ? '100%' : '410px',
                    marginTop: screenWidth < 480 ? 10 : 0,
                    fontFamily: 'Poppins, sans-serif'
                  }}
                  placeholder="Select a Branch"
                  loading={isLoading}
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
                  filterOption={(input, option) =>
                    option?.children?.toLowerCase().includes(input.toLowerCase())
                  }
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    width: screenWidth < 768 ? '100%' : '410px'
                  }}
                  disabled={!modalBranchId || isLoading}
                >
                  {(filteredEmployees || []).map((employee) => (
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
            </Form>
          )}

          {modalType === 'Add' && (
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
                noStyle
                rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch ID is missing!</span> }]}
              >
                <Input type="hidden" />
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

          {modalType === 'Edit' && (
            <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Form.Item
                label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date<span style={{ color: 'red' }}>*</span></span>}
                name="date"
                rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a date!</span> }]}
              >
                <DatePicker
                  format={DATE_FORMAT}
                  style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }}
                  onWheel={(e) => e.stopPropagation()}
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
              <br />
              <h4><strong>Attendance Summary:</strong></h4>
              <p><strong>Total Attendance:</strong> {originalData.filter(item => item.employeeId === selectedAttendance.employeeId).length}</p>
              <p><strong>Total On-time:</strong> {getTotalOnTime(selectedAttendance.employeeId)}</p>
              <p><strong>Total Late:</strong> {getTotalLate(selectedAttendance.employeeId)}</p>
              <p><strong>Total Absent:</strong> {getTotalAbsent(selectedAttendance.employeeId)}</p>
              <p><strong>Total Leave:</strong> {getTotalLeave(selectedAttendance.employeeId)}</p>
            </div>
          )}
        </Modal>

        <AttendanceSummaryModal
          visible={isSummaryModalOpen}
          onClose={handleSummaryModalClose}
          summaryData={summaryData}
          setIsSummaryModalOpen={setIsSummaryModalOpen}
          setSummaryData={setSummaryData}
        />

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
            <Button
              key="download"
              onClick={handleDownloadTemplate}
              style={{ backgroundColor: '#3291AD', borderColor: '#3291AD', color: 'white', fontFamily: 'Poppins, sans-serif', marginRight: 8 }}
            >
              Download Template
            </Button>,
            <Upload key="upload" {...uploadProps}>
              <Button type="primary" onClick={handleCsvInstructionOk} style={{ backgroundColor: '#9532AD', borderColor: '#9532AD', color: 'white', fontFamily: 'Poppins, sans-serif' }}>
                Proceed with Upload
              </Button>
            </Upload>,
          ]}
        >
          <div style={{ fontFamily: 'Poppins, sans-serif', lineHeight: '1.6' }}>
            <Text strong style={{ fontSize: '16px' }}>Steps on how to Upload a CSV File:</Text>
            <ol>
              <li>Download the template CSV file using the "Download Template" button below.</li>
              <li>Fill the spreadsheet with the following columns:</li>
              <ul>
                <li><strong>Date</strong>: The date of attendance (e.g., "04/06/2025"). Format: MM/DD/YYYY.</li>
                <li><strong>EmployeeName</strong>: Full name of the employee as it appears in the system (e.g., "John Doe").</li>
                <li><strong>BranchName</strong>: Exact branch name from the system (e.g., "Main Branch").</li>
                <li><strong>TimeIn</strong>: Check-in time in 24-hour format (e.g., "08:00").</li>
                <li><strong>TimeOut</strong>: Check-out time in 24-hour format (e.g., "17:00").</li>
              </ul>
              <li>Double check if the file format is a CSV (e.g., "attendance.csv").</li>
              <li>After clicking "Proceed with Upload," select your CSV file to import.</li>
            </ol>

            <Text strong style={{ fontSize: '16px' }}>Reminders:</Text>
            <ul>
              <li>Ensure <strong>EmployeeName</strong> and <strong>BranchName</strong> match exactly with system records (case-insensitive).</li>
              <li>Use <strong>24-hour time format</strong> (e.g., "08:00", not "08:00:00" or "8:00 AM").</li>
              <li>All fields are required—missing data will skip the row.</li>
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

export default AttendanceTable;