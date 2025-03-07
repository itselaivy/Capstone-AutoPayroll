import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockOutlined, UserOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { Button, Form, Input, Card, Typography, Flex, Alert } from 'antd';
import '/Users/Yvanne/Auto/src/index.css';

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
                localStorage.setItem('userToken', 'authenticated');
                localStorage.setItem('role', data.role);
                localStorage.setItem('username', values.username);
                localStorage.setItem('userID', data.userID);

                setTimeout(() => {
                    navigate(data.role === 'admin' ? '/admin/' : '/user/');
                }, 100); // Ensure state updates before navigating
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
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            background: '#DCEFFF',
            fontFamily: 'Poppins, sans-serif'
        }}>
            <Card style={{ width: 600, textAlign: 'center', padding: 100 }}>
                <Title level={3} style={{ fontFamily: 'Poppins, sans-serif', fontSize: 45 }}>Login</Title>

                {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 24 }} />}

                <Form form={form} name="login" onFinish={onFinish} layout="vertical">
                    <Form.Item
                        label="Username"
                        name="username"
                        rules={[{ required: true, message: 'Please input your Username!' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="Username" />
                    </Form.Item>

                    <Form.Item
                        label="Password"
                        name="password"
                        rules={[{ required: true, message: 'Please input your Password!' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Password"
                            iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                        />
                    </Form.Item>

                    <Form.Item>
                        <Flex justify="flex-end">
                            <a href="#" style={{ fontFamily: 'Poppins, sans-serif', color: '#605F5F' }}>Forgot password?</a>
                        </Flex>
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
                                fontFamily: 'Poppins, sans-serif'
                            }}
                        >
                            Log in
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default Login;