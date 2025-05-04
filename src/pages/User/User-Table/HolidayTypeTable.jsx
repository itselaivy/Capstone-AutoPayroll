import { useState, useEffect } from 'react';
import { Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Typography, Pagination, Switch, Alert, Tag } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Column } = Table;
const { Option } = Select;
const { Title } = Typography;

const HolidayTypeTable = () => {
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [form] = Form.useForm();
  const [branches, setBranches] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [filteredPaginationTotal, setFilteredPaginationTotal] = useState(0);

  const API_BASE_URL = "http://localhost/UserTableDB/UserDB";
  const DATE_FORMAT = 'MM/DD/YYYY';
  const MONTH_DAY_FORMAT = 'MM/DD';

  const fetchDropdownData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        message.error('Please log in to access this page');
        return;
      }

      const branchesRes = await fetch(`${API_BASE_URL}/fetch_holiday.php?type=branches`).catch(err => {
        throw new Error(`Branches fetch failed: ${err.message}`);
      });

      if (!branchesRes.ok) throw new Error(`Branches fetch failed: ${branchesRes.statusText}`);

      const branchesData = await branchesRes.json();

      setBranches(branchesData.map(branch => ({
        ...branch,
        BranchID: String(branch.BranchID)
      })));
    } catch (err) {
      console.error("Fetch Dropdown Error:", err.message);
      message.error(`Failed to load dropdown options: ${err.message}`);
    }
  };

  const fetchData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role');
      if (!userId || !role) {
        message.error('Please log in to view holidays');
        return;
      }

      let url = `${API_BASE_URL}/fetch_holiday.php?user_id=${userId}&role=${role}&page=${currentPage - 1}&limit=${pageSize}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Holiday fetch failed: ${res.statusText}`);
      const response = await res.json();

      if (!response.success) throw new Error(response.error || 'Failed to fetch holidays');

      const currentYear = moment().year();
      const groupedData = {};

      response.data.forEach(holiday => {
        const holidayId = holiday.HolidayID;
        if (!groupedData[holidayId]) {
          const [month, day] = holiday.MonthDay.split('-');
          let year = holiday.FixedYear || currentYear;
          const holidayDate = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');
          if (holiday.Recurring && holidayDate.isBefore(moment(), 'day')) {
            year = currentYear + 1;
            holidayDate.year(year);
          }
          groupedData[holidayId] = {
            key: holidayId,
            description: holiday.Description,
            monthDay: holiday.MonthDay,
            date: holidayDate.format(DATE_FORMAT),
            holidayType: holiday.HolidayType,
            branchIds: [],
            branchNames: [],
            recurring: holiday.Recurring === 1,
            fixedYear: holiday.FixedYear,
          };
        }
        if (holiday.BranchID) {
          groupedData[holidayId].branchIds.push(String(holiday.BranchID));
          groupedData[holidayId].branchNames.push(holiday.BranchName);
        }
      });

      const mappedData = Object.values(groupedData).map(holiday => {
        const allBranchesSelected = branches.length > 0 && holiday.branchIds.length === branches.length && holiday.branchIds.every(id => branches.some(b => b.BranchID === id));
        let branchDisplay;
        if (allBranchesSelected) {
          branchDisplay = 'All Branches';
        } else if (holiday.branchIds.length === 1) {
          branchDisplay = holiday.branchNames[0]; // Display the single branch name
        } else {
          branchDisplay = 'Custom'; // Should not occur with new validation
        }
        return {
          ...holiday,
          branchDisplay,
        };
      });

      setOriginalData(mappedData);
      setFilteredData(mappedData);
      setPaginationTotal(response.total);
      setFilteredPaginationTotal(response.total);
    } catch (err) {
      console.error("Fetch Holiday Error:", err.message);
      message.error(`Failed to load holiday data: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchDropdownData();
    fetchData();
  }, [currentPage, pageSize]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value) => {
    const lowerValue = value.toLowerCase().trim();
    let filtered = originalData;

    if (lowerValue) {
      filtered = filtered.filter(item =>
        Object.values(item)
          .filter(val => typeof val === 'string' || typeof val === 'number')
          .map(val => val.toString().toLowerCase())
          .some(val => val.includes(lowerValue))
      );
    }

    setFilteredData(filtered);
    setFilteredPaginationTotal(filtered.length);
    setSearchText(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page, newPageSize) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1);
    }
  };

  const openModal = (type, record = null) => {
    setModalType(type);
    setSelectedHoliday(record);
    setIsModalOpen(true);

    if (record) {
      form.setFieldsValue({
        description: record.description,
        monthDay: moment(record.monthDay, MONTH_DAY_FORMAT),
        holidayType: record.holidayType,
        branchId: record.branchIds.length === branches.length ? ["All"] : record.branchIds,
        recurring: Boolean(record.recurring),
        fixedYear: record.fixedYear ? moment(`${record.fixedYear}`, 'YYYY') : null,
      });
      console.log('Setting recurring field in Edit Modal:', record.recurring);
    } else {
      form.resetFields();
      form.setFieldsValue({ recurring: false });
    }
  };

  const checkForDuplicate = async (monthDay, description, excludeId = null) => {
    try {
      const url = new URL(`${API_BASE_URL}/fetch_holiday.php`);
      url.searchParams.append('type', 'check_duplicate');
      url.searchParams.append('monthDay', monthDay);
      url.searchParams.append('description', description);
      if (excludeId !== null) {
        url.searchParams.append('exclude_id', excludeId);
      }

      console.log('Checking for duplicate with:', { monthDay, description, excludeId, url: url.toString() });

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Duplicate check failed: ${res.statusText}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);
      console.log('Duplicate check response:', data);
      return data.exists;
    } catch (err) {
      console.error("Duplicate Check Error:", err.message, err.stack);
      message.error(`Failed to check for duplicates: ${err.message}`);
      return false;
    }
  };

  const handleOk = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      message.error('User not logged in');
      return;
    }

    if (modalType === "View") {
      handleCancel();
      return;
    }

    if (modalType === "Add" || modalType === "Edit") {
      try {
        const values = await form.validateFields();
        const monthDay = values.monthDay.format('MM-DD'); // Format as MM-DD for MySQL DATE
        const description = values.description;
        const excludeId = modalType === "Edit" && selectedHoliday ? selectedHoliday.key : null;

        console.log('Checking duplicate with:', { monthDay, description, excludeId });

        const isDuplicate = await checkForDuplicate(monthDay, description, excludeId);
        if (isDuplicate) {
          message.warning("Warning: The holiday that you're adding/updating already exists.");
          return;
        }

        let branchId = values.branchId;
        let branchIdForPayload;
        if (branchId.includes("All")) {
          branchIdForPayload = "All"; // Backend expects "All" as a string
        } else if (Array.isArray(branchId) && branchId.length === 1) {
          branchIdForPayload = branchId[0]; // Send single branch ID as a string
        } else {
          message.warning('Please select either "All Branches" or just one specific branch.');
          return;
        }

        const payload = {
          Description: values.description,
          MonthDay: monthDay,
          HolidayType: values.holidayType,
          BranchID: branchIdForPayload,
          Recurring: values.recurring ? 1 : 0,
          FixedYear: values.recurring ? null : (values.fixedYear ? values.fixedYear.format('YYYY') : null),
          user_id: parseInt(userId),
        };

        if (modalType === "Edit" && selectedHoliday) {
          payload.HolidayID = selectedHoliday.key;
        }

        console.log('Submitting payload:', payload);

        const res = await fetch(`${API_BASE_URL}/fetch_holiday.php`, {
          method: modalType === "Add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        const data = await res.json();

        if (data.success) {
          message.success(`Holiday ${modalType === "Add" ? "added" : "updated"} successfully!`);
          setIsModalOpen(false);
          form.resetFields();
          fetchData();
        } else {
          throw new Error(data.error || "Operation failed");
        }
      } catch (err) {
        console.error("Form Submission Error:", err.message, err.stack);
        message.error(`Failed to ${modalType === "Add" ? "add" : "update"} holiday: ${err.message || 'Please ensure all required fields are completed correctly.'}`);
      }
    } else if (modalType === "Delete" && selectedHoliday) {
      try {
        const res = await fetch(`${API_BASE_URL}/fetch_holiday.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ HolidayID: selectedHoliday.key, user_id: parseInt(userId) }),
        });

        const data = await res.json();
        if (data.success) {
          message.success("Holiday deleted successfully!");
          setIsModalOpen(false);
          fetchData();
        } else {
          throw new Error(data.error || "Unknown error during deletion");
        }
      } catch (err) {
        console.error("Delete Error:", err.message);
        message.error(`Failed to delete holiday: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleBranchChange = (value) => {
    if (value.includes("All")) {
      form.setFieldsValue({ branchId: ["All"] });
    } else if (value.length === branches.length) {
      form.setFieldsValue({ branchId: ["All"] });
    } else if (value.length > 1) {
      message.warning('Please choose either "All Branches" or a single branch only.');
      form.setFieldsValue({ branchId: value.slice(0, 1) }); // Keep only the first selected branch
    }
  };

  const showLabels = screenWidth >= 600;

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <Title level={2} style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '20px' }}>
        Holidays
      </Title>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button 
            icon={<PlusOutlined />} 
            size="middle" 
            style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
            onClick={() => openModal('Add')}
          >
            {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Add Holiday</span>}
          </Button>
          <Input
            placeholder="Search by any field (e.g., description, date, type)"
            allowClear
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0, fontFamily: 'Poppins, sans-serif' }}
          />
        </div>
      </div>

      <Table 
        dataSource={filteredData} 
        bordered 
        scroll={{ x: true }} 
        pagination={false}
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Description</span>} 
          dataIndex="description" 
          key="description" 
          sorter={(a, b) => a.description.localeCompare(b.description)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Date</span>} 
          dataIndex="date" 
          key="date" 
          sorter={(a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT))}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Holiday Type</span>} 
          dataIndex="holidayType" 
          key="holidayType" 
          sorter={(a, b) => a.holidayType.localeCompare(b.holidayType)}
          render={(text) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{text}</span>}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch</span>} 
          dataIndex="branchDisplay" 
          key="branchDisplay" 
          sorter={(a, b) => a.branchDisplay.localeCompare(b.branchDisplay)}
          render={(branchDisplay, record) => {
            if (branchDisplay === 'All Branches') {
              return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Tag>;
            }
            if (branchDisplay === 'Custom') {
              return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Tag>;
            }
            if (!branchDisplay || branchDisplay === 'N/A') {
              return <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>N/A</Tag>;
            }
            return (
              <Tag color="blue" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {branchDisplay}
              </Tag>
            );
          }}
        />
        <Column 
          title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Recurring</span>} 
          dataIndex="recurring" 
          key="recurring" 
          sorter={(a, b) => Number(a.recurring) - Number(b.recurring)}
          render={(recurring) => <span style={{ fontFamily: 'Poppins, sans-serif' }}>{recurring ? 'Yes' : 'No'}</span>}
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
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>View</span>}
              </Button>
              <Button 
                icon={<EditOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Edit', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Edit</span>}
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                size="middle" 
                style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: 'white', fontFamily: 'Poppins, sans-serif' }} 
                onClick={() => openModal('Delete', record)}
              >
                {showLabels && <span style={{ fontFamily: 'Poppins, sans-serif' }}>Delete</span>}
              </Button>
            </Space>
          )}
        />
      </Table>

      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={searchText.trim() ? filteredPaginationTotal : paginationTotal}
        onChange={handlePageChange}
        onShowSizeChange={handlePageChange}
        showSizeChanger
        showQuickJumper
        showTotal={(total) => `Total ${total} holiday records`}
        pageSizeOptions={['10', '20', '50', '100']}
        style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}
      />

      <Modal
        title={
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'Poppins, sans-serif' }}>
              {modalType === 'Add' ? 'Add New Holiday' : 
               modalType === 'Edit' ? 'Edit Holiday Details' : 
               modalType === 'View' ? 'View Holiday Information' : 
               'Confirm Holiday Deletion'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText={modalType === 'Delete' ? 'Delete' : 'OK'}
        okButtonProps={{ 
          danger: modalType === 'Delete', 
          style: { fontFamily: 'Poppins, sans-serif' }
        }}
        cancelButtonProps={{ style: { fontFamily: 'Poppins, sans-serif' } }}
        width={600}
        centered
        styles={{ body: { padding: '20px', fontFamily: 'Poppins, sans-serif' } }}
      >
        {(modalType === 'Add' || modalType === 'Edit') && (
          <Form form={form} layout="vertical" style={{ fontFamily: 'Poppins, sans-serif' }} onValuesChange={(changedValues, allValues) => {
            if (changedValues.recurring !== undefined) {
              form.setFieldsValue({ fixedYear: allValues.recurring ? null : allValues.fixedYear });
              console.log('Form Values Updated:', allValues);
            }
          }}>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Description<span style={{ color: 'red' }}>*</span></span>} 
              name="description" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please enter a description!</span> }]}
            >
              <Input style={{ fontFamily: 'Poppins, sans-serif' }} />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Month and Day<span style={{ color: 'red' }}>*</span></span>} 
              name="monthDay" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a month and day!</span> }]}
            >
              <DatePicker 
                format={MONTH_DAY_FORMAT} 
                picker="date" 
                style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
                disabledDate={(current) => current && current.year() !== moment().year()}
              />
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Recurring<span style={{ color: 'red' }}>*</span></span>} 
              name="recurring" 
              valuePropName="checked"
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please specify if this holiday is recurring!</span> }]}
            >
              <Switch 
                checkedChildren="Yes" 
                unCheckedChildren="No" 
                style={{ fontFamily: 'Poppins, sans-serif' }} 
                onChange={(checked) => {
                  form.setFieldsValue({ recurring: checked });
                  console.log('Recurring Switch Changed to:', checked);
                }}
              />
            </Form.Item>
            <Alert 
              message="Set to 'Yes' if this holiday happens every year on the same date. Set to 'No' if it’s a one-time event, and you can pick a specific year for it." 
              type="info" 
              style={{ marginBottom: '30px', fontFamily: 'Poppins, sans-serif', fontSize: '14px' }} 
            />
            <Form.Item 
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.recurring !== currentValues.recurring}
            >
              {({ getFieldValue }) => {
                const isRecurring = getFieldValue('recurring');
                console.log('Rendering Fixed Year Field, Recurring:', isRecurring);
                return !isRecurring ? (
                  <Form.Item 
                    label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Fixed Year<span style={{ color: 'red' }}>*</span></span>} 
                    name="fixedYear" 
                    rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a year for this non-recurring holiday!</span> }]}
                  >
                    <DatePicker 
                      picker="year" 
                      style={{ width: '100%', fontFamily: 'Poppins, sans-serif' }} 
                      disabledDate={(current) => current && current.year() < moment().year()}
                    />
                  </Form.Item>
                ) : null;
              }}
            </Form.Item>
            <Form.Item 
              label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Holiday Type<span style={{ color: 'red' }}>*</span></span>} 
              name="holidayType" 
              rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a holiday type!</span> }]}
            >
              <Select style={{ fontFamily: 'Poppins, sans-serif' }}>
                <Option value="Special Non-Working Holiday" style={{ fontFamily: 'Poppins, sans-serif' }}>Special Non-Working Holiday</Option>
                <Option value="Legal Holiday" style={{ fontFamily: 'Poppins, sans-serif' }}>Legal Holiday</Option>
              </Select>
            </Form.Item>
            {(modalType === 'Add' || modalType === 'Edit') && (
              <Form.Item 
                label={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Branch<span style={{ color: 'red' }}>*</span></span>} 
                name="branchId" 
                rules={[{ required: true, message: <span style={{ fontFamily: 'Poppins, sans-serif' }}>Please select a branch!</span> }]}
              >
                <Select 
                  mode="multiple" 
                  allowClear 
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                  placeholder="Select branch(es)"
                  onChange={handleBranchChange}
                >
                  <Option value="All" style={{ fontFamily: 'Poppins, sans-serif' }}>All Branches</Option>
                  {branches.map(branch => (
                    <Option key={branch.BranchID} value={branch.BranchID} style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {branch.BranchName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            )}
          </Form>
        )}

        {modalType === 'View' && selectedHoliday && (
          <div style={{ fontFamily: 'Poppins, sans-serif' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Description:</strong> {selectedHoliday.description}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Date:</strong> {selectedHoliday.date}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Holiday Type:</strong> {selectedHoliday.holidayType}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Branch:</strong> {selectedHoliday.branchDisplay}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Recurring:</strong> {selectedHoliday.recurring ? 'Yes' : 'No'}
            </p>
            {!selectedHoliday.recurring && (
              <p style={{ fontFamily: 'Poppins, sans-serif' }}>
                <strong style={{ fontFamily: 'Poppins, sans-serif' }}>Fixed Year:</strong> {selectedHoliday.fixedYear}
              </p>
            )}
          </div>
        )}

        {modalType === 'Delete' && selectedHoliday && (
          <div style={{ fontFamily: 'Poppins, sans-serif', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f', fontFamily: 'Poppins, sans-serif' }}>
              ⚠️ Are you sure you want to delete this holiday record?
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>
              This action <strong style={{ fontFamily: 'Poppins, sans-serif' }}>cannot be undone</strong>. The holiday record for "<strong style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedHoliday.description}</strong>" will be permanently removed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default HolidayTypeTable;