import { useState, useEffect, useCallback } from 'react';
import { Space, Table, Button, Input, Select, Tag, Typography, Pagination, message, Modal, DatePicker, Form, Alert, Spin, Row, Col, Card } from 'antd';
import { FileTextOutlined, SearchOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // If the selected date is a Sunday, start counting from the next Monday
  if (startDate.day() === 0) {
    startDate = startDate.add(1, 'day');
  }

  let currentDate = startDate;
  let standardDays = 0;
  let endDate;

  // Count 12 standard days (Monday to Saturday, excluding Sundays)
  while (standardDays < 12) {
    if (currentDate.day() !== 0) { // Exclude Sunday
      standardDays++;
    }
    currentDate = currentDate.add(1, 'day');
  }

  // The end date is the day before the last counted day
  endDate = currentDate.subtract(1, 'day');

  periods.push({
    cut: 'First Cut', // Default to First Cut; will be set via dropdown
    startDate: startDate.format('MM/DD/YYYY'),
    endDate: endDate.format('MM/DD/YYYY'),
  });

  return periods;
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

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

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
      console.error('Log Activity Error:', err);
      message.warning('Failed to log activity');
    }
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
      console.error("Fetch Dropdown Error:", err.message);
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
        // Fetch 3-year history if no payroll date is set
        startDateBackend = dayjs().subtract(3, 'year').format('YYYY-MM-DD');
        endDateBackend = dayjs().format('YYYY-MM-DD');
      } else {
        // Use selected payroll dates
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

      const mappedData = response.data.map(employee => {
        return {
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
          cashAdvances: employee.CashAdvancesData.map((cashAdvance, index) => ({
            cashAdvanceId: cashAdvance.CashAdvanceID || `cashAdvance-${index}`,
            date: cashAdvance.Date,
            amount: parseFloat(cashAdvance.Amount).toFixed(2),
            balance: parseFloat(cashAdvance.Balance).toFixed(2)
          })),
          lateMinutes: parseInt(employee.LateMinutes, 10) || 0,
          hoursWorked: parseFloat(employee.HoursWorked).toFixed(2)
        };
      });

      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Payroll Error:", err);
      message.error(`Failed to load payroll data: ${err.message}`);
      setOriginalData([]);
      setFilteredData([]);
      setPaginationTotal(0);
      setFilteredPaginationTotal(0);
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

      // Add the missing fetch call
      const response = await fetch(`${API_BASE_URL}/fetch_payroll.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to generate payslip for EmployeeID: ${employeeId}. Status: ${response.status}, Response: ${errorText}`);
        message.error(`Failed to generate payslip: HTTP ${response.status} - ${errorText}`);
        setPayslipLoading(false);
        return;
      }

      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error(`Invalid response content-type: ${contentType}, Response: ${errorText}`);
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

      // Prepare PremiumPayData without filtering zero amounts
      const premiumPayData = [
        { key: `sunday-hours-${employeeId}`, Description: `Sunday Hours (130%): ${data.data.SundayHours || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Hours (130%)'))?.Amount || '0.00') },
        { key: `sunday-ot-day-${employeeId}`, Description: `Sunday Overtime Hours (169%): ${data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (169%)'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (169%)'))?.Amount || '0.00') },
        { key: `sunday-ot-night-${employeeId}`, Description: `Sunday Overtime Hours (185.9%): ${data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (185.9%)'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (185.9%)'))?.Amount || '0.00') },
        { key: `sunday-pay-${employeeId}`, Description: 'Sunday Pay:', Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description === 'Sunday Pay')?.Amount || '0.00') },
        { key: `holiday-special-${employeeId}`, Description: `Holiday Hours (Special Non-Working) 130%: ${data.data.HolidayHours?.Special || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Special Non-Working Holiday) 130%'))?.Amount || '0.00') },
        { key: `holiday-special-ot-day-${employeeId}`, Description: `Holiday Overtime Hours (Special Non-Working) 169%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 169%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 169%'))?.Amount || '0.00') },
        { key: `holiday-special-ot-night-${employeeId}`, Description: `Holiday Overtime Hours (Special Non-Working) 185.9%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 185.9%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 185.9%'))?.Amount || '0.00') },
        { key: `holiday-regular-${employeeId}`, Description: `Holiday Hours (Regular) 200%: ${data.data.HolidayHours?.Regular || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Regular Holiday) 200%'))?.Amount || '0.00') },
        { key: `holiday-regular-ot-day-${employeeId}`, Description: `Holiday Overtime Hours (Regular) 260%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 260%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 260%'))?.Amount || '0.00') },
        { key: `holiday-regular-ot-night-${employeeId}`, Description: `Holiday Overtime Hours (Regular) 286%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 286%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 286%'))?.Amount || '0.00') },
        { 
          key: `holiday-regular-non-worked-${employeeId}`, 
          Description: `Non-Worked Legal Holiday 100%`, 
          Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description === 'Non-Worked Legal Holiday 100%')?.Amount || '0.00')
        },
        { key: `holiday-pay-${employeeId}`, Description: 'Holiday Pay:', Amount: formatNumberWithCommas(data.data.HolidayPay?.Total || '0.00') },
      ];

      const payslipWithData = {
        ...data.data,
        EarningsData: [
          { key: `daily-rate-${employeeId}`, Description: 'Daily Rate', Amount: formatNumberWithCommas(data.data.DailyRate || '0.00') },
          { key: `transportation-allowance-${employeeId}`, Description: 'Transportation Allowance', Amount: formatNumberWithCommas(data.data.AllowancesData?.find(a => a.Description === 'Transportation')?.Amount || '0.00') },
          { key: `basic-pay-${employeeId}`, Description: 'Basic Pay', Amount: formatNumberWithCommas(data.data.BasicPay || '0.00') },
          { key: `ot-regular-${employeeId}`, Description: `Overtime Hours (125%): ${data.data.OvertimeHours?.Regular || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Regular || '0.00') },
          { key: `ot-night-${employeeId}`, Description: `Overtime Hours (137.5%): ${data.data.OvertimeHours?.Night || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Night || '0.00') },
          { key: `ot-total-${employeeId}`, Description: 'Overtime Pay:', Amount: formatNumberWithCommas(data.data.OvertimePay?.Total || '0.00') },
        ],
        PremiumPayData: premiumPayData,
      };

      setPayslipData(payslipWithData);
    } catch (err) {
      console.error('Generate Payslip Error:', err);
      message.error(`Failed to generate payslip: ${err.message}`);
      setPayslipData(null);
    } finally {
      setPayslipLoading(false);
    }
  };

  const downloadPayslipPDF = () => {
    if (!payslipData || !payslipData.EmployeeID) {
      console.error('Cannot generate PDF: payslipData is invalid or missing', payslipData);
      message.warning('No payslip data available to download');
      return;
    }

    try {
      const doc = new jsPDF();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(18);
      doc.text('Payslip', 14, 20);
      doc.setFontSize(12);
      doc.text(`Employee: ${payslipData.EmployeeName || 'Unknown'} (ID: ${payslipData.EmployeeID})`, 14, 30);
      doc.text(`Branch: ${payslipData.BranchName || 'Unknown'}`, 14, 40);
      doc.text(`Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, 14, 50);

      let yPosition = 70;

      // Merge PremiumPayData into EarningsData
      const mergedEarningsData = [
        ...payslipData.EarningsData,
        ...payslipData.PremiumPayData,
      ];

      doc.setFontSize(14);
      doc.text('Earnings', 14, yPosition);
      yPosition += 10;
      autoTable(doc, {
        startY: yPosition,
        head: [['Description', 'Amount']],
        body: mergedEarningsData.map(item => [item.Description, item.Amount]),
        theme: 'striped',
        headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
        styles: { fontSize: 7, cellPadding: 4 },
      });
      yPosition = doc.lastAutoTable.finalY + 10;

      // Merge ContributionsData into Deductions
      const mergedDeductionsData = [
        ['Late/Undertime', payslipData.LateDeduction || '0.00'],
        ['Absent Deduction', payslipData.AbsentDeduction || '0.00'],
        ...(payslipData.ContributionsData?.map(item => [item.ContributionType || 'Unknown', item.Amount || '0.00']) || []),
      ];

      doc.setFontSize(14);
      doc.text('Deductions', 14, yPosition);
      yPosition += 10;
      autoTable(doc, {
        startY: yPosition,
        head: [['Description', 'Amount']],
        body: mergedDeductionsData,
        theme: 'striped',
        headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
        styles: { fontSize: 7, cellPadding: 4 },
      });
      yPosition = doc.lastAutoTable.finalY + 10;

      if (payslipData.AllowancesData?.length > 0) {
        doc.setFontSize(14);
        doc.text('Allowances', 14, yPosition);
        yPosition += 10;
        autoTable(doc, {
          startY: yPosition,
          head: [['Description', 'Amount']],
          body: payslipData.AllowancesData.map(item => [item.Description || 'Unknown', item.Amount || '0.00']),
          theme: 'striped',
          headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
          styles: { fontSize: 7, cellPadding: 4 },
        });
        yPosition = doc.lastAutoTable.finalY + 10;
      }

      doc.setFontSize(12);
      doc.text(`Gross Pay: ${payslipData.TotalEarnings || '0.00'}`, 14, yPosition);
      doc.text(`Total Deductions: ${payslipData.TotalDeductions || '0.00'}`, 14, yPosition + 10);
      doc.setFontSize(14);
      doc.text(`Net Pay: ${payslipData.NetPay || '0.00'}`, 14, yPosition + 30);

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
        console.error('User ID is missing; cannot log activity');
        message.warning('Activity logging skipped due to missing user ID');
      }

      message.success('Payslip PDF generated successfully');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      message.error('Failed to generate payslip PDF');
    }
  }

  const downloadBulkPayslipPDF = (bulkPayslipData) => {
    try {
      // Log payslip details for each employee
      bulkPayslipData.forEach((payslipData, index) => {
        if (!payslipData || !payslipData.EmployeeID) {
          console.warn(`Skipping invalid payslip data for index ${index}`);
          return;
        }

        console.log(`Payslip Details for EmployeeID: ${payslipData.EmployeeID} (${payslipData.EmployeeName})`);
        console.log('Branch:', payslipData.BranchName || 'Unknown');
        console.log('Payroll Period:', `${payrollDates.startDate} to ${payrollDates.endDate}`);
        
        console.log('Earnings:');
        const mergedEarningsData = [
          ...payslipData.EarningsData,
          ...payslipData.PremiumPayData,
        ];
        mergedEarningsData.forEach(item => {
          console.log(`- ${item.Description}: ${item.Amount}`);
        });

        console.log('Deductions:');
        const mergedDeductionsData = [
          { Description: `Late/Undertime Mins: ${(parseInt(payslipData.LateMinutes) + parseInt(payslipData.UndertimeMinutes))} mins`, Amount: formatNumberWithCommas(payslipData.LateDeduction || '0.00') },
          { Description: `Absent (Days): ${payslipData.AbsentDays || '0'} days`, Amount: formatNumberWithCommas(payslipData.AbsentDeduction || '0.00') },
          ...(payslipData.ContributionsData?.map(item => ({
            Description: item.ContributionType || 'Unknown',
            Amount: formatNumberWithCommas(item.Amount || '0.00')
          })) || []),
        ];
        mergedDeductionsData.forEach(item => {
          console.log(`- ${item.Description}: ${item.Amount}`);
        });

        console.log('Summary:');
        console.log(`- Gross Pay: ${formatNumberWithCommas(payslipData.TotalEarnings || '0.00')}`);
        console.log(`- Total Deductions: ${formatNumberWithCommas(payslipData.TotalDeductions || '0.00')}`);
        console.log(`- Net Pay: ${formatNumberWithCommas(payslipData.NetPay || '0.00')}`);
        console.log('------------------------');
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
          console.warn(`Skipping invalid payslip data for index ${index}`);
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

        doc.setFontSize(5);
        doc.text(`Employee: ${payslipData.EmployeeName || 'Unknown'}`, xPosition + 2, yPosition + 3);
        doc.text(`Branch: ${payslipData.BranchName || 'Unknown'}`, xPosition + 2, yPosition + 6);
        doc.text(`Payroll Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, xPosition + 2, yPosition + 9);

        let contentY = yPosition + 13;

        const mergedEarningsData = [
          ...payslipData.EarningsData,
          ...payslipData.PremiumPayData,
        ];

        doc.setFontSize(4);
        doc.text('Earnings', xPosition + 2, contentY);
        autoTable(doc, {
          startY: contentY + 2,
          margin: { left: xPosition + 2 },
          head: [['Description', 'Amount']],
          body: mergedEarningsData.map(item => [item.Description, item.Amount]),
          theme: 'plain',
          headStyles: { fillColor: '#E7E7E7', textColor: '#000', fontSize: 3 },
          styles: { fontSize: 3, cellPadding: 0.7, overflow: 'linebreak' },
          columnStyles: { 0: { cellWidth: tableWidth / 2 }, 1: { cellWidth: tableWidth / 2 } },
          tableWidth: tableWidth,
        });
        const earningsHeight = doc.lastAutoTable.finalY - contentY;

        const mergedDeductionsData = [
          [`Late/Undertime Mins: ${(parseInt(payslipData.LateMinutes) + parseInt(payslipData.UndertimeMinutes))} mins`, formatNumberWithCommas(payslipData.LateDeduction || '0.00')],
          [`Absent (Days): ${payslipData.AbsentDays || '0'} days`, formatNumberWithCommas(payslipData.AbsentDeduction || '0.00')],
          ...(payslipData.ContributionsData?.map(item => [item.ContributionType || 'Unknown', formatNumberWithCommas(item.Amount || '0.00')]) || []),
        ];

        const deductionsX = xPosition + 2 + tableWidth + tableSpacing;
        doc.setFontSize(4);
        doc.text('Deductions', deductionsX, contentY);
        autoTable(doc, {
          startY: contentY + 2,
          margin: { left: deductionsX },
          head: [['Description', 'Amount']],
          body: mergedDeductionsData,
          theme: 'plain',
          headStyles: { fillColor: '#E7E7E7', textColor: '#000', fontSize: 3 },
          styles: { fontSize: 3, cellPadding: 0.7, overflow: 'linebreak' },
          columnStyles: { 0: { cellWidth: tableWidth / 2 }, 1: { cellWidth: tableWidth / 2 } },
          tableWidth: tableWidth,
        });
        const deductionsHeight = doc.lastAutoTable.finalY - contentY;

        const maxTableHeight = Math.max(earningsHeight, deductionsHeight);
        contentY += maxTableHeight + 5;

        doc.setFontSize(4);
        doc.text(`Gross Pay: ${formatNumberWithCommas(payslipData.TotalEarnings || '0.00')}`, xPosition + 2, contentY);
        doc.text(`Total Deductions: ${formatNumberWithCommas(payslipData.TotalDeductions || '0.00')}`, xPosition + 2, contentY + 3);
        doc.setFontSize(5);
        doc.text(`Net Pay: ${formatNumberWithCommas(payslipData.NetPay || '0.00')}`, xPosition + 2, contentY + 6);

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
      console.error('Bulk PDF Generation Error:', err);
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
        message.warning('Payroll date range is not set.');
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
          console.warn(`Failed to fetch payslip for EmployeeID: ${employee.employeeId}. Status: ${response.status}, Response: ${errorText}`);
          message.error(`Failed to generate payslip for EmployeeID ${employee.employeeId}: HTTP ${response.status} - ${errorText}`);
          continue;
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await response.text();
          console.error(`Invalid response content-type: ${contentType}, Response: ${errorText}`);
          message.error(`Invalid response for EmployeeID ${employee.employeeId}`);
          continue;
        }
        const data = await response.json();
        if (data.success && data.data) {
          // Prepare PremiumPayData without filtering zero amounts
          const premiumPayData = [
            { key: `sunday-hours-${employee.employeeId}`, Description: `Sunday Hours (130%): ${data.data.SundayHours || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Hours (130%)'))?.Amount || '0.00') },
            { key: `sunday-ot-day-${employee.employeeId}`, Description: `Sunday Overtime Hours (169%): ${data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (169%)'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (169%)'))?.Amount || '0.00') },
            { key: `sunday-ot-night-${employee.employeeId}`, Description: `Sunday Overtime Hours (185.9%): ${data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (185.9%)'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (185.9%)'))?.Amount || '0.00') },
            { key: `sunday-pay-${employee.employeeId}`, Description: 'Sunday Pay:', Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description === 'Sunday Pay')?.Amount || '0.00') },
            { key: `holiday-special-${employee.employeeId}`, Description: `Holiday Hours (Special Non-Working) 130%: ${data.data.HolidayHours?.Special || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Special Non-Working Holiday) 130%'))?.Amount || '0.00') },
            { key: `holiday-special-ot-day-${employee.employeeId}`, Description: `Holiday Overtime Hours (Special Non-Working) 169%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 169%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 169%'))?.Amount || '0.00') },
            { key: `holiday-special-ot-night-${employee.employeeId}`, Description: `Holiday Overtime Hours (Special Non-Working) 185.9%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 185.9%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 185.9%'))?.Amount || '0.00') },
            { key: `holiday-regular-${employee.employeeId}`, Description: `Holiday Hours (Regular) 200%: ${data.data.HolidayHours?.Regular || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Hours (Regular Holiday) 200%'))?.Amount || '0.00') },
            { key: `holiday-regular-ot-day-${employee.employeeId}`, Description: `Holiday Overtime Hours (Regular) 260%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 260%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 260%'))?.Amount || '0.00') },
            { key: `holiday-regular-ot-night-${employee.employeeId}`, Description: `Holiday Overtime Hours (Regular) 286%: ${data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 286%'))?.Description.match(/(\d*\.?\d+)\s*hrs/)?.[1] || '0'} hrs`, Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 286%'))?.Amount || '0.00') },
            { 
              key: `holiday-regular-non-worked-${employee.employeeId}`, 
              Description: `Non-Worked Legal Holiday 100%`, 
              Amount: formatNumberWithCommas(data.data.PremiumPayData?.find(p => p.Description === 'Non-Worked Legal Holiday 100%')?.Amount || '0.00')
            },
            { key: `holiday-pay-${employee.employeeId}`, Description: 'Holiday Pay:', Amount: formatNumberWithCommas(data.data.HolidayPay?.Total || '0.00') },
          ];

          const payslipWithData = {
            ...data.data,
            EarningsData: [
              { key: `daily-rate-${employee.employeeId}`, Description: 'Daily Rate', Amount: formatNumberWithCommas(data.data.DailyRate || '0.00') },
              { key: `transportation-allowance-${employee.employeeId}`, Description: 'Transportation Allowance', Amount: formatNumberWithCommas(data.data.AllowancesData?.find(a => a.Description === 'Transportation')?.Amount || '0.00') },
              { key: `basic-pay-${employee.employeeId}`, Description: 'Basic Pay', Amount: formatNumberWithCommas(data.data.BasicPay || '0.00') },
              { key: `ot-regular-${employee.employeeId}`, Description: `Overtime Hours (125%): ${data.data.OvertimeHours?.Regular || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Regular || '0.00') },
              { key: `ot-night-${employee.employeeId}`, Description: `Overtime Hours (137.5%): ${data.data.OvertimeHours?.Night || '0'}`, Amount: formatNumberWithCommas(data.data.OvertimePay?.Night || '0.00') },
              { key: `ot-total-${employee.employeeId}`, Description: 'Overtime Pay:', Amount: formatNumberWithCommas(data.data.OvertimePay?.Total || '0.00') },
            ],
            PremiumPayData: premiumPayData,
          };
          bulkPayslipData.push(payslipWithData);
        } else {
          console.warn(`No valid payslip data for EmployeeID: ${employee.employeeId}`);
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
      console.error('Bulk Payslip Error:', err);
      message.error(`Failed to generate bulk payslips: ${err.message}`);
    } finally {
      setPayslipLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    // Fetch 3-year history on initial load
    debouncedFetchData();
  }, [debouncedFetchData]);

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

  const handleBranchChange = (value) => {
    const branchValue = value || 'all';
    setSelectedBranch(branchValue);
    setCurrentPage(1);
    fetchData(); // Directly call fetchData to ensure immediate update
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

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
          console.warn(`Failed to fetch payslip for EmployeeID: ${employee.EmployeeID}`);
          return null;
        }

        const payslipData = await payslipRes.json();
        if (!payslipData.success) {
          console.warn(`Failed to generate payslip for EmployeeID: ${employee.EmployeeID}`);
          return null;
        }

        return {
          EmployeeName: employee.EmployeeName,
          DailyRate: payslipData.data.DailyRate || '0.00',
          DaysPresent: Math.floor((parseFloat(payslipData.data.HoursWorked) / 8) - (parseInt(payslipData.data.AbsentDays) || 0)), // Whole number
          TotalBasic: payslipData.data.BasicPay || '0.00',
          Allowance: payslipData.data.AllowancesData?.reduce((sum, a) => sum + parseFloat(a.Amount || 0), 0).toFixed(2) || '0.00',
          Overtime: payslipData.data.OvertimePay?.Total || '0.00',
          HolidayRegular: payslipData.data.HolidayPay?.Regular || '0.00',
          HolidaySpecial: payslipData.data.HolidayPay?.Special || '0.00',
          HolidayOvertime: (
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 169%'))?.Amount || 0) +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Special Non-Working Holiday) 185.9%'))?.Amount || 0) +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 260%'))?.Amount || 0) +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Holiday Overtime Hours (Regular Holiday) 286%'))?.Amount || 0)
          ).toFixed(2),
          SundayPay: payslipData.data.SundayPay?.Total || '0.00',
          SundayOvertime: (
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (169%)'))?.Amount || 0) +
            parseFloat(payslipData.data.PremiumPayData?.find(p => p.Description.includes('Sunday Overtime Hours (185.9%)'))?.Amount || 0)
          ).toFixed(2),
          LeavePay: '0.00', // Placeholder, as leave pay logic isn't provided
          GrossPay: payslipData.data.TotalEarnings || '0.00',
          SSSContribution: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS')?.Amount || '0.00',
          SSSCalamityLoan: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS Calamity')?.Amount || '0.00',
          SSSSalaryLoan: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'SSS Salary')?.Amount || '0.00',
          PagIbigContribution: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig')?.Amount || '0.00',
          PagIbigCalamityLoan: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig Calamity')?.Amount || '0.00',
          PagIbigSalaryLoan: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'Pag-Ibig Salary')?.Amount || '0.00',
          Philhealth: payslipData.data.ContributionsData?.find(c => c.ContributionType === 'PhilHealth')?.Amount || '0.00',
          CashAdvance: payslipData.data.CashAdvancesData?.reduce((sum, ca) => sum + parseFloat(ca.Amount || 0), 0).toFixed(2) || '0.00',
          UndertimeLate: payslipData.data.LateDeduction || '0.00',
          TotalDeduction: payslipData.data.TotalDeductions || '0.00',
          NetPay: payslipData.data.NetPay || '0.00',
          Signature: '', // Placeholder for signature
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
    console.error('Payroll Report Error:', err);
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
    doc.text('306, 317 Roosevelt Ave. Brgy. San Antonio, Quezon City', 10, 97);
    doc.text('Cell #: (63+) 968-884-2447', 10, 104);
    doc.text(`Payroll Period: ${payrollDates.startDate} to ${payrollDates.endDate}`, 10, 111);

    // Table Configuration
    const head = [
      [
        { content: 'Name', rowSpan: 2 },
        { content: 'Rate', rowSpan: 2 },
        { content: 'Days', rowSpan: 2 },
        { content: 'Total', rowSpan: 2 },
        { content: 'Allowance', rowSpan: 2 },
        { content: 'Overtime', rowSpan: 2 },
        { content: 'HOLIDAY W/ PAY', colSpan: 2 },
        { content: 'Holiday Overtime', rowSpan: 2 },
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
        'SSS Contri', 'SSS Calamity Loan', 'SSS Salary Loan',
        'Pag-Ibig Contri', 'Pag-Ibig Calamity Loan', 'Pag-Ibig Salary Loan',
        'Philhealth', 'Cash Advance', 'Undertime/Late',
      ],
    ];

    const body = reportData.map(data => [
      data.EmployeeName,
      formatNumberWithCommas(data.DailyRate),
      data.DaysPresent.toString(), // Whole number as string
      formatNumberWithCommas(data.TotalBasic),
      formatNumberWithCommas(data.Allowance),
      formatNumberWithCommas(data.Overtime),
      formatNumberWithCommas(data.HolidayRegular),
      formatNumberWithCommas(data.HolidaySpecial),
      formatNumberWithCommas(data.HolidayOvertime),
      formatNumberWithCommas(data.SundayPay),
      formatNumberWithCommas(data.SundayOvertime),
      formatNumberWithCommas(data.LeavePay),
      formatNumberWithCommas(data.GrossPay),
      formatNumberWithCommas(data.SSSContribution),
      formatNumberWithCommas(data.SSSCalamityLoan),
      formatNumberWithCommas(data.SSSSalaryLoan),
      formatNumberWithCommas(data.PagIbigContribution),
      formatNumberWithCommas(data.PagIbigCalamityLoan),
      formatNumberWithCommas(data.PagIbigSalaryLoan),
      formatNumberWithCommas(data.Philhealth),
      formatNumberWithCommas(data.CashAdvance),
      formatNumberWithCommas(data.UndertimeLate),
      formatNumberWithCommas(data.TotalDeduction),
      formatNumberWithCommas(data.NetPay),
      data.Signature,
    ]);

    // Calculate sum of Total Deductions
    const totalDeductionsSum = reportData.reduce((sum, data) => sum + parseFloat(data.TotalDeduction || 0), 0).toFixed(2);

    autoTable(doc, {
      startY: 120,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: '#E7E7E7',
        textColor: '#000',
        fontSize: 5,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 5,
        cellPadding: 2,
        halign: 'center',
        valign: 'middle',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { halign: 'left', minCellWidth: 60, minCellHeight: 15, fontWeight: 'bold' }, // Name of Employee
        1: { minCellWidth: 30 }, // Rate
        2: { minCellWidth: 20 }, // Days
        3: { minCellWidth: 30 }, // Total
        4: { minCellWidth: 30 }, // Allowance
        5: { minCellWidth: 30 }, // Overtime
        6: { minCellWidth: 30 }, // Holiday Regular
        7: { minCellWidth: 30 }, // Holiday Special
        8: { minCellWidth: 30 }, // Holiday Overtime
        9: { minCellWidth: 30 }, // Sunday Pay
        10: { minCellWidth: 30 }, // Sunday Overtime Pay
        11: { minCellWidth: 30 }, // Leave w/ Pay
        12: { minCellWidth: 30 }, // Gross Pay
        13: { minCellWidth: 30 }, // SSS Contribution
        14: { minCellWidth: 30 }, // SSS Calamity Loan
        15: { minCellWidth: 30 }, // SSS Salary Loan
        16: { minCellWidth: 30 }, // Pag-Ibig Contribution
        17: { minCellWidth: 30 }, // Pag-Ibig Calamity Loan
        18: { minCellWidth: 30 }, // Pag-Ibig Salary Loan
        19: { minCellWidth: 30 }, // Philhealth
        20: { minCellWidth: 30 }, // Cash Advance
        21: { minCellWidth: 30 }, // Undertime/Late
        22: { minCellWidth: 30 }, // Total Deduction
        23: { minCellWidth: 30 }, // Net Pay
        24: { minCellWidth: 40 }, // Signature
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

    // Render Total Deductions sum after table is drawn
    if (doc.lastAutoTable && doc.lastAutoTable.finalY && doc.lastAutoTable.columns) {
      const tableBottomY = doc.lastAutoTable.finalY;
      const totalDeductionColumnIndex = 22; // 0-based index for Total Deduction
      const columnXPositions = doc.lastAutoTable.columns.map(col => col.x);
      const columnWidth = doc.lastAutoTable.columns[totalDeductionColumnIndex]?.width || 30;
      const totalDeductionX = columnXPositions[totalDeductionColumnIndex] ? 
        columnXPositions[totalDeductionColumnIndex] + (columnWidth / 2) : 
        780; // Fallback to page center (936 / 2)
      
      // Ensure text is within page bounds (height: 612 pt)
      const textY = tableBottomY && tableBottomY + 10 < 612 - 10 ? tableBottomY + 10 : 592;
      
      // Debug logging
      console.log('Rendering Total Deductions:', {
        totalDeductionsSum,
        totalDeductionX,
        textY,
        tableBottomY,
        columnXPositions
      });

      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Total Deductions: PHP ${formatNumberWithCommas(totalDeductionsSum)}`,
        totalDeductionX,
        textY
      );
    } else {
      console.warn('Cannot render Total Deductions: lastAutoTable or its properties are missing', {
        lastAutoTable: doc.lastAutoTable,
        finalY: doc.lastAutoTable?.finalY,
        columns: doc.lastAutoTable?.columns
      });
    }

    const filename = `AutoPayroll_Report_${dayjs(payrollDates.startDate, 'MM/DD/YYYY').format('YYYY-MM-DD')}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('PDF Generation Error:', err);
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
          `It must span exactly 13 days (Monday–Saturday, exceptional Sunday, Monday–Saturday) with 12 working days (Monday–Saturday).`
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
        Payroll
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
          <Select
            placeholder="Select Branch"
            allowClear
            value={selectedBranch === 'all' ? undefined : selectedBranch} // Handle 'all' correctly
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
        </div>
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
      </div>

      {(!payrollDates.startDate || !payrollDates.endDate) && (
        <Alert
          message="Set Payroll Date First"
          description="Please set a payroll date range using the 'Set Payroll Date' button to view employee payroll records."
          type="info"
          showIcon
          style={{ marginBottom: 20, fontSize: '14px' }}
        />
      )}

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
            title="Cash Advances"
            dataIndex="cashAdvances"
            key="cashAdvances"
            render={(cashAdvances, record) => (
              <Space wrap>
                {cashAdvances.map((ca, index) => (
                  <Tag
                    key={ca.cashAdvanceId ? `cashAdvance-${ca.cashAdvanceId}` : `cashAdvance-${record.employeeId}-${index}`}
                    color="orange"
                  >
                    {ca.date}: ₱{formatNumberWithCommas(ca.amount)}, Bal: ₱{formatNumberWithCommas(ca.balance)}
                  </Tag>
                ))}
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
              console.error('Validate Failed:', info);
              message.error('Please fill in all required fields');
            });
        }}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        okText="Set Period"
        cancelText="Cancel"
        centered
        width={screenWidth > 480 ? '50%' : '90%'}
        destroyOnClose
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <Form form={form} layout="vertical">
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
            <DatePicker format="MM/DD/YYYY" style={{ width: '50%' }} />
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
        destroyOnClose
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
                    dataSource={payslipData.EarningsData}
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="Premium Pay">
                  <Table
                    columns={[
                      { title: 'Description', dataIndex: 'Description', key: 'Description' },
                      { title: 'Amount', dataIndex: 'Amount', key: 'Amount', render: (text) => `₱${text}` },
                    ]}
                    dataSource={payslipData.PremiumPayData}
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
                      { 
                        key: `absent-${payslipData.EmployeeID}`, 
                        desc: `Absent (Days): ${payslipData.AbsentDays || '0'} days`, 
                        amount: formatNumberWithCommas(payslipData.AbsentDeduction || '0.00') 
                      },
                    ]}
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
              {payslipData.ContributionsData?.length > 0 && (
                <Col xs={24} md={12}>
                  <Card title={payrollCut === 'second' ? 'Loans' : 'Contributions'}>
                    <Table
                      columns={[
                        { title: 'Description', dataIndex: 'ContributionType', key: 'Description' },
                        { title: 'Amount', dataIndex: 'Amount', key: 'Amount', render: (text) => `₱${formatNumberWithCommas(text)}` },
                      ]}
                      dataSource={payslipData.ContributionsData.map((item, index) => ({
                        ...item,
                        key: item.ID ? `contribution-${payslipData.EmployeeID}-${item.ID}` : `contribution-${payslipData.EmployeeID}-${index}`,
                      }))}
                      pagination={false}
                      size="small"
                    />
                  </Card>
                </Col>
              )}
              <Col xs={24}>
                <Card title="Summary">
                  <Text>Gross Pay: ₱{formatNumberWithCommas(payslipData.TotalEarnings || '0.00')}</Text><br />
                  <Text>Total Deductions: ₱{formatNumberWithCommas(payslipData.TotalDeductions || '0.00')}</Text><br />
                  <Text strong>Net Pay: ₱{formatNumberWithCommas(payslipData.NetPay || '0.00')}</Text>
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
        destroyOnClose
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
                        dataSource={[...payslip.EarningsData, ...payslip.PremiumPayData]}
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
                          { 
                            key: `absent-${payslip.EmployeeID}`, 
                            desc: `Absent (Days): ${payslip.AbsentDays || '0'} days`, 
                            amount: formatNumberWithCommas(payslip.AbsentDeduction || '0.00') 
                          },
                          ...(payslip.ContributionsData?.map((item, index) => ({
                            key: item.ID ? `contribution-${payslip.EmployeeID}-${item.ID}` : `contribution-${payslip.EmployeeID}-${index}`,
                            desc: item.ContributionType || 'Unknown',
                            amount: formatNumberWithCommas(item.Amount || '0.00'),
                          })) || []),
                        ]}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  </Col>
                  <Col xs={24}>
                    <Card title="Summary">
                      <Text>Gross Pay: ₱{formatNumberWithCommas(payslip.TotalEarnings || '0.00')}</Text><br />
                      <Text>Total Deductions: ₱{formatNumberWithCommas(payslip.TotalDeductions || '0.00')}</Text><br />
                      <Text strong>Net Pay: ₱{formatNumberWithCommas(payslip.NetPay || '0.00')}</Text>
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