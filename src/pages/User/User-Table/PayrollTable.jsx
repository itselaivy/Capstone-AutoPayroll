import { useState, useEffect, useCallback } from 'react';
import { Space, Table, Button, Input, Select, Tag, Typography, Pagination, message, Modal, DatePicker, Form, Alert, Spin, Row, Col, Card } from 'antd';
import { FileTextOutlined, SearchOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { RangePicker } = DatePicker
const parseAmount = (value, employeeId = 'Unknown') => {
  if (value == null || value === '' || value === undefined) {
    console.warn(`parseAmount: Invalid value for EmployeeID ${employeeId}: ${value}`);
    return 0.00;
  }
  const cleaned = typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : String(value);
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || !isFinite(parsed)) {
    console.warn(`parseAmount: Failed to parse value for EmployeeID ${employeeId}: ${value}`);
    return 0.00;
  }
  return parsed;
};

const { Column } = Table;
const { Option } = Select;
const { Title, Text } = Typography;

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const countWorkingDays = (startDate, endDate) => {
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  let workingDays = 0;

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    if (current.day() >= 1 && current.day() <= 6) {
      workingDays++;
    }
    current = current.add(1, 'day');
  }

  return workingDays;
};

const generatePayrollPeriods = (lastPayrollDate) => {
  if (!lastPayrollDate) return [];

  const periods = [];
  let startDate = dayjs(lastPayrollDate);

  if (startDate.day() === 0) {
    startDate = startDate.add(1, 'day');
  }

  let currentDate = startDate;
  let standardDays = 0;
  let endDate;

  while (standardDays < 12) {
    if (currentDate.day() !== 0) {
      standardDays++;
    }
    currentDate = currentDate.add(1, 'day');
  }

  endDate = currentDate.subtract(1, 'day');

  periods.push({
    cut: 'First Cut',
    startDate: startDate.format('MM/DD/YYYY'),
    endDate: endDate.format('MM/DD/YYYY'),
  });

  return periods;
};

const wrapName = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  if (parts.length === 1) return fullName;
  // First word on first line, rest on second line
  return parts[0] + '\n' + parts.slice(1).join(' ');
};

const PayrollTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [branches, setBranches] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [payrollDates, setPayrollDates] = useState({ startDate: null, endDate: null });
  const [payrollCut, setPayrollCut] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [isPayslipModalVisible, setIsPayslipModalVisible] = useState(false);
  const [payslipData, setPayslipData] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isBulkPayslipModalVisible, setIsBulkPayslipModalVisible] = useState(false);
  const [bulkPayslipData, setBulkPayslipData] = useState([]);
  const [payrollHistoryData, setPayrollHistoryData] = useState([]);
  const [isPayrollViewModalVisible, setIsPayrollViewModalVisible] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [historyDateRange, setHistoryDateRange] = useState([null, null]);
  const [computedStartDate, setComputedStartDate] = useState(null);
  const [workingDaysList, setWorkingDaysList] = useState([]);
  const [payrollPeriodText, setPayrollPeriodText] = useState('');

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  const handleViewPayroll = (record) => {
    const matchingPayrolls = payrollHistoryData.filter(
      (item) =>
        item.payrollPeriod === record.payrollPeriod &&
        dayjs(item.createdAt).isSame(dayjs(record.createdAt), 'second')
    );
    setSelectedPayroll(matchingPayrolls);
    setIsPayrollViewModalVisible(true);
  };

  const parseActivityDescription = (description, affectedId) => {
    const lines = description.split('\n');
    const parsedData = {};

    lines.forEach(line => {
      const [key, value] = line.split(': ').map(str => str.trim());
      if (!key || !value) return;

      try {
        if (key.toLowerCase() === 'employeeid') {
          const idMatch = value.match(/(\d+)/);
          parsedData.employeeId = idMatch ? idMatch[1] : null;
          const nameMatch = value.match(/\(([^)]*)\)/) || value.match(/(\w[\w\s\-.]*)/);
          parsedData.employeeName = nameMatch ? nameMatch[1].trim() : 'Unknown';
          if (!parsedData.employeeId) {
          }
        } else if (key === 'Employee Name') {
          parsedData.employeeName = value || parsedData.employeeName || 'Unknown';
        } else if (key === 'Payroll Period') {
          parsedData.payrollPeriod = value;
        } else if (key === 'Cut Off') {
          parsedData.cutOff = value;
        } else if (key === 'Daily Rate') {
          parsedData.dailyRate = value.replace('₱', '');
        } else if (key === 'Basic Rate') {
          parsedData.basicRate = value.replace('₱', '');
        } else if (key === 'Basic Pay') {
          parsedData.basicPay = value.replace('₱', '');
        } else if (key.includes('Overtime Pay')) {
          parsedData.overtimePay = value.replace('₱', '');
        } else if (key.includes('Sunday Pay')) {
          parsedData.sundayPay = value.replace('₱', '');
        } else if (key.includes('Holiday Pay')) {
          parsedData.holidayPay = value.replace('₱', '');
        } else if (key.includes('Gross Pay')) {
          parsedData.grossPay = value.replace('₱', '');
        } else if (key.includes('Total Deductions')) {
          parsedData.totalDeductions = value.replace('₱', '');
        } else if (key.includes('Net Pay')) {
          parsedData.netPay = value.replace('₱', '');
        }
      } catch (err) {
      }
    });

    let employeeId = parsedData.employeeId;
    if (!employeeId && affectedId && /^\d+$/.test(affectedId)) {
      employeeId = affectedId;
    }
    if (!employeeId) {
      const fallbackMatch = description.match(/EmployeeID[^\d]*(\d+)/i);
      employeeId = fallbackMatch ? fallbackMatch[1] : 'Unknown';
    }
    parsedData.employeeId = employeeId;
    parsedData.employeeName = parsedData.employeeName || 'Unknown';

    if (parsedData.employeeId === 'Unknown') {
    }

    return parsedData;
  };

  const logActivity = async (activityData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/log_activity.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activityData),
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Activity logging failed');
    } catch (err) {
      message.warning('Failed to log activity');
    }
  };

  const computePayrollPeriodRange = (lastPayrollDate) => {
    if (!lastPayrollDate) return { start: null, end: null };
    let count = 0;
    let current = dayjs(lastPayrollDate);
    let workingDays = [];
    while (count < 11) {
      current = current.subtract(1, 'day');
      if (current.day() !== 0) { // 0 = Sunday
        workingDays.unshift(current);
        count++;
      }
    }
    return { start: workingDays[0], end: dayjs(lastPayrollDate) };
  };

  const fetchDropdownData = async () => {
    try {
      if (!userId || !role) throw new Error('Missing userId or role');
      const [branchesRes, assignedBranchesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_payroll.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`)
      ]);

      if (!branchesRes.ok || !assignedBranchesRes.ok) {
        throw new Error('Failed to fetch dropdown data');
      }

      const [branchesData, assignedBranchesData] = await Promise.all([
        branchesRes.json(),
        assignedBranchesRes.json()
      ]);

      setBranches(branchesData);
      setAssignedBranches(assignedBranchesData.data || []);
    } catch (err) {
      message.error(`Failed to load dropdown data: ${err.message}`);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      if (!userId || !role) {
        message.error('Please log in to view payroll records');
        return;
      }

      let startDateBackend, endDateBackend;

      if (!payrollDates.startDate || !payrollDates.endDate || !payrollCut) {
        startDateBackend = dayjs().subtract(3, 'year').format('YYYY-MM-DD');
        endDateBackend = dayjs().format('YYYY-MM-DD');
      } else {
        startDateBackend = dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
        endDateBackend = dayjs(payrollDates.endDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      }

      let url = `${API_BASE_URL}/fetch_payroll.php?user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      if (selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      if (searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }
      url += `&start_date=${startDateBackend}&end_date=${endDateBackend}&payroll_cut=${payrollCut || 'first'}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Payroll fetch failed: ${res.statusText} - ${errorText}`);
      }
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch payroll records');

      const mappedData = response.data.map(employee => ({
        key: employee.EmployeeID,
        employeeId: employee.EmployeeID,
        employeeName: employee.EmployeeName,
        branchId: employee.BranchID,
        branchName: employee.BranchName,
        hourlyMinimumWage: parseFloat(employee.HourlyMinimumWage).toFixed(3),
        allowances: employee.AllowancesData.map((allowance, index) => ({
          AllowanceID: allowance.AllowanceID || `allowance-${index}`,
          description: allowance.Description,
          amount: parseFloat(allowance.Amount).toFixed(2)
        })),
        contributions: employee.ContributionsData.map((contribution, index) => ({
          contributionId: contribution.ID || `contribution-${employee.EmployeeID}-${index}`,
          key: contribution.ID ? `contribution-${contribution.ID}` : `contribution-${employee.EmployeeID}-${index}`,
          type: contribution.ContributionType,
          amount: parseFloat(contribution.Amount).toFixed(2),
          balance: parseFloat(contribution.Balance || '0').toFixed(2),
        })),
        lateMinutes: parseInt(employee.LateMinutes, 10) || 0,
        undertimeMinutes: parseInt(employee.UndertimeMinutes, 10) || 0,
        hoursWorked: parseFloat(employee.HoursWorked).toFixed(2)
      }));

      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
      if (payrollDates.startDate && payrollDates.endDate) {
        setFilteredPaginationTotal(response.total);
      }
    } catch (err) {
      message.error(`Failed to load payroll data: ${err.message}`);
      setOriginalData([]);
      setFilteredData([]);
      setPaginationTotal(0);
      if (payrollDates.startDate && payrollDates.endDate) {
        setFilteredPaginationTotal(0);
      }
    }
  }, [userId, role, currentPage, pageSize, selectedBranch, searchText, payrollDates, payrollCut]);

  const debouncedFetchData = useCallback(debounce(fetchData, 100), [fetchData]);

  const handleGeneratePayslip = async (employeeId) => {
    setPayslipLoading(true);
    setIsPayslipModalVisible(true);
    setSelectedEmployee(employeeId);
    try {
      const startDate = dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      const endDate = dayjs(payrollDates.endDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      const payload = {
        action: 'generate_payslip',
        user_id: parseInt(userId),
        employeeId,
        start_date: startDate,
        end_date: endDate,
        payroll_cut: payrollCut,
      };

      const response = await fetch(`${API_BASE_URL}/fetch_payroll.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        message.error(`Failed to generate payslip: HTTP ${response.status} - ${errorText}`);
        setPayslipLoading(false);
        return;
      }

      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        message.error('Server returned an invalid response');
        setPayslipLoading(false);
        return;
      }

      const data = await response.json();
      if (!data.success) {
        message.error(`Failed to generate payslip: ${data.error || 'Unknown error'}`);
        setPayslipLoading(false);
        return;
      }

      // Calculate Days Present
      const expectedDays = countWorkingDays(payrollDates.startDate, payrollDates.endDate);
      const absentDays = parseInt(data.data.AbsentDays) || 0;
      const leaveDays = data.data.LeaveData && Array.isArray(data.data.LeaveData)
        ? data.data.LeaveData.reduce((sum, leave) => {
          const leaveStart = dayjs(leave.StartDate);
          const leaveEnd = dayjs(leave.EndDate);
          const payrollStart = dayjs(startDate);
          const payrollEnd = dayjs(endDate);
          if (
            (leaveStart.isSame(payrollStart, 'day') || leaveStart.isAfter(payrollStart)) &&
            (leaveEnd.isSame(payrollEnd, 'day') || leaveEnd.isBefore(payrollEnd))
          ) {
            return sum + (parseInt(leave.UsedLeaveCredits) || 0);
          }
          return sum;
        }, 0)
        : 0;
      const holidayDays = data.data.HolidayData && Array.isArray(data.data.HolidayData)
        ? data.data.HolidayData.filter(h => {
          const holidayDate = dayjs(h.Date);
          const payrollStart = dayjs(startDate);
          const payrollEnd = dayjs(endDate);
          return holidayDate.isSame(payrollStart, 'day') || (holidayDate.isAfter(payrollStart) && (holidayDate.isSame(payrollEnd, 'day') || holidayDate.isBefore(payrollEnd)));
        }).length
        : 0;
      const daysPresent = expectedDays - absentDays - leaveDays - holidayDays;

      // Calculate Earnings
      const dailyRate = parseFloat(data.data.DailyRate || '0.00');
      const dailyRateAmount = (dailyRate * daysPresent).toFixed(2);
      const transportAllowance = data.data.AllowancesData?.find(a => a.Description === 'Transportation')?.Amount || '0.00';
      const transportAllowanceAmount = ((leaveDays + daysPresent + holidayDays) * parseFloat(transportAllowance)).toFixed(2);
      const basicPayAmount = (parseFloat(dailyRateAmount) + parseFloat(transportAllowanceAmount)).toFixed(2);
      const leavePayAmount = (dailyRate * leaveDays).toFixed(2);
      const holidayPayAmount = data.data.HolidayPay?.Total || '0.00';
      const sundayPayAmount = data.data.SundayPay?.Total || '0.00';
      const overtimePayAmount = data.data.OvertimePay?.Total || '0.00';

      const premiumPayData = [
        {
          key: `sunday-hours-${employeeId}`,
          Description: `Sunday Hours (130%): ${data.data.SundayHours || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[0]?.Amount || '0.00'),
        },
        {
          key: `sunday-ot-${employeeId}`,
          Description: `Sunday Overtime (130%): ${data.data.PremiumPayData?.[1]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[1]?.Amount || '0.00'),
        },
        {
          key: `sunday-pay-${employeeId}`,
          Description: 'Sunday Pay',
          Amount: formatNumberWithCommas(sundayPayAmount),
        },
        {
          key: `holiday-special-${employeeId}`,
          Description: `Holiday Hours (Special Non-Working) 130%: ${data.data.HolidayHours?.Special || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[3]?.Amount || '0.00'),
        },
        {
          key: `holiday-special-ot-${employeeId}`,
          Description: `Holiday Overtime (Special Non-Working) 130%: ${data.data.PremiumPayData?.[4]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[4]?.Amount || '0.00'),
        },
        {
          key: `holiday-regular-${employeeId}`,
          Description: `Holiday Hours (Legal) 200%: ${data.data.HolidayHours?.Regular || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[5]?.Amount || '0.00'),
        },
        {
          key: `holiday-regular-ot-${employeeId}`,
          Description: `Holiday Overtime (Legal) 200%: ${data.data.PremiumPayData?.[6]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.[6]?.Amount || '0.00'),
        },
        {
          key: `holiday-regular-non-worked-${employeeId}`,
          Description: `No-Worked Legal Holiday 100%`,
          Amount: formatNumberWithCommas(
            data.data.HolidayData?.some(h =>
              h.HolidayType === 'Legal Holiday' &&
              !data.data.AttendanceData?.some(a => a.Date === h.Date)
            ) ? data.data.DailyRate || '0.00' : '0.00'
          ),
        },
        {
          key: `holiday-pay-${employeeId}`,
          Description: 'Holiday Pay',
          Amount: formatNumberWithCommas(holidayPayAmount),
        },
      ].filter(item => parseAmount(item.Amount, employeeId) > 0);

      const earningsData = [
        { key: `daily-rate-${employeeId}`, Description: `Daily Rate: ${daysPresent} Days Present`, Amount: formatNumberWithCommas(dailyRateAmount) },
        { key: `transportation-allowance-${employeeId}`, Description: 'Transportation Allowance', Amount: formatNumberWithCommas(transportAllowanceAmount) },
        { key: `basic-pay-${employeeId}`, Description: 'Basic Pay', Amount: formatNumberWithCommas(basicPayAmount) },
        { key: `leave-pay-${employeeId}`, Description: `Leave with Pay: ${leaveDays} Days`, Amount: formatNumberWithCommas(leavePayAmount) },
        { key: `ot-regular-${employeeId}`, Description: `Overtime Hours (125%): ${data.data.OvertimeHours?.Regular || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Regular || '0.00') },
        { key: `ot-night-${employeeId}`, Description: `Overtime Hours (137.5%): ${data.data.OvertimeHours?.Night || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Night || '0.00') },
        { key: `ot-total-${employeeId}`, Description: 'Overtime Pay', Amount: formatNumberWithCommas(overtimePayAmount) },
      ].filter(item => parseAmount(item.Amount, employeeId) > 0);

      // Calculate Gross Pay (TotalEarnings) by summing relevant amounts from earningsData and premiumPayData
      const totalEarnings = (
        parseAmount(basicPayAmount, employeeId) +
        parseAmount(leavePayAmount, employeeId) +
        parseAmount(overtimePayAmount, employeeId) +
        parseAmount(sundayPayAmount, employeeId) +
        parseAmount(holidayPayAmount, employeeId)
      ).toFixed(2);

      const payslipWithData = {
        ...data.data,
        EarningsData: earningsData,
        PremiumPayData: premiumPayData,
        TotalEarnings: formatNumberWithCommas(totalEarnings),
        LateMinutes: formatNumberWithCommas(parseInt(data.data.LateMinutes, 10)) || 0,
        UndertimeMinutes: formatNumberWithCommas(parseInt(data.data.UndertimeMinutes, 10)) || 0,
      };

      setPayslipData(payslipWithData);
    } catch (err) {
      message.error(`Failed to generate payslip: ${err.message}`);
      setPayslipData(null);
    } finally {
      setPayslipLoading(false);
    }
  };

  const downloadPayslipPDF = () => {
    if (!payslipData || !payslipData.EmployeeID) {
      message.warning('No payslip data available to download');
      return;
    }

    try {
      const doc = new jsPDF();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Employee: ${payslipData.EmployeeName || 'Unknown'}`, 14, 20);
      doc.text(`Branch: ${payslipData.BranchName || 'Unknown'}`, 14, 30);
      doc.text(`Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, 14, 40);

      let yPosition = 60;

      const mergedEarningsData = [
        ...payslipData.EarningsData,
        ...payslipData.PremiumPayData,
      ].filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0);

      if (mergedEarningsData.length > 0) {
        doc.setFontSize(14);
        doc.text('Earnings', 14, yPosition);
        yPosition += 10;
        autoTable(doc, {
          startY: yPosition,
          head: [['Description', 'Amount']],
          body: mergedEarningsData.map(item => [item.Description, item.Amount]),
          theme: 'striped',
          headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
          styles: { fontSize: 9, cellPadding: 4 },
        });
        yPosition = doc.lastAutoTable.finalY + 10;
      }

      const mergedDeductionsData = [
        ['Late/Undertime', payslipData.LateDeduction || '0.00'],
        ...(payslipData.ContributionsData?.map(item => [item.ContributionType || 'Unknown', item.Amount || '0.00']) || []),
      ].filter(([desc, amount]) => parseFloat(amount.replace(/,/g, '')) !== 0);

      if (mergedDeductionsData.length > 0) {
        doc.setFontSize(14);
        doc.text('Deductions', 14, yPosition);
        yPosition += 10;
        autoTable(doc, {
          startY: yPosition,
          head: [['Description', 'Amount']],
          body: mergedDeductionsData,
          theme: 'striped',
          headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
          styles: { fontSize: 9, cellPadding: 4 },
        });
        yPosition = doc.lastAutoTable.finalY + 10;
      }

      doc.setFontSize(10);
      doc.text(`Gross Pay: ${payslipData.TotalEarnings || '0.00'}`, 14, yPosition);
      doc.text(`Total Deductions: ${payslipData.TotalDeductions || '0.00'}`, 14, yPosition + 5);
      doc.setFontSize(12);
      doc.text(`Net Pay: ${payslipData.NetPay || '0.00'}`, 14, yPosition + 15);

      const filename = `Payslip_${payslipData.EmployeeID}_${dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD')}.pdf`;
      doc.save(filename);

      if (userId) {
        logActivity({
          user_id: parseInt(userId),
          activity_type: 'GENERATE_DATA',
          affected_table: 'Payroll',
          affected_record_id: payslipData.EmployeeID,
          activity_description: `Generated payslip PDF for EmployeeID: ${payslipData.EmployeeID} (${payslipData.EmployeeName})`,
        });
      } else {
        message.warning('Activity logging skipped due to missing user ID');
      }

      message.success('Payslip PDF generated successfully');
    } catch (err) {
      message.error('Failed to generate payslip PDF');
    }
  };

  const downloadBulkPayslipPDF = (bulkPayslipData) => {
    try {
      // Log payslip details for each employee
      bulkPayslipData.forEach((payslipData, index) => {
        if (!payslipData || !payslipData.EmployeeID) {
          return;
        }

        const mergedEarningsData = [
          ...payslipData.EarningsData,
          ...payslipData.PremiumPayData,
        ].filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0);

        const mergedDeductionsData = [
          {
            Description: `Late/Undertime Mins: ${(parseInt(payslipData.LateMinutes) + parseInt(payslipData.UndertimeMinutes))} mins`,
            Amount: formatNumberWithCommas(payslipData.LateDeduction || '0.00'),
          },
          ...(payslipData.ContributionsData?.map(item => ({
            Description: item.ContributionType || 'Unknown',
            Amount: formatNumberWithCommas(item.Amount || '0.00'),
          })) || []),
        ].filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0);
      });

      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('Helvetica', 'normal');

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const payslipsPerRow = 3;
      const rowsPerPage = 2;
      const totalPayslipsPerPage = payslipsPerRow * rowsPerPage;
      const payslipWidth = pageWidth / payslipsPerRow;
      const payslipHeight = pageHeight / rowsPerPage;
      const margin = 5;
      const contentWidth = payslipWidth - 2 * margin;
      const tableWidth = contentWidth / 2.14;
      const tableSpacing = 2;

      let payslipIndex = 0;

      bulkPayslipData.forEach((payslipData, index) => {
        if (!payslipData || !payslipData.EmployeeID) {
          return;
        }

        if (payslipIndex % totalPayslipsPerPage === 0 && payslipIndex !== 0) {
          doc.addPage();
        }

        const row = Math.floor((payslipIndex % totalPayslipsPerPage) / payslipsPerRow);
        const col = payslipIndex % payslipsPerRow;
        const xPosition = margin + col * payslipWidth;
        const yPosition = margin + row * payslipHeight;

        doc.setLineWidth(0.2);
        doc.rect(xPosition, yPosition, payslipWidth - 2 * margin, payslipHeight - 2 * margin);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`Employee: ${payslipData.EmployeeName || 'Unknown'}`, xPosition + 2, yPosition + 5);
        doc.text(`Branch: ${payslipData.BranchName || 'Unknown'}`, xPosition + 2, yPosition + 9);
        doc.text(`Payroll Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, xPosition + 2, yPosition + 13);

        let contentY = yPosition + 18;

        const mergedEarningsData = [
          ...payslipData.EarningsData,
          ...payslipData.PremiumPayData,
        ].filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0);

        let earningsHeight = 0;
        if (mergedEarningsData.length > 0) {
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.text('Earnings', xPosition + 2, contentY);
          autoTable(doc, {
            startY: contentY + 2,
            margin: { left: xPosition + 2, bottom: 6 },
            head: [['Description', 'Amount']],
            body: mergedEarningsData.map(item => [item.Description, item.Amount]),
            theme: 'plain',
            headStyles: { fillColor: '#E7E7E7', textColor: '#000', fontSize: 6, fontStyle: 'bold' },
            styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak', margin: 5 },
            columnStyles: { 0: { cellWidth: tableWidth / 2 }, 1: { cellWidth: tableWidth / 2 } },
            tableWidth: tableWidth,
          });
          earningsHeight = doc.lastAutoTable.finalY - contentY;
        }

        const mergedDeductionsData = [
          [
            `Late/Undertime Mins: ${(parseInt(payslipData.LateMinutes) + parseInt(payslipData.UndertimeMinutes))} mins`,
            formatNumberWithCommas(payslipData.LateDeduction || '0.00'),
          ],
          ...(payslipData.ContributionsData?.map(item => [
            item.ContributionType || 'Unknown',
            formatNumberWithCommas(item.Amount || '0.00'),
          ]) || []),
        ].filter(([desc, amount]) => parseFloat(amount.replace(/,/g, '')) !== 0);

        let deductionsHeight = 0;
        if (mergedDeductionsData.length > 0) {
          const deductionsX = xPosition + 2 + tableWidth + tableSpacing;
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.text('Deductions', deductionsX, contentY);
          autoTable(doc, {
            startY: contentY + 2,
            margin: { left: deductionsX },
            head: [['Description', 'Amount']],
            body: mergedDeductionsData,
            theme: 'plain',
            headStyles: { fillColor: '#E7E7E7', textColor: '#000', fontSize: 6, fontStyle: 'bold' },
            styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak', margin: 5 },
            columnStyles: { 0: { cellWidth: tableWidth / 2 }, 1: { cellWidth: tableWidth / 2 } },
            tableWidth: tableWidth,
          });
          deductionsHeight = doc.lastAutoTable.finalY - contentY;
        }

        const maxTableHeight = Math.max(earningsHeight, deductionsHeight);
        contentY += maxTableHeight + 5;

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gross Pay: ${payslipData.TotalEarnings || '0.00'}`, xPosition + 2, contentY + 3);
        doc.text(`Total Deductions: ${formatNumberWithCommas(payslipData.TotalDeductions || '0.00')}`, xPosition + 2, contentY + 6);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(`Net Pay: ${formatNumberWithCommas(payslipData.NetPay || '0.00')}`, xPosition + 2, contentY + 10);

        payslipIndex++;

        if (userId) {
          logActivity({
            user_id: parseInt(userId),
            activity_type: 'GENERATE_DATA',
            affected_table: 'Payroll',
            affected_record_id: payslipData.EmployeeID,
            activity_description: `Generated bulk payslip PDF for EmployeeID: ${payslipData.EmployeeID} (${payslipData.EmployeeName})`,
          });
        }
      });

      if (payslipIndex === 0) {
        message.warning('No valid payslip data to generate');
        return;
      }

      const filename = `AutoPayroll_Payslips_${dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD')}.pdf`;
      doc.save(filename);
      message.success('Bulk payslip PDF generated successfully');
    } catch (err) {
      message.error('Failed to generate bulk payslip PDF');
    }
  };

  const handleBulkPayslip = async () => {
    try {
      if (!filteredData.length) {
        message.warning('No employees to generate payslips for.');
        return;
      }
      if (!payrollDates.startDate || !payrollDates.endDate) {
        message.warning('Please set a payroll date before generating the payslip.');
        return;
      }

      setPayslipLoading(true);
      const startDateBackend = dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      const endDateBackend = dayjs(payrollDates.endDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      const bulkPayslipData = [];

      for (const employee of filteredData) {
        const payload = {
          action: 'generate_payslip',
          user_id: parseInt(userId),
          employeeId: employee.employeeId,
          start_date: startDateBackend,
          end_date: endDateBackend,
          payroll_cut: payrollCut,
        };
        const response = await fetch(`${API_BASE_URL}/fetch_payroll.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorText = await response.text();
          message.error(`Failed to generate payslip for EmployeeID ${employee.employeeId}: HTTP ${response.status} - ${errorText}`);
          continue;
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await response.text();
          message.error(`Invalid response for EmployeeID ${employee.employeeId}`);
          continue;
        }
        const data = await response.json();
        if (data.success && data.data) {
          // Calculate Days Present
          const expectedDays = countWorkingDays(payrollDates.startDate, payrollDates.endDate);
          const absentDays = parseInt(data.data.AbsentDays) || 0;
          const leaveDays = data.data.LeaveData && Array.isArray(data.data.LeaveData)
            ? data.data.LeaveData.reduce((sum, leave) => {
              const leaveStart = dayjs(leave.StartDate);
              const leaveEnd = dayjs(leave.EndDate);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              if (
                (leaveStart.isSame(payrollStart, 'day') || leaveStart.isAfter(payrollStart)) &&
                (leaveEnd.isSame(payrollEnd, 'day') || leaveEnd.isBefore(payrollEnd))
              ) {
                return sum + (parseInt(leave.UsedLeaveCredits) || 0);
              }
              return sum;
            }, 0)
            : 0;
          const holidayDays = data.data.HolidayData && Array.isArray(data.data.HolidayData)
            ? data.data.HolidayData.filter(h => {
              const holidayDate = dayjs(h.Date);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              return holidayDate.isSame(payrollStart, 'day') || (holidayDate.isAfter(payrollStart) && holidayDate.isSame(payrollEnd, 'day') || holidayDate.isBefore(payrollEnd));
            }).length
            : 0;
          const daysPresent = expectedDays - absentDays - leaveDays - holidayDays;

          // Calculate Earnings
          const dailyRate = parseFloat(data.data.DailyRate || '0.00');
          const dailyRateAmount = (dailyRate * daysPresent).toFixed(2);
          const transportAllowance = data.data.AllowancesData?.find(a => a.Description === 'Transportation')?.Amount || '0.00';
          const transportAllowanceAmount = ((leaveDays + daysPresent + holidayDays) * parseFloat(transportAllowance)).toFixed(2);
          const basicPayAmount = (parseFloat(dailyRateAmount) + parseFloat(transportAllowanceAmount)).toFixed(2);
          const leavePayAmount = (dailyRate * leaveDays).toFixed(2);
          const holidayPayAmount = data.data.HolidayPay?.Total || '0.00';
          const sundayPayAmount = data.data.SundayPay?.Total || '0.00';
          const overtimePayAmount = data.data.OvertimePay?.Total || '0.00';

          const premiumPayData = [
            {
              key: `sunday-hours-${employee.employeeId}`,
              Description: `Sunday Hours (130%): ${data.data.SundayHours || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[0]?.Amount || '0.00'),
            },
            {
              key: `sunday-ot-${employee.employeeId}`,
              Description: `Sunday Overtime (130%): ${data.data.PremiumPayData?.[1]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[1]?.Amount || '0.00'),
            },
            {
              key: `sunday-pay-${employee.employeeId}`,
              Description: 'Sunday Pay',
              Amount: formatNumberWithCommas(sundayPayAmount),
            },
            {
              key: `holiday-special-${employee.employeeId}`,
              Description: `Holiday Hours (Special Non-Working) 130%: ${data.data.HolidayHours?.Special || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[3]?.Amount || '0.00'),
            },
            {
              key: `holiday-special-ot-${employee.employeeId}`,
              Description: `Holiday Overtime (Special Non-Working) 130%: ${data.data.PremiumPayData?.[4]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[4]?.Amount || '0.00'),
            },
            {
              key: `holiday-regular-${employee.employeeId}`,
              Description: `Holiday Hours (Legal) 200%: ${data.data.HolidayHours?.Regular || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[5]?.Amount || '0.00'),
            },
            {
              key: `holiday-regular-ot-${employee.employeeId}`,
              Description: `Holiday Overtime (Legal) 200%: ${data.data.PremiumPayData?.[6]?.Description.match(/(\d*\.?\d*)\s*hrs/)?.[1] || '0'} hrs`,
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.[6]?.Amount || '0.00'),
            },
            {
              key: `holiday-regular-non-worked-${employee.employeeId}`,
              Description: `Non-Worked Legal Holiday 100%`,
              Amount: formatNumberWithCommas(
                data.data.HolidayData?.some(h =>
                  h.HolidayType === 'Legal Holiday' &&
                  !data.data.AttendanceData?.some(a => a.Date === h.Date)
                ) ? data.data.DailyRate || '0.00' : '0.00'
              ),
            },
            {
              key: `holiday-pay-${employee.employeeId}`,
              Description: 'Holiday Pay',
              Amount: formatNumberWithCommas(holidayPayAmount),
            },
          ].filter(item => parseAmount(item.Amount, employee.employeeId) > 0);

          const earningsData = [
            { key: `daily-rate-${employee.employeeId}`, Description: `Daily Rate: ${daysPresent} Days Present`, Amount: formatNumberWithCommas(dailyRateAmount) },
            { key: `transportation-allowance-${employee.employeeId}`, Description: 'Transportation Allowance', Amount: formatNumberWithCommas(transportAllowanceAmount) },
            { key: `basic-pay-${employee.employeeId}`, Description: 'Basic Pay', Amount: formatNumberWithCommas(basicPayAmount) },
            { key: `leave-pay-${employee.employeeId}`, Description: `Leave with Pay: ${leaveDays} Days`, Amount: formatNumberWithCommas(leavePayAmount) },
            { key: `ot-regular-${employee.employeeId}`, Description: `Overtime Hours (125%): ${data.data.OvertimeHours?.Regular || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Regular || '0.00') },
            { key: `ot-night-${employee.employeeId}`, Description: `Overtime Hours (137.5%): ${data.data.OvertimeHours?.Night || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Night || '0.00') },
            { key: `ot-total-${employee.employeeId}`, Description: 'Overtime Pay', Amount: formatNumberWithCommas(overtimePayAmount) },
          ].filter(item => parseAmount(item.Amount, employee.employeeId) > 0);

          // Calculate Gross Pay (TotalEarnings) by summing relevant amounts from earningsData and premiumPayData
          const totalEarnings = (
            parseAmount(basicPayAmount, employee.employeeId) +
            parseAmount(overtimePayAmount, employee.employeeId) +
            parseAmount(leavePayAmount, employee.employeeId) +
            parseAmount(sundayPayAmount, employee.employeeId) +
            parseAmount(holidayPayAmount, employee.employeeId)
          ).toFixed(2);

          const payslipWithData = {
            ...data.data,
            EarningsData: earningsData,
            PremiumPayData: premiumPayData,
            TotalEarnings: formatNumberWithCommas(totalEarnings),
            LateMinutes: parseInt(data.data.LateMinutes, 10) || 0,
            UndertimeMinutes: parseInt(data.data.UndertimeMinutes, 10) || 0,
          };
          bulkPayslipData.push(payslipWithData);
        } else {
          message.warning(`No payslip data for EmployeeID: ${employee.employeeId}`);
        }
      }

      if (bulkPayslipData.length === 0) {
        message.warning('No valid payslip data generated for any employees.');
        setPayslipLoading(false);
        return;
      }

      setBulkPayslipData(bulkPayslipData);
      setIsBulkPayslipModalVisible(true);
    } catch (err) {
      message.error(`Failed to generate bulk payslips: ${err.message}`);
    } finally {
      setPayslipLoading(false);
    }
  };

  const fetchPayrollHistory = async () => {
    try {
      const url = `${API_BASE_URL}/fetch_payroll.php?action=fetch_payroll_history&user_id=${userId}&role=${encodeURIComponent(role)}&page=${currentPage - 1}&limit=${pageSize}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Payroll history fetch failed: ${res.statusText} - ${errorText}`);
      }

      const contentType = res.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await res.text();
        throw new Error(`Invalid response content-type: ${contentType}`);
      }

      const response = await res.json();

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch payroll history');
      }

      if (!response.data || response.data.length === 0) {
        message.warning('No payroll history records found');
        setPayrollHistoryData([]);
        setPaginationTotal(0);
        setFilteredPaginationTotal(0);
        return;
      }

      const mappedData = response.data.map(log => {
        const parsed = parseActivityDescription(log.activity_description, log.affected_id);
        const row = {
          key: log.log_id,
          employeeId: parsed.employeeId,
          employeeName: parsed.employeeName,
          payrollPeriod: parsed.payrollPeriod,
          cutOff: parsed.cutOff,
          dailyRate: parsed.dailyRate,
          basicPay: parsed.basicPay,
          overtimePay: parsed.overtimePay,
          sundayPay: parsed.sundayPay,
          holidayPay: parsed.holidayPay,
          grossPay: parsed.grossPay,
          totalDeductions: parsed.totalDeductions,
          netPay: parsed.netPay,
          createdAt: log.created_at,
        };
        if (row.employeeId === 'Unknown') {
        }
        return row;
      });

      // Check if currentPage is valid for the new total
      const newTotal = response.total || 0;
      if (newTotal > 0 && currentPage > Math.ceil(newTotal / pageSize)) {
        setCurrentPage(1);
      }

      setPayrollHistoryData(mappedData);
      setPaginationTotal(newTotal);
      setFilteredPaginationTotal(newTotal);
    } catch (err) {
      message.error(`Failed to load payroll history: ${err.message}`);
      setPayrollHistoryData([]);
      setPaginationTotal(0);
      setFilteredPaginationTotal(0);
    }
  };

  const handlePayrollHistory = () => {
    setPayrollDates({ startDate: null, endDate: null });
    setPayrollCut(null);
    setCurrentPage(1);
    fetchPayrollHistory();
  };

  useEffect(() => {
    fetchDropdownData();
    fetchPayrollHistory();
    debouncedFetchData();
  }, [debouncedFetchData, currentPage, pageSize]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
    setSearchText(value);
    setCurrentPage(1);
    debouncedFetchData();
  };

  useEffect(() => {
    const lastPayrollDate = form.getFieldValue('lastPayrollDate');
    if (form.getFieldValue('lastPayrollDate')) {
      const { startDate, days } = computePreviousWorkingDays(lastPayrollDate);
      setComputedStartDate(startDate);
      setWorkingDaysList(days);
    }
  }, [isModalVisible]);

  const handleBranchChange = (value) => {
    const branchValue = value || 'all';
    setSelectedBranch(branchValue);
    setCurrentPage(1);
    fetchData();
  };

  const handleLastPayrollDateChange = (date) => {
    form.setFieldsValue({ lastPayrollDate: date });
    if (date) {
      const { start, end } = computePayrollPeriodRange(date);
      if (start && end) {
        // Format: "Payroll Period: August 4-16, 2025"
        const startMonth = start.format('MMMM');
        const endMonth = end.format('MMMM');
        const year = end.format('YYYY');
        const startDay = start.format('D');
        const endDay = end.format('D');
        const periodText =
          startMonth === endMonth
            ? `Payroll Period: ${startMonth} ${startDay}-${endDay}, ${year}`
            : `Payroll Period: ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
        setPayrollPeriodText(periodText);
      } else {
        setPayrollPeriodText('');
      }
    } else {
      setPayrollPeriodText('');
    }
  };

  const handlePageChange = (page, size) => {

    debouncedFetchData();

    // Update pageSize and reset currentPage to 1 if size changes
    let newPage = page;
    if (size !== pageSize) {
      setPageSize(size);
      newPage = 1; // Reset to page 1 when pageSize changes
    }

    // Check if the requested page is valid for the total records
    const total = payrollDates.startDate && payrollDates.endDate ? paginationTotal : filteredPaginationTotal;
    if (total > 0 && newPage > Math.ceil(total / size)) {
      newPage = 1;
    }

    setCurrentPage(newPage);

    // Trigger data fetch immediately
    if (!payrollDates.startDate || !payrollDates.endDate) {
      fetchPayrollHistory();
    } else {
      fetchData();
    }
  };

  useEffect(() => {
  }, [currentPage, pageSize, paginationTotal, filteredPaginationTotal]);

  const formatNumberWithCommas = (number) => {
    return parseFloat(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getContributionLabel = (type) => {
    switch (type) {
      case 'Pag-Ibig': return 'Pag-Ibig Contribution';
      case 'SSS': return 'SSS Contribution';
      case 'PhilHealth': return 'PhilHealth Contribution';
      case 'Late': return 'Late';
      case 'Pag-Ibig Calamity': return 'Pag-Ibig Calamity Loan';
      case 'Pag-Ibig Salary': return 'Pag-Ibig Salary Loan';
      case 'SSS Calamity': return 'SSS Calamity Loan';
      case 'SSS Salary': return 'SSS Salary Loan';
      case 'PhilHealth Calamity': return 'PhilHealth Calamity Loan';
      case 'PhilHealth Salary': return 'PhilHealth Salary Loan';
      default: return type;
    }
  };

  const handlePayrollReport = async () => {
    if (!payrollDates.startDate || !payrollDates.endDate || !payrollCut) {
      message.warning('Please set a payroll date before generating the report.');
      return;
    }

    try {
      const startDateBackend = dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD');
      const endDateBackend = dayjs(payrollDates.endDate, 'MM/DD/YYYY').format('YYYY-MM-DD');

      let url = `${API_BASE_URL}/fetch_payroll.php?user_id=${userId}&role=${encodeURIComponent(role)}&start_date=${startDateBackend}&end_date=${endDateBackend}&payroll_cut=${payrollCut}`;
      if (selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      if (searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Payroll report fetch failed: ${res.statusText} - ${errorText}`);
      }
      const response = await res.json();

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch payroll records');
      }

      const reportData = await Promise.all(
        response.data.map(async (employee) => {
          const payload = {
            action: 'generate_payslip',
            user_id: parseInt(userId),
            employeeId: employee.EmployeeID,
            start_date: startDateBackend,
            end_date: endDateBackend,
            payroll_cut: payrollCut,
          };

          const payslipRes = await fetch(`${API_BASE_URL}/fetch_payroll.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!payslipRes.ok) {
            return null;
          }

          const payslipData = await payslipRes.json();
          if (!payslipData.success) {
            return null;
          }

          // Calculate Leave Days (Used Credits)
          const leaveDays = payslipData.data.LeaveData && Array.isArray(payslipData.data.LeaveData)
            ? payslipData.data.LeaveData.reduce((sum, leave) => {
              const leaveStart = dayjs(leave.StartDate);
              const leaveEnd = dayjs(leave.EndDate);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              if (
                (leaveStart.isSame(payrollStart, 'day') || leaveStart.isAfter(payrollStart)) &&
                (leaveEnd.isSame(payrollEnd, 'day') || leaveEnd.isBefore(payrollEnd))
              ) {
                return sum + (parseInt(leave.UsedLeaveCredits) || 0);
              }
              return sum;
            }, 0)
            : 0;

          // Calculate Holiday Days
          const holidayDays = payslipData.data.HolidayData && Array.isArray(payslipData.data.HolidayData)
            ? payslipData.data.HolidayData.filter(h => {
              const holidayDate = dayjs(h.Date);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              return holidayDate.isSame(payrollStart, 'day') || (holidayDate.isAfter(payrollStart) && (holidayDate.isSame(payrollEnd, 'day') || holidayDate.isBefore(payrollEnd)));
            }).length
            : 0;

          // Calculate Days Present: Expected Days - Absent Days - Leave Days - Holiday Days
          const expectedDays = countWorkingDays(payrollDates.startDate, payrollDates.endDate);
          const absentDays = parseInt(payslipData.data.AbsentDays) || 0;
          const leaveDays1 = payslipData.data.LeaveData && Array.isArray(payslipData.data.LeaveData)
            ? payslipData.data.LeaveData.reduce((sum, leave) => {
              const leaveStart = dayjs(leave.StartDate);
              const leaveEnd = dayjs(leave.EndDate);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              if (
                (leaveStart.isSame(payrollStart, 'day') || leaveStart.isAfter(payrollStart)) &&
                (leaveEnd.isSame(payrollEnd, 'day') || leaveEnd.isBefore(payrollEnd))
              ) {
                return sum + (parseInt(leave.UsedLeaveCredits) || 0);
              }
              return sum;
            }, 0)
            : 0;
          const holidayDays1 = payslipData.data.HolidayData && Array.isArray(payslipData.data.HolidayData)
            ? payslipData.data.HolidayData.filter(h => {
              const holidayDate = dayjs(h.Date);
              const payrollStart = dayjs(startDateBackend);
              const payrollEnd = dayjs(endDateBackend);
              return holidayDate.isSame(payrollStart, 'day') || (holidayDate.isAfter(payrollStart) && holidayDate.isSame(payrollEnd, 'day') || holidayDate.isBefore(payrollEnd));
            }).length
            : 0;
          const daysPresent = expectedDays - absentDays - leaveDays1 - holidayDays1;

          // Calculate Total: Rate * Days Present
          const dailyRate = parseFloat(payslipData.data.DailyRate || '0.00');
          const totalBasic = (dailyRate * daysPresent).toFixed(2);

          // Calculate Allowance: (Leave Days + Days Present + Holiday Days) * Allowance Per Day
          const allowancePerDay = payslipData.data.AllowancesData?.reduce((sum, a) => sum + parseFloat(a.Amount || 0), 0) || 0.00;
          const allowance = ((leaveDays + daysPresent + holidayDays) * allowancePerDay).toFixed(2);

          // Existing calculations for other columns (unchanged)
          const holidayRegular = parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Legal 200%)'))?.Amount || '0.00').toFixed(2);
          const holidaySpecial = parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Special 130%)'))?.Amount || '0.00').toFixed(2);
          const overtime = (
            parseFloat(payslipData.data.OvertimePay?.Regular || '0.00') +
            parseFloat(payslipData.data.OvertimePay?.Night || '0.00') +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime (Special 130%)'))?.Amount || '0.00') +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime (Legal 200%)'))?.Amount || '0.00')
          ).toFixed(2);
          const sundayPay = parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Sunday Hours (130%)'))?.Amount || '0.00').toFixed(2);
          const sundayOvertime = parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime (130%)'))?.Amount || '0.00').toFixed(2);
          const leavePay = (dailyRate * leaveDays).toFixed(2);
          const grossPay = (
            parseFloat(totalBasic) +
            parseFloat(allowance) +
            parseFloat(overtime) +
            parseFloat(holidayRegular) +
            parseFloat(holidaySpecial) +
            parseFloat(sundayPay) +
            parseFloat(sundayOvertime) +
            parseFloat(leavePay)
          ).toFixed(2);

          const sssContribution = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS')?.Amount || '0.00';
          const sssCalamityLoan = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS Calamity')?.Amount || '0.00';
          const sssSalaryLoan = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS Salary')?.Amount || '0.00';
          const pagIbigContribution = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig')?.Amount || '0.00';
          const pagIbigCalamityLoan = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig Calamity')?.Amount || '0.00';
          const pagIbigSalaryLoan = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig Salary')?.Amount || '0.00';
          const philhealth = payslipData.data.ContributionsData?.find(c => c.ContributionType === 'PhilHealth')?.Amount || '0.00';
          const undertimeLate = payslipData.data.LateDeduction || '0.00';
          const totalDeduction = (
            parseFloat(sssContribution) +
            parseFloat(sssCalamityLoan) +
            parseFloat(sssSalaryLoan) +
            parseFloat(pagIbigContribution) +
            parseFloat(pagIbigCalamityLoan) +
            parseFloat(pagIbigSalaryLoan) +
            parseFloat(philhealth) +
            parseFloat(undertimeLate)
          ).toFixed(2);
          const netPay = (
            parseFloat(grossPay) -
            parseFloat(totalDeduction)
          ).toFixed(2);

          return {
            EmployeeName: employee.EmployeeName,
            DailyRate: dailyRate.toFixed(2),
            DaysPresent: daysPresent.toString(),
            TotalBasic: totalBasic,
            Allowance: allowance,
            Overtime: overtime,
            HolidayRegular: holidayRegular,
            HolidaySpecial: holidaySpecial,
            HolidayOvertime: '0.00',
            SundayPay: sundayPay,
            SundayOvertime: sundayOvertime,
            LeavePay: leavePay,
            GrossPay: grossPay,
            Tax: '0.00',
            SSSContribution: sssContribution,
            SSSCalamityLoan: sssCalamityLoan,
            SSSSalaryLoan: sssSalaryLoan,
            PagIbigContribution: pagIbigContribution,
            PagIbigCalamityLoan: pagIbigCalamityLoan,
            PagIbigSalaryLoan: pagIbigSalaryLoan,
            Philhealth: philhealth,
            UndertimeLate: undertimeLate,
            TotalDeduction: totalDeduction,
            NetPay: netPay,
            Signature: '',
          };
        })
      );

      const validReportData = reportData.filter(data => data !== null);

      if (validReportData.length === 0) {
        message.warning('No valid payroll data available to generate the report.');
        return;
      }

      downloadPayrollReportPDF(validReportData);
      message.success('Payroll report generated successfully!');

      if (userId) {
        logActivity({
          user_id: parseInt(userId),
          activity_type: 'GENERATE_DATA',
          affected_table: 'Payroll',
          affected_record_id: null,
          activity_description: `Generated payroll report for period ${payrollDates.startDate} to ${payrollDates.endDate}`,
        });
      }
    } catch (err) {
      message.error(`Failed to generate payroll report: ${err.message}`);
    }
  };

  const downloadPayrollReportPDF = (reportData) => {
    try {
      // Long bond paper: 8.5 x 13 inches (612 x 936 points at 72 PPI)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [936, 612], // Width: 13in * 72pt/in = 936pt, Height: 8.5in * 72pt/in = 612pt
      });
      doc.setFont('helvetica', 'normal');

      // Company Details
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('VIAN-SON AUTOMOTIVE SERVICES INC.', 10, 80);
      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.text('306, 317 Roosevelt Ave. Brgy. San Antonio, Quezon City', 10, 95);
      doc.text('Cell #: (63+) 968-884-2447', 10, 103);
      doc.text(`Payroll Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, 10, 111);

      // Table Configuration
      const head = [
        [
          { content: 'Name', rowSpan: 2, },
          { content: 'Rate', rowSpan: 2 },
          { content: 'Days', rowSpan: 2 },
          { content: 'Total', rowSpan: 2 },
          { content: 'Allowance', rowSpan: 2 },
          { content: 'HOLIDAY W/ PAY', colSpan: 2 },
          { content: 'Overtime Pay', rowSpan: 2 },
          { content: 'Sunday Pay', rowSpan: 2 },
          { content: 'Sunday Overtime Pay', rowSpan: 2 },
          { content: 'Leave w/ Pay', rowSpan: 2 },
          { content: 'Gross Pay', rowSpan: 2 },
          { content: 'DEDUCTIONS', colSpan: 9 },
          { content: 'Total Deduction', rowSpan: 2 },
          { content: 'Net Pay', rowSpan: 2 },
          { content: 'Signature', rowSpan: 2 },
        ],
        [
          'Regular', 'Special',
          'WH Tax', 'SSS\nContri',
          'SSS\nCalamity\nLoan',
          'SSS\nSalary\nLoan',
          'Pag-Ibig\nContri',
          'Pag-Ibig\nCalamity\nLoan',
          'Pag-Ibig\nSalary\nLoan',
          'Philhealth',
          'Undertime/\nLate',
        ],
      ];

      const body = reportData.map(data => [
        wrapName(data.EmployeeName), // <-- wrap the name
        formatNumberWithCommas(data.DailyRate),
        data.DaysPresent,
        formatNumberWithCommas(data.TotalBasic),
        formatNumberWithCommas(data.Allowance),
        formatNumberWithCommas(data.HolidayRegular),
        formatNumberWithCommas(data.HolidaySpecial),
        formatNumberWithCommas(data.Overtime),
        formatNumberWithCommas(data.SundayPay),
        formatNumberWithCommas(data.SundayOvertime),
        formatNumberWithCommas(data.LeavePay),
        formatNumberWithCommas(data.GrossPay),
        formatNumberWithCommas(data.Tax),
        formatNumberWithCommas(data.SSSContribution),
        formatNumberWithCommas(data.SSSCalamityLoan),
        formatNumberWithCommas(data.SSSSalaryLoan),
        formatNumberWithCommas(data.PagIbigContribution),
        formatNumberWithCommas(data.PagIbigCalamityLoan),
        formatNumberWithCommas(data.PagIbigSalaryLoan),
        formatNumberWithCommas(data.Philhealth),
        formatNumberWithCommas(data.UndertimeLate),
        formatNumberWithCommas(data.TotalDeduction),
        formatNumberWithCommas(data.NetPay),
        data.Signature,
      ]);

      // Calculate sums of Gross Pay, Total Deduction, and Net Pay
      const totalGrossPaySum = reportData.reduce((sum, data) => sum + parseFloat(data.GrossPay || 0), 0).toFixed(2);
      const totalDeductionSum = reportData.reduce((sum, data) => sum + parseFloat(data.TotalDeduction || 0), 0).toFixed(2);
      const totalNetPaySum = reportData.reduce((sum, data) => sum + parseFloat(data.NetPay || 0), 0).toFixed(2);

      autoTable(doc, {
        startY: 120,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: {
          fillColor: '#E7E7E7',
          textColor: '#000',
          fontSize: 7,
          halign: 'center',
          valign: 'middle',
        },
        styles: {
          fontSize: 6,
          cellPadding: 4,
          halign: 'center',
          valign: 'middle',
          overflow: 'linebreak',
        },
        columnStyles: {
          0: { halign: 'left', minCellWidth: 40, minCellHeight: 30, fontWeight: 'bold' }, // Name of Employee
          1: { minCellWidth: 30, minCellHeight: 30 }, // Rate
          2: { minCellWidth: 15, minCellHeight: 30 }, // Days
          3: { minCellWidth: 30, minCellHeight: 30 }, // Total
          4: { minCellWidth: 30, minCellHeight: 30 }, // Allowance
          5: { minCellWidth: 30, minCellHeight: 30 }, // Holiday Regular
          6: { minCellWidth: 30, minCellHeight: 30 }, // Holiday Special
          7: { minCellWidth: 30, minCellHeight: 30 }, // Overtime
          8: { minCellWidth: 30, minCellHeight: 30 }, // Sunday Pay
          9: { minCellWidth: 30, minCellHeight: 30 }, // Sunday Overtime Pay
          10: { minCellWidth: 30, minCellHeight: 30 }, // Leave w/ Pay
          11: { minCellWidth: 30, minCellHeight: 30 }, // Gross Pay
          12: { minCellWidth: 25, minCellHeight: 30 }, // Withholding Tax
          13: { minCellWidth: 30, minCellHeight: 30 }, // SSS Contribution
          14: { minCellWidth: 30, minCellHeight: 30 }, // SSS Calamity Loan
          15: { minCellWidth: 20, minCellHeight: 30 }, // SSS Salary Loan
          16: { minCellWidth: 30, minCellHeight: 30 }, // Pag-Ibig Contribution
          17: { minCellWidth: 30, minCellHeight: 30 }, // Pag-Ibig Calamity Loan
          18: { minCellWidth: 30, minCellHeight: 30 }, // Pag-Ibig Salary Loan
          19: { minCellWidth: 20, minCellHeight: 30 }, // Philhealth
          20: { minCellWidth: 20, minCellHeight: 30 }, // Undertime/Late
          21: { minCellWidth: 30, minCellHeight: 30 }, // Total Deduction
          22: { minCellWidth: 30, minCellHeight: 30 }, // Net Pay
          23: { minCellWidth: 60, minCellHeight: 30 }, // Signature
        },
        margin: { top: 60, left: 10, right: 10 },
        didDrawPage: (data) => {
          // Add page number
          doc.setFontSize(8);
          doc.text(
            `Page ${data.pageNumber}`,
            doc.internal.pageSize.width - 20,
            doc.internal.pageSize.height - 10,
            { align: 'right' }
          );
        },
      });

      // Render Total Gross Pay, Total Deduction, and Total Net Pay sums after table is drawn
      const tableBottomY = doc.lastAutoTable.finalY || 120;
      const grossPayColumnIndex = 11; // 0-based index for Gross Pay
      const totalDeductionColumnIndex = 21; // 0-based index for Total Deduction
      const netPayColumnIndex = 22; // 0-based index for Net Pay
      const columnXPositions = doc.lastAutoTable.columns.map(col => col.x);
      const grossPayX = columnXPositions[grossPayColumnIndex] || 418 // Fallback position
      const totalDeductionX = columnXPositions[totalDeductionColumnIndex] || 805; // Fallback position
      const netPayX = columnXPositions[netPayColumnIndex] || 845; // Fallback position
      const textY = tableBottomY + 15 < 602 ? tableBottomY + 15 : 592; // Ensure within page bounds

      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `${formatNumberWithCommas(totalGrossPaySum)}`,
        grossPayX,
        textY,
        { align: 'center' }
      );
      doc.text(
        `${formatNumberWithCommas(totalDeductionSum)}`,
        totalDeductionX,
        textY,
        { align: 'center' }
      );
      doc.text(
        `${formatNumberWithCommas(totalNetPaySum)}`,
        netPayX,
        textY,
        { align: 'center' }
      );

      const filename = `AutoPayroll_Report_${dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD')}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF generation error:', err);
      message.error('Failed to generate payroll report PDF');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const startDate = values.payrollStartDate.format('MM/DD/YYYY');
      const endDate = values.payrollEndDate.format('MM/DD/YYYY');
      const startDateObj = dayjs(startDate, 'MM/DD/YYYY');
      const endDateObj = dayjs(endDate, 'MM/DD/YYYY');

      if (endDateObj.isBefore(startDateObj)) {
        message.warning('End date cannot be before start date');
        return;
      }

      if (startDateObj.isAfter(dayjs()) || endDateObj.isAfter(dayjs())) {
        message.warning('Payroll dates cannot be in the future');
        return;
      }

      const payrollPeriods = generatePayrollPeriods('2025-04-28', 20, 20);

      const selectedPeriod = payrollPeriods.find((period) => {
        const periodStart = dayjs(period.startDate, 'MM/DD/YYYY');
        const periodEnd = dayjs(period.endDate, 'MM/DD/YYYY');
        return (
          startDateObj.isSame(periodStart, 'day') &&
          endDateObj.isSame(periodEnd, 'day')
        );
      });

      if (!selectedPeriod) {
        const closestPeriod = payrollPeriods.reduce((closest, period) => {
          const periodStart = dayjs(period.startDate, 'MM/DD/YYYY');
          const diff = Math.abs(startDateObj.diff(periodStart, 'day'));
          return diff < closest.diff ? { period, diff } : closest;
        }, { period: null, diff: Infinity }).period;

        message.warning(
          `Selected date range (${startDate}–${endDate}) does not align with the company payroll period. ` +
          `Please choose a valid range, e.g., ${closestPeriod.startDate}–${closestPeriod.endDate}).`
        );
        return;
      }

      const totalDays = endDateObj.diff(startDateObj, 'day') + 1;
      const workingDays = countWorkingDays(startDateObj, endDateObj);
      if (totalDays !== 13 || workingDays !== 12) {
        message.warning(
          `The selected payroll period has ${totalDays} days and ${workingDays} working days. ` +
          `It must span exactly 13 days (Monday–Saturday, exceptional Sunday) with 12 working days (Monday–Saturday).`
        );
        return;
      }

      const seventhDay = startDateObj.add(6, 'day');
      if (seventhDay.day() !== 0) {
        message.warning('The 7th day of the period must be a Sunday.');
        return;
      }

      const payrollCut = selectedPeriod && selectedPeriod.cut === '1st Cut' ? 'first' : 'second';
      setPayrollDates({ startDate, endDate });
      setPayrollCut(payrollCut);
      setIsModalVisible(false);
      form.resetFields();
      message.success(`Payroll date range set successfully (${selectedPeriod.cut})`);
    } catch (err) {
      message.warning('Selected payroll date range does not align with the company payroll period.');
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  // Add this new function here
  const showPayrollDateModal = () => {
    setIsModalVisible(true);
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
          * {
            font-family: 'Poppins', sans-serif !important;
          }
        `}
      </style>
      <Title level={2} style={{ marginBottom: '20px' }}>
        Payroll Records
      </Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button
            icon={<CalendarOutlined />}
            size="middle"
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
            onClick={showPayrollDateModal}
          >
            {showLabels && <span>Set Payroll Date</span>}
          </Button>
          <RangePicker
            format="MM/DD/YYYY"
            value={historyDateRange}
            onChange={(dates) => {
              setHistoryDateRange(dates);
              // Optionally, trigger filtering here or in a useEffect
            }}
            style={{ width: 260 }}
            allowClear
            placeholder={['Start date', 'End date']}
          />
          {payrollDates.startDate && payrollDates.endDate ? (
            <>
              <Button
                icon={<FileTextOutlined />}
                size="middle"
                style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
                onClick={handlePayrollHistory}
              >
                {showLabels && <span>Payroll History</span>}
              </Button>
              <Select
                placeholder="Select Branch"
                allowClear
                value={selectedBranch === 'all' ? undefined : selectedBranch}
                onChange={handleBranchChange}
                style={{ width: screenWidth < 480 ? '100%' : '200px' }}
              >
                <Option value="all">All Branches</Option>
                {(role === 'Payroll Admin' ? branches : assignedBranches).map(branch => (
                  <Option key={branch.BranchID} value={branch.BranchID}>
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </>
          ) : null}
        </div>


        {payrollDates.startDate && payrollDates.endDate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button
              icon={<FileTextOutlined />}
              size="middle"
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
              onClick={handlePayrollReport}
            >
              {showLabels && <span>Generate Payroll Report</span>}
            </Button>
            <Button
              icon={<FileTextOutlined />}
              size="middle"
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
              onClick={handleBulkPayslip}
            >
              {showLabels && <span>Generate Payslip</span>}
            </Button>
            <Input
              placeholder="Search by any field (e.g., name, branch, allowance, contribution)"
              allowClear
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
            />
          </div>
        ) : null}
      </div>

      {(!payrollDates.startDate || !payrollDates.endDate) && (
        <Col span={24} style={{ marginBottom: 20 }}>
          <Card>
            <Table
              dataSource={payrollHistoryData}
              scroll={{ x: 'max-content' }}
              bordered
              pagination={false}
            >
              <Column title="Payroll Period" dataIndex="payrollPeriod" key="payrollPeriod" />
              <Column title="Cut Off" dataIndex="cutOff" key="cutOff" />
              <Column
                title="Created At"
                dataIndex="createdAt"
                key="createdAt"
                render={(text) => dayjs(text).format('MM/DD/YYYY HH:mm:ss')}
              />
              <Column
                title="Action"
                key="action"
                render={(_, record) => (
                  <Button
                    icon={<FileTextOutlined />}
                    size="middle"
                    style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
                    onClick={() => handleViewPayroll(record)}
                  >
                    {showLabels && <span>View Payroll</span>}
                  </Button>
                )}
              />
            </Table>
            {filteredPaginationTotal > 0 && (
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={filteredPaginationTotal}
                onChange={handlePageChange}
                onShowSizeChange={handlePageChange}
                showSizeChanger
                showQuickJumper={{ goButton: false }}
                showTotal={(total, range) => `Total of ${total} payroll records`}
                pageSizeOptions={['20', '50', '100']}
                style={{ marginTop: 16, textAlign: 'center', justifyContent: 'center' }}
              />
            )}
          </Card>
        </Col>
      )}

      <Modal
        title="Payroll Details"
        open={isPayrollViewModalVisible}
        onCancel={() => {
          setIsPayrollViewModalVisible(false);
          setSelectedPayroll(null);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setIsPayrollViewModalVisible(false);
              setSelectedPayroll(null);
            }}
          >
            Close
          </Button>,
        ]}
        styles={{ fontSize: '18px' }}
        width={screenWidth > 480 ? '80%' : '90%'}
        centered
        destroyOnHidden
      >
        {selectedPayroll && selectedPayroll.length > 0 ? (
          <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <Title level={4}>
              Payroll Period Details for: {selectedPayroll[0].payrollPeriod} ({selectedPayroll[0].cutOff})
            </Title>
            <Text>Created At: {dayjs(selectedPayroll[0].createdAt).format('MM/DD/YYYY HH:mm:ss')}</Text>
            <Table
              dataSource={selectedPayroll}
              scroll={{ x: 'max-content' }}
              bordered
              pagination={false}
              style={{ marginTop: 20 }}
            >
              <Column title="Employee ID" dataIndex="employeeId" key="employeeId" />
              <Column title="Employee Name" dataIndex="employeeName" key="employeeName" />
              <Column
                title="Daily Rate"
                dataIndex="dailyRate"
                key="dailyRate"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Basic Pay"
                dataIndex="basicPay"
                key="basicPay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Overtime Pay"
                dataIndex="overtimePay"
                key="overtimePay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Sunday Pay"
                dataIndex="sundayPay"
                key="sundayPay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Holiday Pay"
                dataIndex="holidayPay"
                key="holidayPay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Gross Pay"
                dataIndex="grossPay"
                key="grossPay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Total Deductions"
                dataIndex="totalDeductions"
                key="totalDeductions"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
              <Column
                title="Net Pay"
                dataIndex="netPay"
                key="netPay"
                render={(text) => `₱${formatNumberWithCommas(text)}`}
              />
            </Table>
          </div>
        ) : (
          <Text>No payroll data available for this period.</Text>
        )}
      </Modal>

      {payrollDates.startDate && payrollDates.endDate && (
        <div style={{ marginBottom: 16, fontSize: '16px' }}>
          <span style={{ fontWeight: 'bold' }}>Payroll Period:</span> {payrollDates.startDate} - {payrollDates.endDate} ({payrollCut === 'first' ? '1st Cut' : '2nd Cut'})
        </div>
      )}

      {payrollDates.startDate && payrollDates.endDate && (
        <Table
          dataSource={filteredData}
          bordered
          scroll={{ x: true }}
          pagination={false}
        >
          <Column
            title="Employee ID"
            dataIndex="employeeId"
            key="employeeId"
            sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)}
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
            dataIndex="branchName"
            key="branchName"
            sorter={(a, b) => a.branchName.localeCompare(b.branchName)}
            render={(text) => <span>{text}</span>}
          />
          <Column
            title="Allowances"
            dataIndex="allowances"
            key="allowances"
            render={(allowances, record) => (
              <Space wrap>
                {allowances.map((allowance, index) => (
                  <Tag
                    key={allowance.AllowanceID ? `allowance-${allowance.AllowanceID}` : `allowance-${record.employeeId}-${index}`}
                    color="green"
                  >
                    {allowance.description}: ₱{formatNumberWithCommas(allowance.amount)}
                  </Tag>
                ))}
              </Space>
            )}
          />
          <Column
            title="Deductions"
            dataIndex="contributions"
            key="contributions"
            render={(contributions, record) => (
              <Space wrap>
                {contributions.map((contribution, index) => (
                  <Tag
                    key={contribution.contributionId ? `contribution-${contribution.contributionId}` : `contribution-${record.employeeId}-${index}`}
                    color="blue"
                  >
                    {getContributionLabel(contribution.type)}: ₱{formatNumberWithCommas(contribution.amount)}
                  </Tag>
                ))}
                {record.lateMinutes > 0 && (
                  <Tag key={`late-${record.employeeId}`} color="blue">
                    Late: {record.lateMinutes} mins
                  </Tag>
                )}
              </Space>
            )}
          />
          <Column
            title="Hours Worked"
            dataIndex="hoursWorked"
            key="hoursWorked"
            sorter={(a, b) => a.hoursWorked - b.hoursWorked}
            render={(text) => <span>{text} hrs</span>}
          />
          <Column
            title="Action"
            key="action"
            render={(_, record) => (
              <Space size="middle" wrap>
                <Button
                  icon={<FileTextOutlined />}
                  size="middle"
                  style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
                  onClick={() => handleGeneratePayslip(record.employeeId)}
                  disabled={!payrollCut || !['first', 'second'].includes(payrollCut)}
                >
                  {showLabels && <span>View Payslip</span>}
                </Button>
              </Space>
            )}
          />
        </Table>
      )}

      {payrollDates.startDate && payrollDates.endDate && (
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={paginationTotal}
          onChange={handlePageChange}
          onShowSizeChange={handlePageChange}
          showSizeChanger
          showQuickJumper={{ goButton: false }}
          showTotal={(total) => `Total ${total} employee records`}
          pageSizeOptions={['20', '50', '100']}
          style={{ marginTop: 16, textAlign: 'center', justifyContent: 'center' }}
        />
      )}


      <Modal
        title="Set Payroll Date"
        open={isModalVisible}
        onOk={() => {
          form
            .validateFields()
            .then((values) => {
              const lastPayrollDate = values.lastPayrollDate
                ? dayjs(values.lastPayrollDate).format('MM/DD/YYYY')
                : null;
              const cutOff = values.cutOff;

              if (!lastPayrollDate || !cutOff) {
                message.error('Please select both Last Payroll Date and Cut Off');
                return;
              }

              const periods = generatePayrollPeriods(lastPayrollDate);
              if (periods.length === 0) {
                message.error('Failed to generate payroll period');
                return;
              }

              const { startDate, endDate } = periods[0];
              setPayrollDates({ startDate, endDate });
              setPayrollCut(cutOff === 'First Cut' ? 'first' : 'second');
              setIsModalVisible(false);
              form.resetFields();

              message.success(
                `Payroll period set: ${startDate} to ${endDate}, Cut Off: ${cutOff}`
              );
              fetchData(); // Refresh data with new payroll period
            })
            .catch((info) => {
              message.error('Please fill in all required fields');
            });
        }}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
          setPayrollPeriodText(""); // clear text
        }}
        afterClose={() => {
          setPayrollPeriodText("");
        }}
        okText="Set Period"
        cancelText="Cancel"
        centered
        width={screenWidth > 480 ? '50%' : '90%'}
        destroyOnHidden
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <Form layout="vertical" form={form}>
            <Alert
              message="How It Works"
              description={
                <div style={{ fontSize: '14px' }}>
                  <p>Select the last the payroll date that your company had to view payroll details.</p>
                  <ul>
                    <li><strong>Select Last Payroll Period</strong>: Each period spans 12 working days (exceptional Sunday).</li>
                    <li><strong>Payroll Cut</strong>: Determined manually based on the selected cut (1st Cut or 2nd Cut). Each cycle is 24 working days (12 for 1st cut, 12 for 2nd cut).</li>
                    <li><strong>Example</strong>: 1st Cut: 04/26/2025–05/09/2025 (14 days, 12 working days, Sunday 05/04/2025 and 04/27/2025), 2nd Cut: 05/10/2025–05/23/2025 (14 days, 12 working days, Sunday 05/11/2025 and 05/18/2025).</li>
                    <li>1st Cut includes government-mandated benefits (e.g., SSS, Pag-Ibig, PhilHealth).</li>
                    <li>2nd Cut includes government-mandated loans (e.g., Pag-Ibig Calamity Loan, SSS Salary Loan).</li>
                    <li>The system will automatically counts to 12 working days based from the Selected Last Payroll Date (exceptional Sunday).</li>
                    <li>The table will show employees with attendance records within the selected last payroll period.</li>
                  </ul>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 20 }}
            />
            <Form.Item
              name="lastPayrollDate"
              label={
                <span>
                  Last Payroll Date<span style={{ color: 'red' }}>*</span>
                </span>
              }
              rules={[{ required: true, message: 'Please select the last payroll date' }]}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <DatePicker
                  format="MM/DD/YYYY"
                  style={{ width: '50%' }}
                  onChange={handleLastPayrollDateChange}
                />
                {payrollPeriodText && (
                  <span style={{ fontWeight: 500, color: '#3291AD' }}>{payrollPeriodText}</span>
                )}
              </div>
            </Form.Item>
            <Form.Item
              name="cutOff"
              label={
                <span>
                  Cut Off<span style={{ color: 'red' }}>*</span>
                </span>
              }
              rules={[{ required: true, message: 'Please select the cut off' }]}
            >
              <Select placeholder="Select Cut Off" style={{ width: '50%' }}>
                <Option value="First Cut">First Cut</Option>
                <Option value="Second Cut">Second Cut</Option>
              </Select>
            </Form.Item>
          </Form>
        </div>
      </Modal>

      <Modal
        title="Employee Payslip"
        open={isPayslipModalVisible}
        onCancel={() => {
          setIsPayslipModalVisible(false);
          setPayslipData(null);
          setSelectedEmployee(null);
        }}
        footer={[
          <Button
            key="download"
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => downloadPayslipPDF(payslipData)}
            disabled={payslipLoading || !payslipData}
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
          >
            Download Payslip
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setIsPayslipModalVisible(false);
              setPayslipData(null);
              setSelectedEmployee(null);
            }}
          >
            Close
          </Button>,
        ]}
        width={screenWidth > 480 ? '50%' : '90%'}
        centered
        destroyOnHidden
      >
        {payslipLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <Spin />
            <div style={{ marginTop: '10px' }}>Generating payslip...</div>
          </div>
        ) : payslipData ? (
          <div className="payslip-content" style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <Title level={4}>
              Payslip for {payslipData.EmployeeName}
            </Title>
            <Text>Branch: {payslipData.BranchName}</Text><br />
            <Text>
              Period: {payrollDates.startDate} to {payrollDates.endDate}
            </Text>
            <Row gutter={[16, 24]} style={{ marginTop: 20 }}>
              <Col xs={24} md={12}>
                <Card title="Earnings">
                  <Table
                    columns={[
                      { title: 'Description', dataIndex: 'Description', key: 'Description' },
                      { title: 'Amount', dataIndex: 'Amount', key: 'Amount', render: (text) => `₱${text}` },
                    ]}
                    dataSource={[...payslipData.EarningsData, ...payslipData.PremiumPayData]
                      .filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0)}
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="Deductions">
                  <Table
                    columns={[
                      { title: 'Description', dataIndex: 'desc', key: 'desc' },
                      { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (text) => `₱${text}` },
                    ]}
                    dataSource={[
                      {
                        key: `late-${payslipData.EmployeeID}`,
                        desc: `Late/Undertime Mins: ${(parseInt(payslipData.LateMinutes) + parseInt(payslipData.UndertimeMinutes))} mins`,
                        amount: formatNumberWithCommas(payslipData.LateDeduction || '0.00')
                      },
                      ...(payslipData.ContributionsData?.map((item, index) => ({
                        key: item.ID ? `contribution-${payslipData.EmployeeID}-${item.ID}` : `contribution-${payslipData.EmployeeID}-${index}`,
                        desc: item.ContributionType || 'Unknown',
                        amount: formatNumberWithCommas(item.Amount || '0.00'),
                      })) || []),
                    ].filter(item => parseFloat(item.amount.replace(/,/g, '')) !== 0)}
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
              <Col xs={24}>
                <Card title="Summary">
                  <Text>Gross Pay: ₱{payslipData ? formatNumberWithCommas(parseAmount(payslipData.TotalEarnings, payslipData.EmployeeID) || 0.00) : '0.00'}</Text><br />
                  <Text>Total Deductions: ₱{payslipData ? formatNumberWithCommas(parseAmount(payslipData.TotalDeductions, payslipData.EmployeeID) || 0.00) : '0.00'}</Text><br />
                  <Text strong>Net Pay: ₱{payslipData ? formatNumberWithCommas(parseAmount(payslipData.NetPay, payslipData.EmployeeID) || 0.00) : '0.00'}</Text>
                </Card>
              </Col>
            </Row>
          </div>
        ) : (
          <Text>No payslip data available.</Text>
        )}
      </Modal>

      <Modal
        title="Bulk Payslips"
        open={isBulkPayslipModalVisible}
        onCancel={() => {
          setIsBulkPayslipModalVisible(false);
          setBulkPayslipData([]);
        }}
        footer={[
          <Button
            key="download"
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => downloadBulkPayslipPDF(bulkPayslipData)}
            disabled={payslipLoading || !bulkPayslipData.length}
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }}
          >
            Download Bulk Payslips
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setIsBulkPayslipModalVisible(false);
              setBulkPayslipData([]);
            }}
          >
            Close
          </Button>,
        ]}
        width={screenWidth > 480 ? '45%' : '90%'}
        centered
        destroyOnHidden
      >
        {payslipLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <Spin />
            <div style={{ marginTop: '10px' }}>Generating bulk payslips...</div>
          </div>
        ) : bulkPayslipData.length > 0 ? (
          <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            {bulkPayslipData.map((payslip) => (
              <div key={`payslip-${payslip.EmployeeID}`} style={{ marginBottom: '20px' }}>
                <Title level={4}>
                  Payslip for {payslip.EmployeeName}
                </Title>
                <Text>Branch: {payslip.BranchName}</Text><br />
                <Text>
                  Period: {payrollDates.startDate} to {payrollDates.endDate}
                </Text>
                <Row gutter={[16, 24]} style={{ marginTop: 20 }}>
                  <Col xs={24} md={12}>
                    <Card title="Earnings">
                      <Table
                        columns={[
                          { title: 'Description', dataIndex: 'Description', key: 'Description' },
                          { title: 'Amount', dataIndex: 'Amount', key: 'Amount', render: (text) => `₱${text}` },
                        ]}
                        dataSource={[...payslip.EarningsData, ...payslip.PremiumPayData]
                          .filter(item => parseFloat(item.Amount.replace(/,/g, '')) !== 0)}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="Deductions">
                      <Table
                        columns={[
                          { title: 'Description', dataIndex: 'desc', key: 'desc' },
                          { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (text) => `₱${text}` },
                        ]}
                        dataSource={[
                          {
                            key: `late-${payslip.EmployeeID}`,
                            desc: `Late/Undertime Mins: ${(parseInt(payslip.LateMinutes) + parseInt(payslip.UndertimeMinutes))} mins`,
                            amount: formatNumberWithCommas(payslip.LateDeduction || '0.00')
                          },
                          ...(payslip.ContributionsData?.map((item, index) => ({
                            key: item.ID ? `contribution-${payslip.EmployeeID}-${item.ID}` : `contribution-${payslip.EmployeeID}-${index}`,
                            desc: item.ContributionType || 'Unknown',
                            amount: formatNumberWithCommas(item.Amount || '0.00'),
                          })) || []),
                        ].filter(item => parseFloat(item.amount.replace(/,/g, '')) !== 0)}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  </Col>
                  <Col xs={24}>
                    <Card title="Summary">
                      <Text>Gross Pay: ₱{formatNumberWithCommas(parseAmount(payslip.TotalEarnings, payslip.EmployeeID) || 0.00)}</Text><br />
                      <Text>Total Deductions: ₱{formatNumberWithCommas(parseAmount(payslip.TotalDeductions, payslip.EmployeeID) || 0.00)}</Text><br />
                      <Text strong>Net Pay: ₱{formatNumberWithCommas(parseAmount(payslip.NetPay, payslip.EmployeeID) || 0.00)}</Text>
                    </Card>
                  </Col>
                </Row>
              </div>
            ))}
          </div>
        ) : (
          <Text>No bulk payslip data available.</Text>
        )}
      </Modal>
    </div>
  );
};

export default PayrollTable;