import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, DatePicker } from 'antd';
import { FileTextOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

const { Column } = Table;
const { RangePicker } = DatePicker;

const initialData = [
  { key: '1', date: '2025-03-01', employeeId: 'EMP001', employeeName: 'John Brown', branch: 'New York', grossPay: 5000, allowances: 500, deductions: { late: 100, philhealth: 200, sss: 300, pagIbig: 100 }, cashAdvance: 500, netPay: 4400 },
  { key: '2', date: '2025-03-02', employeeId: 'EMP002', employeeName: 'Jim Green', branch: 'London', grossPay: 5500, allowances: 600, deductions: { late: 150, philhealth: 220, sss: 320, pagIbig: 120 }, cashAdvance: 400, netPay: 5010 },
  { key: '3', date: '2025-03-05', employeeId: 'EMP003', employeeName: 'Alice Johnson', branch: 'Los Angeles', grossPay: 6000, allowances: 700, deductions: { late: 200, philhealth: 250, sss: 350, pagIbig: 150 }, cashAdvance: 300, netPay: 5300 },
];

const PayrollTable = () => {
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState([]);
  const [filteredData, setFilteredData] = useState(initialData);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let filtered = initialData;
    if (dateRange.length === 2) {
      const [start, end] = dateRange;
      filtered = filtered.filter(({ date }) => dayjs(date).isBetween(start, end, 'day', '[]'));
    }
    if (searchText) {
      filtered = filtered.filter(({ employeeId, employeeName, branch }) => 
        [employeeId, employeeName, branch].some(field => field.toLowerCase().includes(searchText.toLowerCase()))
      );
    }
    setFilteredData(filtered);
  }, [searchText, dateRange]);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <Space 
  size="middle" 
  direction={screenWidth < 796 ? 'vertical' : 'horizontal'} 
  style={{ width: '100%', justifyContent: 'flex-end' }}
>
  <Button 
    icon={<FileTextOutlined />} 
    size="middle" 
    style={{ backgroundColor: '#2C3743', color: 'white', width: screenWidth < 796 ? '50%' : 'auto' }}
  >
    {screenWidth >= 796 && 'Payroll Report'}
  </Button>

  <Button 
    icon={<PrinterOutlined />} 
    size="middle" 
    style={{ backgroundColor: '#2C3743', color: 'white', width: screenWidth < 796 ? '50%' : 'auto' }}
  >
    {screenWidth >= 796 && 'Payslip'}
  </Button>

  <RangePicker 
    onChange={setDateRange} 
    style={{ width: screenWidth < 796 ? '100%' : 'auto' }} 
  />

  <Input 
    placeholder="Search..." 
    allowClear 
    value={searchText} 
    onChange={e => setSearchText(e.target.value)} 
    prefix={<SearchOutlined />} 
    style={{ width: screenWidth < 796 ? '100%' : 200 }} 
  />
</Space>

      </div>
      <Table dataSource={filteredData} bordered scroll={{ x: true }} pagination={{ responsive: true, position: ['bottomCenter'] }}>
        <Column title="Date" dataIndex="date" key="date" sorter={(a, b) => new Date(a.date) - new Date(b.date)} />
        <Column title="Employee ID" dataIndex="employeeId" key="employeeId" sorter={(a, b) => a.employeeId.localeCompare(b.employeeId)} />
        <Column title="Employee Name" dataIndex="employeeName" key="employeeName" sorter={(a, b) => a.employeeName.localeCompare(b.employeeName)} />
        <Column title="Branch" dataIndex="branch" key="branch" sorter={(a, b) => a.branch.localeCompare(b.branch)} />
        <Column title="Gross Pay" dataIndex="grossPay" key="grossPay" sorter={(a, b) => a.grossPay - b.grossPay} />
        <Column title="Allowances" dataIndex="allowances" key="allowances" sorter={(a, b) => a.allowances - b.allowances} />
        <Column title="Deductions (Late)" dataIndex={['deductions', 'late']} key="deductionsLate" sorter={(a, b) => a.deductions.late - b.deductions.late} />
        <Column title="Deductions (Philhealth)" dataIndex={['deductions', 'philhealth']} key="deductionsPhilhealth" sorter={(a, b) => a.deductions.philhealth - b.deductions.philhealth} />
        <Column title="Deductions (SSS)" dataIndex={['deductions', 'sss']} key="deductionsSSS" sorter={(a, b) => a.deductions.sss - b.deductions.sss} />
        <Column title="Deductions (Pag-Ibig)" dataIndex={['deductions', 'pagIbig']} key="deductionsPagIbig" sorter={(a, b) => a.deductions.pagIbig - b.deductions.pagIbig} />
        <Column title="Cash Advance" dataIndex="cashAdvance" key="cashAdvance" sorter={(a, b) => a.cashAdvance - b.cashAdvance} />
        <Column title="Net Pay" dataIndex="netPay" key="netPay" sorter={(a, b) => a.netPay - b.netPay} />
      </Table>
    </>
  );
};

export default PayrollTable;