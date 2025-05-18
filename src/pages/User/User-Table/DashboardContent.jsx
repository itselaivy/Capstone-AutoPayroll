import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Select, Space, Button, message, Spin, Modal } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { ShopOutlined, TeamOutlined, ClockCircleOutlined, WarningOutlined, RightOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import CountUp from 'react-countup';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DashboardDesign.css';

const { Title, Text } = Typography;
const { Option } = Select;

const Dashboard = () => {
  const [dashboardStats, setDashboardStats] = useState({
    branches: 0,
    employees: 0,
    onTimeToday: 0,
    lateToday: 0,
  });
  const [monthlyAttendance, setMonthlyAttendance] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [sortOrder, setSortOrder] = useState('asc');
  const [modalData, setModalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const role = localStorage.getItem('role');
  const userId = localStorage.getItem('userId');
  const navigate = useNavigate();

  const logActivity = async (activityData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/log_activity.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activityData),
      });
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Activity logging failed');
      }
    } catch (err) {
      console.error('Log Activity Error:', {
        message: err.message,
        name: err.name,
        stack: err.stack,
      });
      if (err.message.includes('Failed to fetch')) {
        message.warning('Failed to log activity due to network or CORS issue');
      } else {
        message.warning('Failed to log activity');
      }
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([
      fetchDashboardStats(),
      fetchBranches(),
      fetchMonthlyAttendance(),
      fetchTrends(),
    ])
      .then(() => {
        setLastRefresh(new Date().toLocaleTimeString('en-US', { hour12: true }));
        message.success("Dashboard refreshed");
      })
      .catch((err) => {
        console.error("Refresh Error:", err);
        message.error("Failed to refresh dashboard");
      })
      .finally(() => setLoading(false));
  };

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/fetch_dashboard_stats.php?user_id=${userId}&role=${encodeURIComponent(role)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Stats fetch failed: ${res.statusText}`);
      const data = await res.json();
      setDashboardStats({
        branches: data.branches || 0,
        employees: data.employees || 0,
        onTimeToday: data.onTimeToday || 0,
        lateToday: data.lateToday || 0,
      });
      setError(null);
    } catch (err) {
      console.error("Fetch Stats Error:", err.message);
      setError("Failed to fetch dashboard stats");
      message.error("Error fetching stats");
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/fetch_branches.php?user_id=${userId}&role=${encodeURIComponent(role)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Branches fetch failed: ${res.statusText}`);
      const response = await res.json();
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.error || 'Invalid branches data format');
      }
      const formattedBranches = response.data.map(branch => ({
        BranchID: branch.BranchID,
        BranchName: branch.BranchName || 'Unknown Branch',
      })).filter(branch => branch.BranchID != null);
      setBranches(formattedBranches);
      setError(null);
    } catch (err) {
      console.error("Fetch Branches Error:", err.message);
      setError("Failed to fetch branches");
      message.error("Error fetching branches");
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyAttendance = async () => {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/fetch_attendance.php`);
      url.searchParams.append('year', selectedYear);
      if (selectedMonth !== 'all') {
        url.searchParams.append('month', selectedMonth);
      }
      if (selectedBranch !== 'all') {
        url.searchParams.append('branch', selectedBranch);
      }
      url.searchParams.append('user_id', userId);
      url.searchParams.append('role', encodeURIComponent(role));

      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`Attendance fetch failed: ${res.statusText}`);
      const data = await res.json();
      console.log('Monthly Attendance Response:', data);

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from server: expected array');
      }

      const attendance = data.map(item => ({
        date: item.date || 'Unknown',
        onTime: Number(item.onTime) || 0,
        late: Number(item.late) || 0,
      }));

      attendance.sort((a, b) =>
        sortOrder === 'asc'
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date)
      );

      setMonthlyAttendance(attendance);
      setError(null);
    } catch (err) {
      console.error("Fetch Attendance Error:", err.message);
      setError(`Failed to fetch attendance data: ${err.message}`);
      message.error("Error fetching attendance data");
      setMonthlyAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/fetch_trends.php?year=${selectedYear}&branch=${selectedBranch}&user_id=${userId}&role=${encodeURIComponent(role)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Trends fetch failed: ${res.statusText}`);
      const data = await res.json();
      setTrendData((data || []).map(item => ({
        month: item.month || '',
        onTime: item.onTime || 0,
        late: item.late || 0,
      })));
      setError(null);
    } catch (err) {
      console.error("Fetch Trends Error:", err.message);
      setError("Failed to fetch trend data");
      message.error("Error fetching trends");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (date) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/details.php?date=${date}&branch=${selectedBranch}&user_id=${userId}&role=${encodeURIComponent(role)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Details fetch failed: ${res.statusText}`);
      const data = await res.json();
      setModalData(data || { date, employees: [] });
    } catch (err) {
      console.error("Fetch Details Error:", err.message);
      message.error("Error fetching details");
      setModalData({ date, employees: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, [selectedYear, selectedMonth, selectedBranch, sortOrder]);

  const iconStyles = {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 60,
    opacity: 0.1,
    color: '#fff',
  };

  const pieData = [
    { name: 'On-Time', value: dashboardStats.onTimeToday },
    { name: 'Late', value: dashboardStats.lateToday },
  ];

  const COLORS = ['#52c41a', '#ff4d4f'];

  const downloadAttendancePDF = () => {
    if (monthlyAttendance.length === 0) {
      message.warning("No attendance data available to download");
      return;
    }
    try {
      const doc = new jsPDF();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.text('Attendance Report', 14, 20);
      doc.setFontSize(12);
      doc.text(`Period: ${selectedMonth === 'all' ? 'All Months' : new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`, 14, 30);
      doc.text(`Branch: ${selectedBranch === 'all' ? 'All Branches' : branches.find(b => b.BranchID === parseInt(selectedBranch))?.BranchName || 'Unknown'}`, 14, 40);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 50);

      autoTable(doc, {
        startY: 60,
        head: [['Date', 'On-Time', 'Late']],
        body: monthlyAttendance.map(item => [item.date, item.onTime, item.late]),
        theme: 'striped',
        headStyles: { fillColor: '#1A3C6D', textColor: '#fff' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 } },
      });

      const totalOnTime = monthlyAttendance.reduce((sum, item) => sum + item.onTime, 0);
      const totalLate = monthlyAttendance.reduce((sum, item) => sum + item.late, 0);
      doc.text(`Total On-Time: ${totalOnTime} | Total Late: ${totalLate}`, 14, doc.lastAutoTable.finalY + 10);

      doc.save(`Attendance_${selectedMonth === 'all' ? 'Yearly' : selectedMonth}_${selectedYear}.pdf`);

      if (!userId) {
        console.error('User ID is missing; cannot log activity');
        message.warning('Activity logging skipped due to missing user ID');
      } else {
        const branchName = selectedBranch === 'all' ? 'All Branches' : branches.find(b => b.BranchID === parseInt(selectedBranch))?.BranchName || 'Unknown';
        logActivity({
          user_id: parseInt(userId), // Ensure user_id is an integer
          activity_type: 'GENERATE_DATA',
          affected_table: 'Attendance',
          affected_record_id: null,
          activity_description: `Generated Attendance Report for ${selectedMonth === 'all' ? 'All Months' : new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear} for ${branchName}`,
        });
      }

      message.success("PDF generated successfully");
    } catch (err) {
      console.error("PDF Generation Error:", err);
      message.error("Failed to generate PDF");
    }
  };

  const handleBarClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const date = data.activePayload[0].payload.date;
      fetchDetails(date);
    }
  };

  return (
    <div className="dashboard-container fade-in" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} className="dashboard-title" style={{ fontFamily: 'Poppins, sans-serif', margin: 0 }}>
          Dashboard
        </Title>
        <Space>
          {lastRefresh && (
            <Text type="secondary" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Last refreshed: {lastRefresh}
            </Text>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
            style={{
              backgroundColor: '#001569',
              borderColor: '#001569',
              color: '#fff',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            Refresh
          </Button>
        </Space>
      </div>
      {loading && <Spin tip="Loading data..." style={{ display: 'block', textAlign: 'center', margin: '20px 0', fontFamily: 'Poppins, sans-serif' }} />}
      {error && <Text type="danger" style={{ display: 'block', textAlign: 'center', margin: '20px 0', fontFamily: 'Poppins, sans-serif' }}>{error}</Text>}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #055DAF 0%, #054a8f 100%)' }}>
            <div className="card-content">
              <ShopOutlined style={iconStyles} />
              <Statistic
                title="Branches"
                value={dashboardStats.branches}
                formatter={() => <CountUp end={dashboardStats.branches} duration={2} />}
                valueStyle={{ color: '#fff', fontFamily: 'Poppins, sans-serif', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/user/branches')} style={{ fontFamily: 'Poppins, sans-serif' }}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #BD0084 0%, #9d006b 100%)' }}>
            <div className="card-content">
              <TeamOutlined style={iconStyles} />
              <Statistic
                title="Employees"
                value={dashboardStats.employees}
                formatter={() => <CountUp end={dashboardStats.employees} duration={2} />}
                valueStyle={{ color: '#fff', fontFamily: 'Poppins, sans-serif', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/user/employees')} style={{ fontFamily: 'Poppins, sans-serif' }}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #C94D00 0%, #a63f00 100%)' }}>
            <div className="card-content">
              <ClockCircleOutlined style={iconStyles} />
              <Statistic
                title="On-Time Today"
                value={dashboardStats.onTimeToday}
                formatter={() => <CountUp end={dashboardStats.onTimeToday} duration={2} />}
                valueStyle={{ color: '#fff', fontFamily: 'Poppins, sans-serif', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/user/attendance')} style={{ fontFamily: 'Poppins, sans-serif' }}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #A90000 0%, #870000 100%)' }}>
            <div className="card-content">
              <WarningOutlined style={iconStyles} />
              <Statistic
                title="Late Today"
                value={dashboardStats.lateToday}
                formatter={() => <CountUp end={dashboardStats.lateToday} duration={2} />}
                valueStyle={{ color: '#fff', fontFamily: 'Poppins, sans-serif', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/user/attendance')} style={{ fontFamily: 'Poppins, sans-serif' }}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card className="attendance-widget full-width">
            <div className="widget-header" style={{ backgroundColor: '#1A3C6D' }}>
              <Title level={3} className="widget-title" style={{ fontFamily: 'Poppins, sans-serif', color: '#fff' }}>
                Yearly Attendance Trends ({selectedYear})
              </Title>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#6B7280" fontSize={12} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <YAxis stroke="#6B7280" fontSize={12} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <Tooltip contentStyle={{ fontFamily: 'Poppins, sans-serif', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }} />
                <Legend wrapperStyle={{ fontFamily: 'Poppins, sans-serif' }} />
                <Line type="monotone" dataKey="onTime" stroke="#52c41a" name="On-Time" />
                <Line type="monotone" dataKey="late" stroke="#ff4d4f" name="Late" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card className="monthly-attendance-widget">
            <div className="monthly-widget-header" style={{ backgroundColor: '#1A3C6D' }}>
              <Title level={3} className="widget-title" style={{ fontFamily: 'Poppins, sans-serif', color: '#fff' }}>
                {selectedMonth === 'all' ? 'Yearly' : 'Monthly'} Attendance Overview
              </Title>
              <Space>
                <Select
                  value={selectedYear}
                  onChange={setSelectedYear}
                  style={{ width: 100, fontFamily: 'Poppins, sans-serif' }}
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return <Option key={year} value={year}>{year}</Option>;
                  })}
                </Select>
                <Select
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  style={{ width: 120, fontFamily: 'Poppins, sans-serif' }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <Option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('default', { month: 'long' })}
                    </Option>
                  ))}
                </Select>
                <Select
                  value={selectedBranch}
                  onChange={(value) => {
                    setSelectedBranch(value);
                  }}
                  style={{ width: 150, fontFamily: 'Poppins, sans-serif' }}
                  placeholder="Select Branch"
                >
                  <Option value="all">All Branches</Option>
                  {branches.map(branch => (
                    <Option key={branch.BranchID} value={String(branch.BranchID)}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
                <Select
                  value={sortOrder}
                  onChange={setSortOrder}
                  style={{ width: 100, fontFamily: 'Poppins, sans-serif' }}
                >
                  <Option value="asc">Date Asc</Option>
                  <Option value="desc">Date Desc</Option>
                </Select>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={downloadAttendancePDF}
                  loading={loading}
                  style={{
                    backgroundColor: '#2C3743',
                    borderColor: '#2C3743',
                    color: '#fff',
                    fontFamily: 'Poppins, sans-serif',
                  }}
                >
                  Download
                </Button>
              </Space>
            </div>
            <ResponsiveContainer width="100%" height={350} style={{ marginTop: 30 }}>
              <BarChart
                data={monthlyAttendance}
                margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                onClick={handleBarClick}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={12} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <YAxis stroke="#6B7280" fontSize={12} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <Tooltip contentStyle={{ fontFamily: 'Poppins, sans-serif', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }} />
                <Legend wrapperStyle={{ fontFamily: 'Poppins, sans-serif' }} />
                <Bar dataKey="onTime" fill="#52c41a" name="On-Time" barSize={30} radius={[4, 4, 0, 0]} />
                <Bar dataKey="late" fill="#ff4d4f" name="Late" barSize={30} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="monthly-attendance-widget">
            <div className="monthly-widget-header" style={{ backgroundColor: '#1A3C6D' }}>
              <Title level={3} className="widget-title" style={{ fontFamily: 'Poppins, sans-serif', color: '#fff' }}>
                Today's Attendance Summary
              </Title>
            </div>
            <ResponsiveContainer width="100%" height={350} style={{ marginTop: 30 }}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={{ fontFamily: 'Poppins, sans-serif' }}>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: 'Poppins, sans-serif' }} />
                <Legend wrapperStyle={{ fontFamily: 'Poppins, sans-serif' }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Modal
        title={<span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>{`Attendance Details: ${modalData?.date || ''}`}</span>}
        open={!!modalData}
        onCancel={() => setModalData(null)}
        footer={null}
        centered
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
      >
        {modalData && modalData.employees ? (
          <ul style={{ fontFamily: 'Poppins, sans-serif', listStyleType: 'none', padding: 0 }}>
            {modalData.employees.map((e, index) => (
              <li key={index} style={{ marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
                {e.name || 'Unknown'} - <Text style={{ fontFamily: 'Poppins, sans-serif' }}>{e.status || 'N/A'}</Text>
              </li>
            ))}
          </ul>
        ) : (
          <Spin tip="Loading details..." style={{ display: 'block', textAlign: 'center', fontFamily: 'Poppins, sans-serif' }} />
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;