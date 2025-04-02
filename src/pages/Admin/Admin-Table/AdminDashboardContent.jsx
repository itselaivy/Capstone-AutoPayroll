// Import React and its hooks for state, effects, and refs
import React, { useState, useEffect, useRef } from 'react';
// Import Ant Design components for UI elements like cards, rows, stats, etc.
import { Card, Row, Col, Statistic, Typography, Space, Button, message, Spin, Table, Select, Empty } from 'antd';
// Import specific icons from Ant Design for use in the UI
import { TeamOutlined, RightOutlined, ReloadOutlined, WarningOutlined, SettingOutlined, WalletOutlined, UserOutlined } from '@ant-design/icons';
// Import useNavigate hook from React Router for navigation
import { useNavigate } from 'react-router-dom';
// Import CountUp for animated number counting in statistics
import CountUp from 'react-countup';
// Import Recharts components for rendering line charts
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
// Import custom CSS file for additional styling
import './AdminTable.css';

// Destructure Typography to get Title and Text components for easier use
const { Title, Text } = Typography;
// Destructure Table to get Column for defining table columns
const { Column } = Table;
// Destructure Select to get Option for dropdown items
const { Option } = Select;

// Define the main functional component for the admin dashboard
const AdminDashboardContent = () => {
  // State to hold dashboard statistics (users, admins, etc.), initialized with zeros
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,      // Total number of users
    systemAdmins: 0,    // Number of system administrators
    payrollAdmins: 0,   // Number of payroll administrators
    payrollStaff: 0,    // Number of payroll staff
  });
  // State to hold the latest activity logs, initialized as an empty array
  const [latestLogs, setLatestLogs] = useState([]);
  // State to hold activity trend data for the chart, initialized as an empty array
  const [activityTrend, setActivityTrend] = useState([]);
  // State to filter logs by activity type, initialized as an empty string
  const [filterType, setFilterType] = useState('');
  // State to filter logs by username, initialized as an empty string
  const [filterUsername, setFilterUsername] = useState('');
  // State to track the last refresh time, initialized as null
  const [lastRefresh, setLastRefresh] = useState(null);
  // State to indicate if data is loading, initialized as false
  const [loading, setLoading] = useState(false);
  // State to hold error messages, initialized as null
  const [error, setError] = useState(null);
  // Ref to reference the table DOM element for potential manipulation
  const tableRef = useRef(null);
  // Ref to reference the chart container DOM element for dynamic sizing
  const chartContainerRef = useRef(null);

  // Define the base URL for API calls to fetch data
  const API_BASE_URL = "http://localhost/AdminTableDB/AdminDB";
  // Hook to enable navigation functionality within the component
  const navigate = useNavigate();

  // Async function to fetch dashboard statistics from the server
  const fetchDashboardStats = async () => {
    try {
      // Fetch stats data from the API with no caching
      const res = await fetch(`${API_BASE_URL}/fetch_dashboardcontent.php?type=stats`, { cache: 'no-store' });
      // Check if the response is not OK, throw an error if so
      if (!res.ok) throw new Error(`Stats fetch failed: ${res.statusText}`);
      // Parse the response as JSON
      const data = await res.json();
      // Log the fetched data to the console for debugging
      console.log("Stats Data:", data);
      // Update the dashboardStats state with fetched values, defaulting to 0 if undefined
      setDashboardStats({
        totalUsers: data.totalUsers || data.users || 0,  // Use totalUsers or users field
        systemAdmins: data.systemAdmins || 0,            // System admins count
        payrollAdmins: data.payrollAdmins || 0,          // Payroll admins count
        payrollStaff: data.payrollStaff || 0,            // Payroll staff count
      });
      // Clear any existing error message on successful fetch
      setError(null);
    } catch (err) {
      // Log the error to the console for debugging
      console.error("Fetch Stats Error:", err.message);
      // Set an error message in state
      setError("Failed to fetch dashboard stats");
      // Display an error notification to the user
      message.error("Error fetching stats");
    }
  };

  // Async function to fetch the latest activity logs from the server
  const fetchLatestLogs = async () => {
    try {
      // Get today's date in YYYY-MM-DD format for the API query
      const today = new Date().toISOString().split('T')[0];
      // Fetch logs for today, page 1, 10 items, with no caching
      const res = await fetch(`${API_BASE_URL}/fetch_user_activity.php?date=${today}&page=1&pageSize=10`, { cache: 'no-store' });
      // Check if the response is not OK, throw an error if so
      if (!res.ok) throw new Error(`Logs fetch failed: ${res.statusText}`);
      // Parse the response as JSON
      const data = await res.json();
      // Log the fetched data to the console for debugging
      console.log("Logs Data:", data);
      // Validate that the data has a success flag and logs array, throw error if not
      if (!data.success || !Array.isArray(data.logs)) throw new Error('Invalid logs data format');
      // Format the logs by adding a key and cleaning up activity descriptions
      const formattedLogs = data.logs.map((log, index) => ({
        ...log,  // Spread existing log properties
        key: log.key || log.id || index,  // Use existing key, id, or index as fallback
        activity_description: typeof log.activity_description === 'string'  // Check if description is a string
          ? log.activity_description.replace(/\|/g, ' | ')  // Replace pipes with spaced pipes
          : log.activity_description || 'N/A',  // Use description or 'N/A' if undefined
      }));
      // Update the latestLogs state with formatted logs
      setLatestLogs(formattedLogs);
      // Clear any existing error message on successful fetch
      setError(null);
    } catch (err) {
      // Log the error to the console for debugging
      console.error("Fetch Logs Error:", err.message);
      // Set an error message in state
      setError("Failed to fetch activity logs");
      // Display an error notification to the user
      message.error("Error fetching logs");
    }
  };

  // Async function to fetch activity trend data for the chart
  const fetchActivityTrend = async () => {
    try {
      // Fetch trend data for the last 7 days with no caching
      const res = await fetch(`${API_BASE_URL}/fetch_activity_trend.php?days=7`, { cache: 'no-store' });
      // Check if the response is not OK, throw an error with detailed message
      if (!res.ok) {
        const errorText = await res.text();  // Get error text from response
        throw new Error(`Trend fetch failed: ${res.status} - ${errorText}`);
      }
      // Parse the response as JSON
      const data = await res.json();
      // Log the fetched data to the console for debugging
      console.log("Trend Data:", data);
      // Validate that the data is an array, throw error if not
      if (!Array.isArray(data)) throw new Error('Trend data is not an array');
      // Format the trend data with date and count properties
      setActivityTrend(data.map(item => ({
        date: item.date,  // Date of the activity
        count: parseInt(item.count, 10) || 0,  // Parse count as integer, default to 0
      })));
      // Clear any existing error message on successful fetch
      setError(null);
    } catch (err) {
      // Log the error to the console for debugging
      console.error("Fetch Trend Error:", err.message);
      // Set an error message in state
      setError("Failed to fetch activity trend - check server logs");
      // Reset activityTrend to empty array on error
      setActivityTrend([]);
      // Display an error notification to the user
      message.error("Error fetching trend data");
    }
  };

  // Function to handle refreshing all dashboard data
  const handleRefresh = () => {
    // Set loading state to true to show spinner
    setLoading(true);
    // Fetch all data concurrently using Promise.all
    Promise.all([fetchDashboardStats(), fetchLatestLogs(), fetchActivityTrend()])
      .then(() => {
        // Update lastRefresh with current time in 12-hour format
        setLastRefresh(new Date().toLocaleTimeString('en-US', { hour12: true }));
        // Display success notification to the user
        message.success("Dashboard refreshed");
      })
      .catch(() => message.error("Failed to refresh dashboard"))  // Show error if any fetch fails
      .finally(() => setLoading(false));  // Set loading to false when done
  };

  // useEffect hook to trigger initial data fetch on component mount
  useEffect(() => {
    handleRefresh();  // Call refresh function to load data
  }, []);  // Empty dependency array means it runs once on mount

  // Filter logs based on selected activity type and username
  const filteredLogs = latestLogs.filter(log =>
    (!filterType || log.activity_type === filterType) &&  // Filter by type if set
    (!filterUsername || log.Username === filterUsername)  // Filter by username if set
  );

  // Define styles for icons in cards
  const iconStyles = {
    position: 'absolute',  // Position icon absolutely within card
    top: 10,              // 10px from the top
    right: 10,            // 10px from the right
    fontSize: 60,         // Icon size in pixels
    opacity: 0.1,         // Faint opacity for background effect
    color: '#fff',        // White color for icon
  };

  // Function to format timestamps into readable date-time strings
  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';  // Return 'N/A' if timestamp is empty
    const date = new Date(timestamp);  // Create Date object from timestamp
    return isNaN(date.getTime()) ? timestamp : date.toLocaleString('en-US', {  // Check if valid date
      year: 'numeric',    // Show full year
      month: 'short',     // Short month name (e.g., "Jan")
      day: 'numeric',     // Day of the month
      hour: 'numeric',    // Hour in 12-hour format
      minute: '2-digit',  // Two-digit minute
      second: '2-digit',  // Two-digit second
      hour12: true,       // Use 12-hour clock with AM/PM
    });
  };

  // Custom table components to apply Poppins font to headers and cells
  const tableComponents = {
    header: {
      cell: (props) => <th {...props} style={{ ...props.style, fontFamily: 'Poppins, sans-serif' }} />,  // Apply font to header cells
    },
    body: {
      cell: (props) => <td {...props} style={{ ...props.style, fontFamily: 'Poppins, sans-serif' }} />,  // Apply font to body cells
    },
  };

  // State to manage chart size, initialized with default width and height
  const [chartSize, setChartSize] = useState({ width: 600, height: 320 });
  // useEffect hook to dynamically update chart size based on container width
  useEffect(() => {
    // Function to calculate and set chart size
    const updateChartSize = () => {
      if (chartContainerRef.current) {  // Check if chart container ref exists
        const containerWidth = chartContainerRef.current.offsetWidth - 32;  // Get width minus padding
        setChartSize({
          width: containerWidth > 0 ? containerWidth : 300,  // Use calculated width or 300px min
          height: 320,  // Fixed height
        });
      }
    };
    updateChartSize();  // Run on mount
    window.addEventListener('resize', updateChartSize);  // Add resize listener
    return () => window.removeEventListener('resize', updateChartSize);  // Cleanup listener on unmount
  }, []);  // Empty dependency array means it runs once on mount

  // Render the dashboard UI
  return (
    // Main container div with fade-in animation and Poppins font
    <div className="dashboard-container fade-in" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={2} className="dashboard-title" style={{ marginBottom: 0, fontFamily: 'Poppins, sans-serif' }}>Admin Dashboard</Title>
        <Space>
          {lastRefresh && <Text type="secondary">Last refreshed: {lastRefresh}</Text>}
          <Button
            className="refresh-button"  // Custom class for styling
            icon={<ReloadOutlined />}   // Reload icon
            onClick={handleRefresh}     // Trigger refresh function on click
            loading={loading}           // Show loading spinner if true
            style={{ backgroundColor: '#001569', borderColor: '#001569', color: '#fff' }}  // Custom colors
          >
            Refresh  
          </Button>
        </Space>
      </Space>
      {loading && <Spin tip="Loading data..." style={{ display: 'block', textAlign: 'center', margin: '20px 0' }} />}
      {error && <Text type="danger" style={{ display: 'block', textAlign: 'center', margin: '20px 0' }}>{error}</Text>}

      {/* Overview Section */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #055DAF 0%, #054a8f 100%)' }}>
            <div className="card-content">
              <TeamOutlined style={iconStyles} />
              <Statistic
                title={<Space>Total Users {dashboardStats.totalUsers > 100 && <WarningOutlined style={{ color: '#ff4d4f' }} />}</Space>}  // Title with warning if over 100
                value={dashboardStats.totalUsers}  // Value from state
                formatter={() => <CountUp end={dashboardStats.totalUsers} duration={2} />}  // Animate the number
                valueStyle={{ color: '#fff', fontSize: '40px', fontWeight: 700 }}  // Style for the value
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '18px', fontWeight: 500 }}  // Style for the title
              />
              <Button className="card-footer-btn" onClick={() => navigate('/admin/adminuseraccount')}>
                More Info <RightOutlined /> 
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #BD0084 0%, #9d006b 100%)' }}>
            <div className="card-content">
              <SettingOutlined style={iconStyles} />
              <Statistic
                title={<Space>System Administrator {dashboardStats.systemAdmins > 10 && <WarningOutlined style={{ color: '#ff4d4f' }} />}</Space>}  // Title with warning if over 10
                value={dashboardStats.systemAdmins}
                formatter={() => <CountUp end={dashboardStats.systemAdmins} duration={2} />}
                valueStyle={{ color: '#fff', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/admin/adminuseraccount?role=system')}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #C94D00 0%, #a63f00 100%)' }}>
            <div className="card-content">
              <WalletOutlined style={iconStyles} /> 
              <Statistic
                title={<Space>Payroll Admin {dashboardStats.payrollAdmins > 10 && <WarningOutlined style={{ color: '#ff4d4f' }} />}</Space>}  // Title with warning if over 10
                value={dashboardStats.payrollAdmins}
                formatter={() => <CountUp end={dashboardStats.payrollAdmins} duration={2} />}
                valueStyle={{ color: '#fff', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/admin/adminuseraccount?role=payroll_admin')}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="modern-card" style={{ background: 'linear-gradient(135deg, #A90000 0%, #870000 100%)' }}>
            <div className="card-content">
              <UserOutlined style={iconStyles} />
              <Statistic
                title={<Space>Payroll Staff {dashboardStats.payrollStaff > 50 && <WarningOutlined style={{ color: '#ff4d4f' }} />}</Space>}  // Title with warning if over 50
                value={dashboardStats.payrollStaff}
                formatter={() => <CountUp end={dashboardStats.payrollStaff} duration={2} />}
                valueStyle={{ color: '#fff', fontSize: '40px', fontWeight: 700 }}
                titleStyle={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '18px', fontWeight: 500 }}
              />
              <Button className="card-footer-btn" onClick={() => navigate('/admin/adminuseraccount?role=payroll_staff')}>
                More Info <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Mini Activity Trend Chart */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card className="attendance-widget">
            <div className="activity-trend-header" style={{ backgroundColor: 'transparent', padding: '16px 16px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={3} style={{ color: '#000', margin: 0, marginBottom: 15 }}>Activity Trend (Last 7 Days)</Title>
            </div>
            <div ref={chartContainerRef} style={{ padding: '16px' }}>
              {activityTrend.length > 0 ? (
                // Line chart with dynamic width and height
                <LineChart width={chartSize.width} height={chartSize.height} data={activityTrend}>
                  <XAxis dataKey="date" tick={{ fontFamily: 'Poppins, sans-serif' }} />
                  <YAxis tick={{ fontFamily: 'Poppins, sans-serif' }} />
                  <Tooltip labelStyle={{ fontFamily: 'Poppins, sans-serif' }} itemStyle={{ fontFamily: 'Poppins, sans-serif' }} />
                  <Line type="monotone" dataKey="count" stroke="#1A3C6D" />
                </LineChart>
              ) : (
                // Text if no trend data is available
                <Text style={{ display: 'block', textAlign: 'center' }}>No trend data available</Text>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Activity Logs Section */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card className="attendance-widget" style={{ height: 'auto', minHeight: '200px' }}>
            <div className="activity-logs-header" style={{ backgroundColor: '#002046', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={3} style={{ color: '#000', margin: 0 }}>Latest Activity Logs (Today)</Title>
              <Button
                className="view-logs-button"  // Custom class for styling
                type="link"                   // Link-style button
                onClick={() => navigate('/admin/adminuseractivity')}  // Navigate to activity page
                style={{ backgroundColor: '#001569', borderColor: '#001569', color: '#ffffff' }}  // Custom colors
              >
                View All Logs <RightOutlined style={{ color: '#ffffff' }} />  
              </Button>
            </div>
            <Space style={{ marginLeft: 15, margin: '16px 0', flexWrap: 'wrap' }}>
              <Select
                style={{ width: 200, marginBottom: 8 }}  // Fixed width and margin
                placeholder="Filter by Activity Type"    // Placeholder text
                onChange={setFilterType}                 // Update filterType state on change
                allowClear                               // Allow clearing the selection
              >
                {Array.from(new Set(latestLogs.map(log => log.activity_type))).map(type => (
                  <Option key={type} value={type}>{type}</Option>  // Option for each type
                ))}
              </Select>
              <Select
                style={{ width: 200, marginBottom: 8 }}
                placeholder="Filter by Username"
                onChange={setFilterUsername}
                allowClear
              >
                {Array.from(new Set(latestLogs.map(log => log.Username))).map(username => (
                  <Option key={username} value={username}>{username}</Option>
                ))}
              </Select>
            </Space>
            <div style={{ padding: '16px' }}>
              {filteredLogs.length > 0 ? (
                // Table to display filtered logs
                <Table
                  ref={tableRef}              // Reference to table DOM element
                  dataSource={filteredLogs}   // Data for the table
                  rowKey="key"                // Unique key for each row
                  bordered                    // Add borders to table
                  components={tableComponents}  // Custom components for font
                  pagination={false}          // Disable pagination
                  style={{ width: '100%' }}   // Full width table
                >
                  <Column title="User ID" dataIndex="user_id" key="user_id" width={100} />
                  <Column title="Username" dataIndex="Username" key="Username" width={150} />
                  <Column title="Activity Type" dataIndex="activity_type" key="activity_type" width={150} />
                  <Column title="Affected Table" dataIndex="affected_table" key="affected_table" width={150} />
                  <Column title="Affected Record ID" dataIndex="affected_record_id" key="affected_record_id" width={150} />
                  <Column title="Description" dataIndex="activity_description" key="activity_description" ellipsis />
                  <Column
                    title="Created At"
                    dataIndex="created_at"
                    key="created_at"
                    width={200}
                    render={(timestamp) => <span>{formatDateTime(timestamp)}</span>}  // Render formatted date
                  />
                </Table>
              ) : (
                // Empty component if no logs are available
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}  // Simple empty image
                  description={<span>No recent activity logs available for today</span>}  // Custom message
                />
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// Export the component as the default export
export default AdminDashboardContent;