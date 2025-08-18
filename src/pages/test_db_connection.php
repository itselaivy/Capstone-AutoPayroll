<?php
include("Loginconfig.php");

if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}
echo "Database connected successfully!";
$conn->close();
