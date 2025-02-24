<?php
// Database connection details
$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayroll_usermanagment";

// Create database connection
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

// Check for connection error
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>
