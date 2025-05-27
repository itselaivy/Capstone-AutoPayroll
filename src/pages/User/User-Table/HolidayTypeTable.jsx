import { useState, useEffect } from 'react';
import { ConfigProvider, Space, Table, Button, Input, Modal, Form, message, DatePicker, Select, Typography, Pagination, Switch, Alert, Tag, Tooltip } from 'antd';
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
        let branchDisplay;
        let branchTags = [];
        const allBranchesSelected = holiday.branchIds.includes("All");
        if (allBranchesSelected) {
          branchDisplay = 'All Branches';
          branchTags = [{ key: 'all', name: 'All Branches' }];
        } else if (holiday.branchIds.length === 1) {
          branchDisplay = holiday.branchNames[0];
          branchTags = [{ key: holiday.branchIds[0], name: holiday.branchNames[0] }];
        } else {
          branchDisplay = holiday.branchNames.join(', ');
          branchTags = holiday.branchIds.map((id, index) => ({
            key: id,
            name: holiday.branchNames[index]
          }));
        }
        return {
          ...holiday,
          branchDisplay,
          branchTags
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
            const monthDay = values.monthDay.format('MM-DD');
            const description = values.description;
            const excludeId = modalType === "Edit" && selectedHoliday ? selectedHoliday.key : null;

            console.log('Checking duplicate with:', { monthDay, description, excludeId });

            const isDuplicate = await checkForDuplicate(monthDay, description, excludeId);
            if (isDuplicate) {
                message.warning("Warning: The holiday that you're adding/updating already exists.");
                return;
            }

            let branchIds = values.branchId;
            if (branchIds.length === 0) {
                message.warning('Please select at least one branch.');
                return;
            }

            const payload = {
                Description: values.description,
                MonthDay: monthDay,
                HolidayType: values.holidayType,
                BranchID: branchIds,
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
        form.setFieldsValue({ branchId: branches.map(branch => branch.BranchID) });
    } else {
        form.setFieldsValue({ branchId: value });
    }
};

  const showLabels = screenWidth >= 600;

  return (
    <ConfigProvider theme={{ token: { fontFamily: 'Poppins, sans-serif' } }}>
      <div className="fade-in" style={{ padding: '20px', fontFamily: 'Poppins, sans-serif' }}>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
            
            /* Ensure custom elements use Poppins */
            .fade-in, .fade-in * {
              font-family: 'Poppins', sans-serif !important;
            }
          `}
        </style>
        <Title level={2} style={{ marginBottom: '20px' }}>
          Holidays
        </Title>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button 
              icon={<PlusOutlined />} 
              size="middle" 
              style={{ backgroundColor: '#2C3743', borderColor: '#2C3743', color: 'white' }} 
              onClick={() => openModal('Add')}
            >
              {showLabels && 'Add Holiday'}
            </Button>
            <Input
              placeholder="Search by any field (e.g., description, date, type)"
              allowClear
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: screenWidth < 480 ? '100%' : '250px', marginTop: screenWidth < 480 ? 10 : 0 }}
            />
          </div>
        </div>

        <Table 
          dataSource={filteredData} 
          bordered 
          scroll={{ x: true }} 
          pagination={false}
        >
          <Column 
            title="Description" 
            dataIndex="description" 
            key="description" 
            sorter={(a, b) => a.description.localeCompare(b.description)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Date" 
            dataIndex="date" 
            key="date" 
            sorter={(a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT))}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Holiday Type" 
            dataIndex="holidayType" 
            key="holidayType" 
            sorter={(a, b) => a.holidayType.localeCompare(b.holidayType)}
            render={(text) => <span>{text}</span>}
          />
          <Column 
            title="Branch" 
            dataIndex="branchTags" 
            key="branchDisplay" 
            sorter={(a, b) => a.branchDisplay.localeCompare(b.branchDisplay)}
            render={(branchTags) => (
              <Space wrap>
                {branchTags.map(tag => (
                  <Tag key={tag.key} color="blue">{tag.name}</Tag>
                ))}
              </Space>
            )}
          />
          <Column 
            title="Recurring" 
            dataIndex="recurring" 
            key="recurring" 
            sorter={(a, b) => Number(a.recurring) - Number(b.recurring)}
            render={(recurring) => <span>{recurring ? 'Yes' : 'No'}</span>}
          />
          <Column
            title={<span style={{ fontFamily: 'Poppins, sans-serif' }}>Action</span>}
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
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
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
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('Edit', record)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    icon={<DeleteOutlined />}
                    size="middle"
                    style={{
                      width: '40px',
                      backgroundColor: '#ff4d4f',
                      borderColor: '#ff4d4f',
                      color: 'white',
                      fontFamily: 'Poppins, sans-serif'
                    }}
                    onClick={() => openModal('Delete', record)}
                  />
                </Tooltip>
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
          style={{ marginTop: 16, textAlign: 'right', justifyContent: 'center' }}
        />

        <Modal
          title={
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '22px', fontWeight: 'bold' }}>
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
          okButtonProps={{ danger: modalType === 'Delete' }}
          cancelButtonProps={{}}
          width={600}
          centered
          styles={{ body: { padding: '20px' } }}
        >
          {(modalType === 'Add' || modalType === 'Edit') && (
            <Form form={form} layout="vertical" onValuesChange={(changedValues, allValues) => {
              if (changedValues.recurring !== undefined) {
                form.setFieldsValue({ fixedYear: allValues.recurring ? null : allValues.fixedYear });
                console.log('Form Values Updated:', allValues);
              }
            }}>
              <Form.Item 
                label={<span>Description<span style={{ color: 'red' }}>*</span></span>} 
                name="description" 
                rules={[{ required: true, message: 'Please enter a description!' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item 
                label={<span>Month and Day<span style={{ color: 'red' }}>*</span></span>} 
                name="monthDay" 
                rules={[{ required: true, message: 'Please select a month and day!' }]}
              >
                <DatePicker 
                  format={MONTH_DAY_FORMAT} 
                  picker="date" 
                  style={{ width: '100%' }} 
                  disabledDate={(current) => current && current.year() !== moment().year()}
                />
              </Form.Item>
              <Form.Item 
                label={<span>Recurring<span style={{ color: 'red' }}>*</span></span>} 
                name="recurring" 
                valuePropName="checked"
                rules={[{ required: true, message: 'Please specify if this holiday is recurring!' }]}
              >
                <Switch 
                  checkedChildren="Yes" 
                  unCheckedChildren="No" 
                  onChange={(checked) => {
                    form.setFieldsValue({ recurring: checked });
                    console.log('Recurring Switch Changed to:', checked);
                  }}
                />
              </Form.Item>
              <Alert 
                message="Set to 'Yes' if this holiday happens every year on the same date. Set to 'No' if it’s a one-time event, and you can pick a specific year for it." 
                type="info" 
                style={{ marginBottom: '30px', fontSize: '14px' }} 
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
                      label={<span>Fixed Year<span style={{ color: 'red' }}>*</span></span>} 
                      name="fixedYear" 
                      rules={[{ required: true, message: 'Please select a year for this non-recurring holiday!' }]}
                    >
                      <DatePicker 
                        picker="year" 
                        style={{ width: '100%' }} 
                        disabledDate={(current) => current && current.year() < moment().year()}
                      />
                    </Form.Item>
                  ) : null;
                }}
              </Form.Item>
              <Form.Item 
                label={<span>Holiday Type<span style={{ color: 'red' }}>*</span></span>} 
                name="holidayType" 
                rules={[{ required: true, message: 'Please select a holiday type!' }]}
              >
                <Select>
                  <Option value="Special Non-Working Holiday">Special Non-Working Holiday</Option>
                  <Option value="Legal Holiday">Legal Holiday</Option>
                </Select>
              </Form.Item>
              {(modalType === 'Add' || modalType === 'Edit') && (
                <Form.Item 
                  label={<span>Branch<span style={{ color: 'red' }}>*</span></span>} 
                  name="branchId" 
                  rules={[{ required: true, message: 'Please select a branch!' }]}
                >
                  <Select 
                    mode="multiple" 
                    allowClear 
                    placeholder="Select branch(es)"
                    onChange={handleBranchChange}
                  >
                    <Option value="All">All Branches</Option>
                    {branches.map(branch => (
                      <Option key={branch.BranchID} value={branch.BranchID}>
                        {branch.BranchName}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
            </Form>
          )}

          {modalType === 'View' && selectedHoliday && (
            <div>
              <p>
                <strong>Description:</strong> {selectedHoliday.description}
              </p>
              <p>
                <strong>Date:</strong> {selectedHoliday.date}
              </p>
              <p>
                <strong>Holiday Type:</strong> {selectedHoliday.holidayType}
              </p>
              <p>
                <strong>Branch:</strong> {selectedHoliday.branchDisplay}
              </p>
              <p>
                <strong>Recurring:</strong> {selectedHoliday.recurring ? 'Yes' : 'No'}
              </p>
              {!selectedHoliday.recurring && (
                <p>
                  <strong>Fixed Year:</strong> {selectedHoliday.fixedYear}
                </p>
              )}
            </div>
          )}

          {modalType === 'Delete' && selectedHoliday && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4d4f' }}>
                ⚠️ Are you sure you want to delete this holiday record?
              </p>
              <p>
                This action <strong>cannot be undone</strong>. The holiday record for "<strong>{selectedHoliday.description}</strong>" will be permanently removed.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
};

export default HolidayTypeTable;
