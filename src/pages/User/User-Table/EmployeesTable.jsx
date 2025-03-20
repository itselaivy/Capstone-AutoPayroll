import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Select, Typography } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const EmployeesTable = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [selectedMemberSinceMonth, setSelectedMemberSinceMonth] = useState('all');
  const [selectedMemberSinceDay, setSelectedMemberSinceDay] = useState('all');
  const [selectedMemberSinceYear, setSelectedMemberSinceYear] = useState('all');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [form] = Form.useForm();
  const [branches, setBranches] = useState([]);
  const [positions, setPositions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";

  const fetchDropdownData = async () => {
    try {
      const [branchesRes, positionsRes, schedulesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/fetch_employees.php?type=branches`),
        fetch(`${API_BASE_URL}/fetch_employees.php?type=positions`),
        fetch(`${API_BASE_URL}/fetch_employees.php?type=schedules`)
      ]);

      const branchesData = await branchesRes.json();
      const positionsData = await positionsRes.json();
      const schedulesData = await schedulesRes.json();

      console.log('Branches:', branchesData);
      console.log('Positions:', positionsData);
      console.log('Schedules:', schedulesData);

      setBranches(branchesData);
      setPositions(positionsData);
      setSchedules(schedulesData);
      setDropdownsLoaded(true);
    } catch (err) {
      console.error("Error fetching dropdown data:", err);
      message.error("Failed to load dropdown options. Please refresh.");
    }
  };

  useEffect(() => {
    fetchDropdownData();
  }, []);

  const fetchData = () => {
    fetch(`${API_BASE_URL}/fetch_employees.php`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch data");
        return res.json();
      })
      .then((data) => {
        const mappedData = data.map(employee => ({
          "Employee ID": employee.key,
          "Employee Name": employee.EmployeeName,
          "Branch Name": employee.BranchName,
          "Position Title": employee.PositionTitle,
          "Schedule": employee.Schedule,
          "Member Since": employee.MemberSince,
          key: employee.key,
          EmployeeName: employee.EmployeeName,
          BranchID: Number(employee.BranchID),
          PositionID: Number(employee.PositionID),
          ScheduleID: Number(employee.ScheduleID),
          MemberSince: employee.MemberSince
        }));
        console.log('Mapped Employee Data:', mappedData);
        setData(mappedData);
        setFilteredData(mappedData);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
        message.error("Failed to load employee data. Please refresh.");
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthToNumber = (monthName) => {
    const index = monthNames.indexOf(monthName);
    return index !== -1 ? (index + 1).toString().padStart(2, '0') : null;
  };

  const applyFilters = (data, search, branch, position, month, day, year) => {
    let result = [...data];

    if (branch !== 'all') {
      result = result.filter(item => item.BranchID === Number(branch));
    }

    if (position !== 'all') {
      result = result.filter(item => item.PositionID === Number(position));
    }

    if (month !== 'all' || day !== 'all' || year !== 'all') {
      result = result.filter(item => {
        const [itemYear, itemMonth, itemDay] = item["Member Since"].split('-');
        const monthNumber = month === 'all' ? null : monthToNumber(month);
        return (
          (month === 'all' || itemMonth === monthNumber) &&
          (day === 'all' || itemDay === day.padStart(2, '0')) &&
          (year === 'all' || itemYear === year)
        );
      });
    }

    const searchValue = search.toLowerCase().trim();
    if (searchValue) {
      result = result.filter(item =>
        item["Employee ID"].toString().includes(searchValue) ||
        item["Employee Name"].toLowerCase().includes(searchValue) ||
        item["Branch Name"].toLowerCase().includes(searchValue) ||
        item["Position Title"].toLowerCase().includes(searchValue) ||
        item["Schedule"].toLowerCase().includes(searchValue) ||
        item["Member Since"].toLowerCase().includes(searchValue)
      );
    }

    return result;
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setFilteredData(applyFilters(data, value, selectedBranch, selectedPosition, selectedMemberSinceMonth, selectedMemberSinceDay, selectedMemberSinceYear));
  };

  const handleBranchChange = (value) => {
    setSelectedBranch(value);
    setFilteredData(applyFilters(data, searchText, value, selectedPosition, selectedMemberSinceMonth, selectedMemberSinceDay, selectedMemberSinceYear));
  };

  const handlePositionChange = (value) => {
    setSelectedPosition(value);
    setFilteredData(applyFilters(data, searchText, selectedBranch, value, selectedMemberSinceMonth, selectedMemberSinceDay, selectedMemberSinceYear));
  };

  const handleMonthChange = (value) => {
    setSelectedMemberSinceMonth(value);
    setFilteredData(applyFilters(data, searchText, selectedBranch, selectedPosition, value, selectedMemberSinceDay, selectedMemberSinceYear));
  };

  const handleDayChange = (value) => {
    setSelectedMemberSinceDay(value);
    setFilteredData(applyFilters(data, searchText, selectedBranch, selectedPosition, selectedMemberSinceMonth, value, selectedMemberSinceYear));
  };

  const handleYearChange = (value) => {
    setSelectedMemberSinceYear(value);
    setFilteredData(applyFilters(data, searchText, selectedBranch, selectedPosition, selectedMemberSinceMonth, selectedMemberSinceDay, value));
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedEmployee(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      console.log('Editing Employee:', record);
      const initializeForm = () => {
        form.setFieldsValue({
          EmployeeName: record["Employee Name"],
          BranchID: record["Branch Name"], // Set to name initially
          PositionID: record["Position Title"], // Set to title initially
          ScheduleID: record["Schedule"], // Set to schedule string initially
          MemberSince: record["Member Since"]
        });
        console.log('Form Values After Set:', form.getFieldsValue());
      };

      if (dropdownsLoaded) {
        initializeForm();
      } else {
        const interval = setInterval(() => {
          if (dropdownsLoaded) {
            initializeForm();
            clearInterval(interval);
          }
        }, 100);
      }
    } else if (type === 'Add') {
      form.resetFields();
    }
  };

  const handleOk = () => {
    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      form.validateFields()
        .then((values) => {
          // Convert names/titles back to IDs for the payload
          const branch = branches.find(b => b.BranchName === values.BranchID);
          const position = positions.find(p => p.PositionTitle === values.PositionID);
          const schedule = schedules.find(s => `${s.ShiftStart} - ${s.ShiftEnd}` === values.ScheduleID);

          const payload = {
            EmployeeName: values.EmployeeName,
            BranchID: branch ? Number(branch.BranchID) : null,
            PositionID: position ? Number(position.PositionID) : null,
            ScheduleID: schedule ? Number(schedule.ScheduleID) : null,
            MemberSince: values.MemberSince
          };

          if (modalType === "Edit" && selectedEmployee) {
            payload.EmployeeID = selectedEmployee.key;
          }

          if (!payload.BranchID || !payload.PositionID || !payload.ScheduleID) {
            throw new Error("Invalid selection for Branch, Position, or Schedule");
          }

          const url = `${API_BASE_URL}/fetch_employees.php`;
          const method = modalType === "Add" ? "POST" : "PUT";

          fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Server error");
              return res.json();
            })
            .then(() => {
              message.success(`Employee ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => {
              message.error(`Failed to ${modalType === "Add" ? "add" : "update"} employee: ${err.message}`);
            });
        })
        .catch((errorInfo) => {
          message.error("Please fill all required fields correctly");
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      fetch(`${API_BASE_URL}/fetch_employees.php`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeID: selectedEmployee.key }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to delete employee");
          return res.json();
        })
        .then(() => {
          message.success("Employee deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        })
        .catch((err) => {
          message.error(`Failed to delete employee: ${err.message}`);
        });
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const showLabels = screenWidth >= 600;

  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
  const years = Array.from({ length: 50 }, (_, i) => (new Date().getFullYear() - i).toString());

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Employees
      </Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button
          icon={<PlusOutlined />}
          size="middle"
          style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }}
          onClick={() => openModal('Add')}
        >
          {showLabels && 'Add Employee'}
        </Button>
        <Select
          value={selectedBranch}
          onChange={handleBranchChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          placeholder="Filter by Branch"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
          {branches.map(branch => (
            <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {branch.BranchName}
            </Option>
          ))}
        </Select>
        <Select
          value={selectedPosition}
          onChange={handlePositionChange}
          style={{ width: screenWidth < 480 ? '100%' : '200px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          placeholder="Filter by Position"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Positions</Option>
          {positions.map(position => (
            <Option key={position.PositionID} value={position.PositionID} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {position.PositionTitle}
            </Option>
          ))}
        </Select>
        <Select
          value={selectedMemberSinceMonth}
          onChange={handleMonthChange}
          style={{ width: screenWidth < 480 ? '100%' : '120px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          placeholder="Month"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Months</Option>
          {monthNames.map((month, index) => (
            <Option key={index} value={month} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {month}
            </Option>
          ))}
        </Select>
        <Select
          value={selectedMemberSinceDay}
          onChange={handleDayChange}
          style={{ width: screenWidth < 480 ? '100%' : '120px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          placeholder="Day"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Days</Option>
          {days.map(day => (
            <Option key={day} value={day} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {day.padStart(2, '0')}
            </Option>
          ))}
        </Select>
        <Select
          value={selectedMemberSinceYear}
          onChange={handleYearChange}
          style={{ width: screenWidth < 480 ? '100%' : '120px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          placeholder="Year"
        >
          <Option value="all" style={{ fontFamily: 'Poppins, sans-serif' }}>All Years</Option>
          {years.map(year => (
            <Option key={year} value={year} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {year}
            </Option>
          ))}
        </Select>
        <Input
          placeholder="Search..."
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered
        scroll={{ x: true }}
        pagination={{ responsive: true, position: ['bottomCenter'] }}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title="Employee ID" 
          dataIndex="Employee ID" 
          key="Employee ID" 
          sorter={(a, b) => a["Employee ID"] - b["Employee ID"]}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Employee Name" 
          dataIndex="Employee Name" 
          key="Employee Name" 
          sorter={(a, b) => a["Employee Name"].localeCompare(b["Employee Name"])} 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Branch Name" 
          dataIndex="Branch Name" 
          key="Branch Name" 
          sorter={(a, b) => a["Branch Name"].localeCompare(b["Branch Name"])} 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Position Title" 
          dataIndex="Position Title" 
          key="Position Title" 
          sorter={(a, b) => a["Position Title"].localeCompare(b["Position Title"])} 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Schedule" 
          dataIndex="Schedule" 
          key="Schedule" 
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title="Member Since" 
          dataIndex="Member Since" 
          key="Member Since" 
          sorter={(a, b) => new Date(a["Member Since"]) - new Date(b["Member Since"])}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle">
              <Button
                icon={<EyeOutlined />}
                size="small"
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('View', record)}
              >
                View
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('Edit', record)}
              >
                Edit
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', padding: 15, fontFamily: 'Poppins, sans-serif' }}
                onClick={() => openModal('Delete', record)}
              >
                Delete
              </Button>
            </Space>
          )}
        />
      </Table>

      <Modal 
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Employee' :
              modalType === 'Edit' ? 'Edit Employee Details' :
              modalType === 'View' ? 'View Employee Information' :
              'Confirm Employee Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={modalType === 'View' ? handleCancel : handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ danger: modalType === 'Delete', style: { fontFamily: 'Poppins, sans-serif' } }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        style={{ minHeight: '100px', padding: '20px', margin: 20, fontFamily: 'Poppins, sans-serif' }}
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <Form.Item 
              label="Employee Name" 
              name="EmployeeName" 
              rules={[{ required: true, message: 'Please enter employee name!' }]}
              initialValue={selectedEmployee ? selectedEmployee["Employee Name"] : undefined}
            >
              <Input placeholder="Enter Employee Name" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item 
              label="Branch" 
              name="BranchID" 
              rules={[{ required: true, message: 'Please select a branch!' }]}
              initialValue={selectedEmployee ? selectedEmployee["Branch Name"] : undefined}
            >
              <Select 
                placeholder="Select Branch" 
                style={{ fontFamily: 'Poppins, sans-serif' }}
                loading={!dropdownsLoaded}
                showSearch
                optionFilterProp="children"
                disabled={!dropdownsLoaded}
              >
                {branches.map((branch) => (
                  <Option key={branch.BranchID} value={branch.BranchName} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {branch.BranchName}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label="Position" 
              name="PositionID" 
              rules={[{ required: true, message: 'Please select a position!' }]}
              initialValue={selectedEmployee ? selectedEmployee["Position Title"] : undefined}
            >
              <Select 
                placeholder="Select Position" 
                style={{ fontFamily: 'Poppins, sans-serif' }}
                loading={!dropdownsLoaded}
                showSearch
                optionFilterProp="children"
                disabled={!dropdownsLoaded}
              >
                {positions.map((position) => (
                  <Option key={position.PositionID} value={position.PositionTitle} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {position.PositionTitle}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label="Schedule" 
              name="ScheduleID" 
              rules={[{ required: true, message: 'Please select a schedule!' }]}
              initialValue={selectedEmployee ? selectedEmployee["Schedule"] : undefined}
            >
              <Select 
                placeholder="Select Schedule" 
                style={{ fontFamily: 'Poppins, sans-serif' }}
                loading={!dropdownsLoaded}
                showSearch
                optionFilterProp="children"
                disabled={!dropdownsLoaded}
              >
                {schedules.map((schedule) => (
                  <Option key={schedule.ScheduleID} value={`${schedule.ShiftStart} - ${schedule.ShiftEnd}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {`${schedule.ShiftStart} - ${schedule.ShiftEnd}`}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item 
              label="Member Since" 
              name="MemberSince" 
              rules={[{ required: true, message: 'Please enter member since date!' }]}
              initialValue={selectedEmployee ? selectedEmployee["Member Since"] : undefined}
            >
              <Input type="date" placeholder="Enter Member Since Date" style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
          </Form>
        )}

        {modalType === 'View' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
             <p><strong>Employee Name:</strong> {selectedEmployee["Employee Name"]}</p>
            <p><strong>Branch Name:</strong> {selectedEmployee["Branch Name"]}</p>
            <p><strong>Position Title:</strong> {selectedEmployee["Position Title"]}</p>
            <p><strong>Schedule:</strong> {selectedEmployee.Schedule}</p>
            <p><strong>Member Since:</strong> {selectedEmployee["Member Since"]}</p>
          </div>
        )}

        {modalType === 'Delete' && selectedEmployee && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this employee?
            </p>
            <p>This action <strong>cannot be undone</strong>. The employee "<strong>{selectedEmployee["Employee Name"]}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmployeesTable;