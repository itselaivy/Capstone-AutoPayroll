import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography } from 'antd';

const { Title } = Typography;

const Login = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const onFinish = (values) => {
        setLoading(true);

        // Simulate authentication (replace with real API later)
        setTimeout(() => {
            setLoading(false);
            console.log('Login Successful:', values);

            // Save authentication token (mock example)
            localStorage.setItem('userToken', 'authenticated');

            // Redirect to dashboard
            navigate('/');
        }, 1000);
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            background: '#DCEFFF'
        }}>
            <Card style={{ width: 400, textAlign: 'center', padding: 20 }}>
                <Title level={3}>Login</Title>
                <Form name="loginForm" onFinish={onFinish} layout="vertical">
                    <Form.Item
                        label="Username"
                        name="username"
                        rules={[{ required: true, message: 'Please enter your username!' }]}
                    >
                        <Input placeholder="Enter your username" />
                    </Form.Item>

                    <Form.Item
                        label="Password"
                        name="password"
                        rules={[{ required: true, message: 'Please enter your password!' }]}
                    >
                        <Input.Password placeholder="Enter your password" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} block>
                            Login
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default Login;
