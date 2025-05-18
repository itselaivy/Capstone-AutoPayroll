// Import React hooks for managing state and side effects
import { useState, useEffect } from 'react';
// Import hook for detecting navigation changes
import { useLocation } from 'react-router-dom';
// Import Ant Design components for UI construction
import { Table, Typography, Spin, Empty, Alert, Input, Select, DatePicker, Space, ConfigProvider, message } from 'antd';
// Import search icon from Ant Design icons
import { SearchOutlined } from '@ant-design/icons';
// Import custom CSS file for styling
import './AdminTable.css';

// Destructure specific Ant Design components for easier use
const { Title } = Typography; // Component for styled headings
const { Column } = Table; // Component for defining table columns
const { Option } = Select; // Component for dropdown options

// Define the functional component for displaying user activity logs
const UserActivityLogsTable = () => {
  // State to store the list of activity logs
  const [logs, setLogs] = useState([]);
  // State to indicate if data is currently being fetched
  const [loading, setLoading] = useState(false);
  // State to store any error messages from data fetching
  const [error, setError] = useState(null);
  // State to manage pagination settings
  const [pagination, setPagination] = useState({
    current: 1, // Current page number
    pageSize: 10, // Number of items per page
    total: 0, // Total number of items
  });
  // State to store the search text entered by the user
  const [searchText, setSearchText] = useState('');
  // State to store the selected activity type filter
  const [activityTypeFilter, setActivityTypeFilter] = useState(null);
  // State to store the selected date filter
  const [dateFilter, setDateFilter] = useState(null);
  // State to control whether the fade-in animation should trigger
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  // Hook to access the current location for navigation detection
  const location = useLocation();

  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  // Async function to fetch activity logs from the server
  const fetchLogs = async (page = 1, pageSize = 10, filters = {}) => {
    // Set loading state to true to show a loading indicator
    setLoading(true);
    // Clear any previous error messages
    setError(null);
    try {
      if (!userId || !role) {
        message.error('Please log in to continue');
        return;
      }

      // Construct query parameters for the API request
      const queryParams = new URLSearchParams({
        page, // Current page number
        pageSize, // Items per page
        ...(filters.searchText && { search: filters.searchText }), // Include search text if provided
        ...(filters.activityType && { activityType: filters.activityType }), // Include activity type filter if set
        ...(filters.date && { date: filters.date.format('YYYY-MM-DD') }), // Include date filter if set
      }).toString();

      // Fetch data from the server using the constructed URL
      const response = await fetch(
        `http://localhost/AdminTableDB/AdminDB/fetch_user_activity.php?${queryParams}`
      );
      // Check if the response indicates a failure
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Parse the response data as JSON
      const data = await response.json();
      // Log the fetched data for debugging
      console.log('Fetched User Activity Logs:', data);

      // Validate the response format and throw an error if invalid
      if (!data.success || !Array.isArray(data.logs)) {
        throw new Error('Invalid data format from server: ' + JSON.stringify(data));
      }

      // Format the activity_description to include spaces around the pipe separator
      const formattedLogs = data.logs.map(log => ({
        ...log,
        activity_description: typeof log.activity_description === 'string' 
          ? log.activity_description.replace(/\|/g, ' | ') 
          : log.activity_description || 'N/A', // Fallback if not a string
      }));

      // Update the logs state with the formatted data
      setLogs(formattedLogs);
      // Update pagination settings based on the response
      setPagination({
        current: page, // Set current page
        pageSize: pageSize, // Set page size
        total: data.total, // Set total number of items
      });
    } catch (err) {
      // Log any errors that occur during fetching
      console.error('Error fetching user activity logs:', err);
      // Set the error state with the error message
      setError(err.message);
    } finally {
      // Set loading state to false after fetching completes
      setLoading(false);
    }
  };

  // Effect hook to handle initial load and navigation-triggered fade-in
  useEffect(() => {
    // Trigger fade-in animation on component mount or navigation
    setShouldFadeIn(true);
    // Fetch logs with current filters and pagination
    fetchLogs(pagination.current, pagination.pageSize, {
      searchText, // Include current search text
      activityType: activityTypeFilter, // Include current activity type Chinese filter
      date: dateFilter, // Include current date filter
    });

    // Reset fade-in state after animation duration to prevent re-triggering
    const timer = setTimeout(() => setShouldFadeIn(false), 300);
    // Cleanup function to clear the timeout on unmount or re-run
    return () => clearTimeout(timer);
  }, [location.pathname]); // Re-run when the URL path changes

  // Effect hook to fetch logs when filters change, without fade-in
  useEffect(() => {
    // Skip fetch if this is the initial load (handled by navigation effect)
    if (!shouldFadeIn) {
      // Fetch logs with updated filters and current pagination
      fetchLogs(pagination.current, pagination.pageSize, {
        searchText, // Include current search text
        activityType: activityTypeFilter, // Include current activity type filter
        date: dateFilter, // Include current date filter
      });
    }
  }, [searchText, activityTypeFilter, dateFilter]); // Re-run when filters change

  // Function to handle pagination changes from the table
  const handleTableChange = (paginationConfig) => {
    // Fetch logs with new pagination settings and current filters
    fetchLogs(paginationConfig.current, paginationConfig.pageSize, {
      searchText, // Include current search text
      activityType: activityTypeFilter, // Include current activity type filter
      date: dateFilter, // Include current date filter
    });
  };

  // Function to update search text and reset pagination
  const handleSearch = (value) => {
    // Update the search text state
    setSearchText(value);
    // Reset pagination to the first page
    setPagination({ ...pagination, current: 1 });
  };

  // Function to update activity type filter and reset pagination
  const handleActivityTypeChange = (value) => {
    // Update the activity type filter state
    setActivityTypeFilter(value);
    // Reset pagination to the first page
    setPagination({ ...pagination, current: 1 });
  };

  // Function to update date filter and reset pagination
  const handleDateChange = (date) => {
    // Update the date filter state
    setDateFilter(date);
    // Reset pagination to the first page
    setPagination({ ...pagination, current: 1 });
  };

  // Function to format timestamps into a readable string
  const formatDateTime = (timestamp) => {
    // Return a fallback if no timestamp is provided
    if (!timestamp) return 'N/A';
    // Create a Date object from the timestamp
    const date = new Date(timestamp);
    // Check if the date is valid
    if (isNaN(date.getTime())) return timestamp;
    // Format the date with specified options
    return date.toLocaleString('en-US', {
      year: 'numeric', // Include full year
      month: 'short', // Use abbreviated month name
      day: 'numeric', // Include day of the month
      hour: 'numeric', // Use 12-hour format for hours
      minute: '2-digit', // Ensure two-digit minutes
      hour12: true, // Enable AM/PM
    });
  };

  // Custom table components to apply Poppins font
  const tableComponents = {
    header: {
      cell: (props) => (
        // Customize header cells with Poppins font
        <th {...props} style={{ ...props.style, fontFamily: 'Poppins, sans-serif' }} />
      ),
    },
    body: {
      cell: (props) => (
        // Customize body cells with Poppins font
        <td {...props} style={{ ...props.style, fontFamily: 'Poppins, sans-serif' }} />
      ),
    },
  };

  // Render the component UI
  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: 'Poppins, sans-serif', // Set global font to Poppins
        },
        components: {
          Select: {
            fontFamily: 'Poppins, sans-serif', // Ensure Select component uses Poppins
            optionFontFamily: 'Poppins, sans-serif', // Ensure dropdown options use Poppins
          },
          DatePicker: {
            fontFamily: 'Poppins, sans-serif', // Ensure DatePicker uses Poppins
          },
          Input: {
            fontFamily: 'Poppins, sans-serif', // Ensure Input uses Poppins
          },
          Table: {
            fontFamily: 'Poppins, sans-serif', // Ensure Table uses Poppins
          },
          Pagination: {
            fontFamily: 'Poppins, sans-serif', // Ensure Pagination uses Poppins
          },
          Alert: {
            fontFamily: 'Poppins, sans-serif', // Ensure Alert uses Poppins
          },
          Empty: {
            fontFamily: 'Poppins, sans-serif', // Ensure Empty uses Poppins
          },
          Spin: {
            fontFamily: 'Poppins, sans-serif', // Ensure Spin uses Poppins
          },
          Message: {
            fontFamily: 'Poppins, sans-serif', // Ensure Message uses Poppins
          },
        },
      }}
    >
      <style jsx global>{`
        /* Ensure Poppins font is applied to all Ant Design component texts */
        .ant-select-item-option-content,
        .ant-picker-cell,
        .ant-input::placeholder,
        .ant-select-selection-placeholder,
        .ant-picker-input input::placeholder,
        .ant-empty-description,
        .ant-spin-text,
        .ant-message-notice-content,
        .ant-table-thead th,
        .ant-table-tbody td,
        .ant-pagination-item,
        .ant-pagination-options,
        .ant-alert-message,
        .ant-alert-description {
          font-family: 'Poppins', sans-serif !important;
        }
      `}</style>
      <div
        className={`user-activity-logs-table ${shouldFadeIn ? 'fade-in' : ''}`}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Title level={2} style={{ marginBottom: 20 }}>
          Activity Logs
        </Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <Space>
            <DatePicker
              onChange={handleDateChange} // Update date filter on selection
              style={{ width: 200 }} // Set width
              placeholder="Select date" // Placeholder text
            />
            <Select
              placeholder="Filter by Activity Type" // Placeholder text
              onChange={handleActivityTypeChange} // Update activity type filter on selection
              allowClear // Allow clearing the selection
              style={{ width: 200 }} // Set width
            >
              <Option value="ADD_DATA">Add Data</Option>
              <Option value="LOGIN">Login</Option>
              <Option value="DELETE_DATA">Delete Data</Option>
              <Option value="EDIT_DATA">Edit Data</Option>
              <Option value="LOGOUT">Logout</Option>
            </Select>
          </Space>
          <Input
            placeholder="Search by username or description" // Placeholder text
            value={searchText} // Bind to search text state
            onChange={(e) => handleSearch(e.target.value)} // Update search text on input change
            prefix={<SearchOutlined />} // Add search icon prefix
            style={{ width: 250 }} // Set width
            allowClear // Allow clearing the input
          />
        </div>
        {error && (
          <Alert
            message="Error" // Alert title
            description={error} // Error message content
            type="error" // Alert type
            showIcon // Display an error icon
            style={{ marginBottom: 20 }} // Styling
          />
        )}
        {loading ? (
          // Show a loading spinner while data is being fetched
          <Spin
            tip="Loading logs..." // Loading message
            style={{ display: 'block', textAlign: 'center' }} // Center the spinner
            wrapperClassName="poppins-spin" // Custom class for styling
          />
        ) : logs.length === 0 ? (
          // Show an empty state message if no logs are available
          <Empty
            description="No relevant activity logs found." // Empty state text
          />
        ) : (
          // Display the table with activity logs
          <Table
            dataSource={logs} // Data to populate the table
            rowKey="key" // Unique key for each row
            bordered // Add borders to table cells
            scroll={{ x: true }} // Enable horizontal scrolling
            components={tableComponents} // Apply custom components for font
            pagination={{
              current: pagination.current, // Current page
              pageSize: pagination.pageSize, // Items per page
              total: pagination.total, // Total items
              showSizeChanger: true, // Allow changing page size
              showQuickJumper: true, // Enable quick page jumping
              pageSizeOptions: ['10', '20', '50', '100', '200'], // Page size options
              showTotal: (total) => `Total ${total} user activity log records`, // Total items display
              responsive: true, // Make pagination responsive
              position: ['bottomCenter'], // Position pagination at bottom center
            }}
            loading={loading} // Show loading state
            onChange={handleTableChange} // Handle pagination changes
          >
            {/* Column for user IDs */}
            <Column title="User ID" dataIndex="user_id" key="user_id" />
            {/* Column for usernames */}
            <Column title="Username" dataIndex="Username" key="Username" />
            {/* Column for activity types */}
            <Column title="Activity Type" dataIndex="activity_type" key="activity_type" />
            {/* Column for affected tables */}
            <Column title="Affected Table" dataIndex="affected_table" key="affected_table" />
            {/* Column for affected record IDs */}
            <Column title="Affected Record ID" dataIndex="affected_record_id" key="affected_record_id" />
            {/* Column for activity descriptions */}
            <Column title="Description" dataIndex="activity_description" key="activity_description" />
            {/* Column for creation timestamps with custom rendering */}
            <Column
              title="Created At" // Column header
              dataIndex="created_at" // Data field
              key="created_at" // Unique key
              render={(timestamp) => formatDateTime(timestamp)} // Format timestamp
            />
          </Table>
        )}
      </div>
    </ConfigProvider>
  );
};

// Export the component for use elsewhere in the application
export default UserActivityLogsTable;