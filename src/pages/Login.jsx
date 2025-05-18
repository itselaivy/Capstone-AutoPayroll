import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockOutlined, UserOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { Button, Form, Input, Card, Typography, Alert } from 'antd';
import '/Users/Yvanne/Auto/src/index.css';
import loginBG from '/Users/Yvanne/Auto/src/assets/loginBG.jpg';
import logo from '/Users/Yvanne/Auto/src/assets/logo.png';

const { Title } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const navigate = useNavigate();

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const onFinish = async (values) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost/Login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: values.username,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('userToken', 'authenticated'); // Match ProtectedRoute
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', values.username);
        localStorage.setItem('userId', data.userID);

        setTimeout(() => {
          if (data.role === 'System Administrator') {
            navigate('/admin/');
          } else if (data.role === 'Payroll Admin' || data.role === 'Payroll Staff') {
            navigate('/user/');
          } else {
            setError('Invalid role. Please contact support.');
          }
        }, 100);
      } else {
        setError(data.error || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-container"
      style={{
        display: 'flex',
        height: '100vh',
        backgroundImage: `url(${loginBG})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: 'Poppins, sans-serif',
      }}
    >
      <div
        className="left-section"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2vw',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            width: '100%',
            maxWidth: '30vw',
          }}
        >
          <img
            src={logo}
            alt="AutoPayroll Logo"
            className="logo"
            style={{
              width: '20vw',
              marginBottom: '1.5vw',
              marginLeft: '7vw',
            }}
          />
          <Title
            level={3}
            className="title"
            style={{
              fontFamily: 'Poppins, sans-serif',
              color: '#fff',
              margin: 0,
              marginLeft: '7vw',
            }}
          >
            AutoPayroll
          </Title>
        </div>
      </div>

      <div
        className="right-section"
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          padding: '2vw 5vw 2vw 2vw',
        }}
      >
        <Card
          className="login-card"
          style={{
            width: '100%',
            maxWidth: '40vw',
            textAlign: 'center',
            padding: '2.5vw 2.5vw',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '15px',
            marginRight: '120px',
          }}
        >
          <Title
            level={3}
            className="form-title"
            style={{
              fontFamily: 'Poppins, sans-serif',
              marginBottom: '3vw',
            }}
          >
            Login to your Account
          </Title>

          {error && (
            <div style={{ width: '70%', margin: '0 auto', marginBottom: '1.5vw' }}>
              <Alert
                message={error}
                type="error"
                showIcon
                style={{ width: '100%' }}
                className="centered-alert"
              />
            </div>
          )}

          <Form
            form={form}
            name="login"
            onFinish={onFinish}
            layout="vertical"
            style={{ width: '70%', margin: '0 auto' }}
            autoComplete="off"
          >
            <Form.Item
              name="username"
              label={
                <span className="form-label">
                  Username<span className="required-asterisk">*</span>
                </span>
              }
            >
              <Input
                prefix={<UserOutlined />}
                placeholder=""
                autoComplete="off"
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  padding: '0.6vw',
                  width: '100%',
                }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <span className="form-label">
                  Password<span className="required-asterisk">*</span>
                </span>
              }
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder=""
                autoComplete="new-password"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  padding: '0.6vw',
                  width: '100%',
                }}
              />
            </Form.Item>

            <Form.Item>
              <Button
                block
                type="primary"
                htmlType="submit"
                loading={loading}
                style={{
                  backgroundColor: '#019031',
                  borderColor: '#019031',
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  padding: '1vw',
                  width: '100%',
                }}
              >
                Log in
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default Login;