import { useState, useEffect } from 'react';
import { Modal, Space, Table, Button, Input, Form, message, Select } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, 
  SearchOutlined 
} from '@ant-design/icons';
import './UserTable.css';

const { Column } = Table;
const { Option } = Select;

const EmployeesTable = () => {
  const [searchText, setSearchText] = useState('');
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
  
  // Base API URL
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

      console.log("Fetched Branches:", branchesData);
      console.log("Fetched Positions:", positionsData);
      console.log("Fetched Schedules:", schedulesData);

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
        if (!res.ok) {
          throw new Error("Failed to fetch data");
        }
        return res.json();
      })
      .then((data) => {
        console.log("Raw backend data:", data);
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

  const showLabels = screenWidth >= 600;

  const handleSearch = (value) => {
    setSearchText(value);
    
    if (!value.trim()) {
      setFilteredData(data);
      return;
    }
    
    const searchValue = value.toLowerCase();
    const filtered = data.filter(
      (item) =>
        item["Employee ID"].toString().includes(searchValue) ||
        item["Employee Name"].toLowerCase().includes(searchValue) ||
        item["Branch Name"].toLowerCase().includes(searchValue) ||
        item["Position Title"].toLowerCase().includes(searchValue) ||
        item["Schedule"].toLowerCase().includes(searchValue) ||
        item["Member Since"].toLowerCase().includes(searchValue)
    );
    setFilteredData(filtered);
  };

  const openModal = (type, record = null) => {
    console.log("Opening Modal:", type, record);
    setModalType(type);
    setSelectedEmployee(record);
    setIsModalOpen(true);

    if (type === 'Edit' && record) {
      const initializeForm = () => {
        console.log("Setting form values:", {
          EmployeeName: record["Employee Name"],
          BranchID: record["Branch Name"],
          PositionID: record["Position Title"],
          ScheduleID: record.ScheduleID,
          MemberSince: record["Member Since"]
        });
        form.setFieldsValue({
          EmployeeName: record["Employee Name"],
          BranchID: record["Branch Name"],
          PositionID: record["Position Title"],
          ScheduleID: record.ScheduleID,
          MemberSince: record["Member Since"]
        });
        // Force re-render to ensure Select displays names
        form.resetFields(['BranchID', 'PositionID', 'ScheduleID']);
        form.setFieldsValue({
          BranchID: record["Branch Name"],
          PositionID: record["Position Title"],
          ScheduleID: record.ScheduleID
        });
      };

      if (dropdownsLoaded) {
        initializeForm();
      } else {
        console.warn("Dropdown data not yet loaded, delaying form initialization");
        const waitForDropdowns = setInterval(() => {
          if (dropdownsLoaded) {
            initializeForm();
            clearInterval(waitForDropdowns);
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
          console.log("Form Values on Submit:", values);
          const payload = {
            EmployeeName: values.EmployeeName,
            BranchID: Number(values.BranchID),
            PositionID: Number(values.PositionID),
            ScheduleID: Number(values.ScheduleID),
            MemberSince: values.MemberSince
          };
  
          if (modalType === "Edit" && selectedEmployee) {
            payload.EmployeeID = selectedEmployee.key;
          }
  
          const url = `${API_BASE_URL}/fetch_employees.php`;
          const method = modalType === "Add" ? "POST" : "PUT";
  
          fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then((res) => {
              if (!res.ok) {
                return res.text().then((text) => {
                  console.error("Server Response:", text);
                  throw new Error(text);
                });
              }
              return res.json();
            })
            .then((data) => {
              message.success(`Employee ${modalType === "Add" ? "added" : "updated"} successfully!`);
              setIsModalOpen(false);
              form.resetFields();
              fetchData();
            })
            .catch((err) => {
              console.error(`${modalType} Error:`, err);
              message.error(`Failed to ${modalType === "Add" ? "add" : "update"} employee: ${err.message}`);
            });
        })
        .catch((errorInfo) => {
          console.log("Validation Failed:", errorInfo);
          message.error("Please fill all required fields correctly");
        });
    } else if (modalType === "Delete" && selectedEmployee) {
      fetch(`${API_BASE_URL}/fetch_employees.php`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeID: selectedEmployee.key }),
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error || "Failed to delete employee"); });
          }
          return res.json();
        })
        .then((data) => {
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

  return (
    <>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'right', 
        alignItems: 'center', 
        gap: 16, 
        marginBottom: 20,
        flexWrap: 'wrap' 
      }}>
        <Button
          icon={<PlusOutlined />}
          size="middle"
          style={{ 
            backgroundColor: '#2C3743', 
            borderColor: '#2C3743', 
            color: 'white'
          }}
          onClick={() => openModal('Add')}
        >
          {showLabels && 'Add Employee'} 
        </Button>
        <Input
          placeholder="Search..."
          allowClear
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
        />
      </div>

      <Table 
        dataSource={filteredData} 
        bordered
        scroll={{ x: true }}
        pagination={{ 
          responsive: true,
          position: ['bottomCenter']
        }}
      >
        <Column 
          title="Employee ID" 
          dataIndex="Employee ID" 
          key="Employee ID" 
          sorter={(a, b) => a["Employee ID"] - b["Employee ID"]}
        />
        <Column 
          title="Employee Name" 
          dataIndex="Employee Name" 
          key="Employee Name" 
          sorter={(a, b) => a["Employee Name"].localeCompare(b["Employee Name"])} 
        />
        <Column 
          title="Branch Name" 
          dataIndex="Branch Name" 
          key="Branch Name" 
          sorter={(a, b) => a["Branch Name"].localeCompare(b["Branch Name"])} 
        />
        <Column 
          title="Position Title" 
          dataIndex="Position Title" 
          key="Position Title" 
          sorter={(a, b) => a["Position Title"].localeCompare(b["Position Title"])} 
        />
        <Column 
          title="Schedule" 
          dataIndex="Schedule" 
          key="Schedule" 
        />
        <Column 
          title="Member Since" 
          dataIndex="Member Since" 
          key="Member Since" 
          sorter={(a, b) => new Date(a["Member Since"]) - new Date(b["Member Since"])}
        />
        <Column
          title="Action"
          key="action"
          render={(_, record) => (
            <Space size="middle">
              <Button
                icon={<EyeOutlined />}
                size="small"
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: 'white', padding: 15 }}
                onClick={() => openModal('View', record)}
              >
                View
              </Button>
              <Button
                icon={<EditOutlined />}
                size="small"
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', padding: 15 }}
                onClick={() => openModal('Edit', record)}
              >
                Edit
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', padding: 15 }}
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
            <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
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
        okButtonProps={{ danger: modalType === 'Delete' }}
        width={600}
        centered
        style={{ minHeight: '100px', padding: '20px', margin: 20 }}
      >
        {modalType === 'Add' && (
          <>
            <Form form={form} layout="vertical">
              <Form.Item 
                label="Employee Name" 
                name="EmployeeName" 
                rules={[{ required: true, message: 'Please enter employee name!' }]}
              >
                <Input placeholder="Enter Employee Name" />
              </Form.Item>
              <Form.Item 
                label="Branch" 
                name="BranchID" 
                rules={[{ required: true, message: 'Please select a branch!' }]}
              >
                <Select placeholder="Select Branch">
                  {branches.map((branch) => (
                    <Option key={branch.BranchID} value={branch.BranchID}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Position" 
                name="PositionID" 
                rules={[{ required: true, message: 'Please select a position!' }]}
              >
                <Select placeholder="Select Position">
                  {positions.map((position) => (
                    <Option key={position.PositionID} value={position.PositionID}>
                      {position.PositionTitle}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Schedule" 
                name="ScheduleID" 
                rules={[{ required: true, message: 'Please select a schedule!' }]}
              >
                <Select placeholder="Select Schedule">
                  {schedules.map((schedule) => (
                    <Option key={schedule.ScheduleID} value={schedule.ScheduleID}>
                      {`${schedule.ShiftStart} - ${schedule.ShiftEnd}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Member Since" 
                name="MemberSince" 
                rules={[{ required: true, message: 'Please enter member since date!' }]}
              >
                <Input type="date" placeholder="Enter Member Since Date" />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'Edit' && (
          <>
            <Form form={form} layout="vertical">
              <Form.Item 
                label="Employee Name" 
                name="EmployeeName" 
                rules={[{ required: true, message: 'Please enter employee name!' }]}
              >
                <Input placeholder="Enter Employee Name" />
              </Form.Item>
              <Form.Item 
                label="Branch" 
                name="BranchID" 
                rules={[{ required: true, message: 'Please select a branch!' }]}
              >
                <Select placeholder="Select Branch">
                  {branches.map((branch) => (
                    <Option key={branch.BranchID} value={branch.BranchID}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Position" 
                name="PositionID" 
                rules={[{ required: true, message: 'Please select a position!' }]}
              >
                <Select placeholder="Select Position">
                  {positions.map((position) => (
                    <Option key={position.PositionID} value={position.PositionID}>
                      {position.PositionTitle}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Schedule" 
                name="ScheduleID" 
                rules={[{ required: true, message: 'Please select a schedule!' }]}
              >
                <Select placeholder="Select Schedule">
                  {schedules.map((schedule) => (
                    <Option key={schedule.ScheduleID} value={schedule.ScheduleID}>
                      {`${schedule.ShiftStart} - ${schedule.ShiftEnd}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item 
                label="Member Since" 
                name="MemberSince" 
                rules={[{ required: true, message: 'Please enter member since date!' }]}
              >
                <Input type="date" placeholder="Enter Member Since Date" />
              </Form.Item>
            </Form>
          </>
        )}

        {modalType === 'View' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 10}}>Employee Details:</p>
            <p><strong>Employee Name:</strong> {selectedEmployee?.["Employee Name"]}</p>
            <p><strong>Branch Name:</strong> {selectedEmployee?.["Branch Name"]}</p>
            <p><strong>Position Title:</strong> {selectedEmployee?.["Position Title"]}</p>
            <p><strong>Schedule:</strong> {selectedEmployee?.Schedule}</p>
            <p><strong>Member Since:</strong> {selectedEmployee?.["Member Since"]}</p>
          </div>
        )}

        {modalType === 'Delete' && (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
              ⚠️ Are you sure you want to delete this employee?
            </p>
            <p>This action <strong>cannot be undone</strong>. The employee "<strong>{selectedEmployee?.["Employee Name"]}</strong>" will be permanently removed.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default EmployeesTable;