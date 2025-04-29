<?php
// Enable CORS for all origins
header("Access-Control-Allow-Origin: *");
// Set response content type to JSON
header("Content-Type: application/json");
// Disable caching
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

// Database connection details
$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

// Create a new MySQLi connection
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
// Check connection
if ($conn->connect_error) {
    http_response_code(500); // Set 500 Internal Server Error
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error])); // Send error response
}

// Get user_id and role from query parameters
$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$role = isset($_GET['role']) ? $_GET['role'] : null;

// Validate user_id and role
if (!$userId || !$role) {
    http_response_code(400); // Set 400 Bad Request
    echo json_encode(["error" => "user_id and role are required"]); // Send error response
    $conn->close();
    exit();
}

// Initialize stats array
$stats = [
    "branches" => 0,
    "employees" => 0,
    "onTimeToday" => 0,
    "lateToday" => 0,
];

// Base queries for stats
$branchesQuery = "SELECT COUNT(*) as branches FROM branches";
$employeesQuery = "SELECT COUNT(*) as employees FROM employees";
$onTimeQuery = "SELECT COUNT(*) as onTimeToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'On-Time'";
$lateQuery = "SELECT COUNT(*) as lateToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'Late'";

// Adjust queries for Payroll Staff role
if ($role === 'Payroll Staff') {
    // Get assigned branches for the user
    $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
    $branchStmt->bind_param("i", $userId);
    $branchStmt->execute();
    $branchResult = $branchStmt->get_result();
    $allowedBranches = [];
    while ($row = $branchResult->fetch_assoc()) {
        $allowedBranches[] = $row['BranchID'];
    }
    $branchStmt->close();

    // If no branches assigned, return zeros
    if (empty($allowedBranches)) {
        echo json_encode($stats);
        $conn->close();
        exit();
    }

    // Create placeholders for IN clause
    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
    // Adjust queries to filter by assigned branches
    $branchesQuery = "SELECT COUNT(*) as branches FROM branches WHERE BranchID IN ($placeholders)";
    $employeesQuery = "SELECT COUNT(*) as employees FROM employees WHERE BranchID IN ($placeholders)";
    $onTimeQuery = "SELECT COUNT(*) as onTimeToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'On-Time' AND BranchID IN ($placeholders)";
    $lateQuery = "SELECT COUNT(*) as lateToday FROM attendance WHERE DATE(Date) = CURDATE() AND TimeInStatus = 'Late' AND BranchID IN ($placeholders)";
}

// Execute queries based on role
if ($role === 'Payroll Staff') {
    // Prepare and bind parameters for branches
    $stmt = $conn->prepare($branchesQuery);
    $types = str_repeat('i', count($allowedBranches));
    $stmt->bind_param($types, ...$allowedBranches);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats["branches"] = (int)$result->fetch_assoc()['branches'];
    $stmt->close();

    // Prepare and bind parameters for employees
    $stmt = $conn->prepare($employeesQuery);
    $stmt->bind_param($types, ...$allowedBranches);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats["employees"] = (int)$result->fetch_assoc()['employees'];
    $stmt->close();

    // Prepare and bind parameters for on-time today
    $stmt = $conn->prepare($onTimeQuery);
    $stmt->bind_param($types, ...$allowedBranches);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats["onTimeToday"] = (int)$result->fetch_assoc()['onTimeToday'];
    $stmt->close();

    // Prepare and bind parameters for late today
    $stmt = $conn->prepare($lateQuery);
    $stmt->bind_param($types, ...$allowedBranches);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats["lateToday"] = (int)$result->fetch_assoc()['lateToday'];
    $stmt->close();
} else {
    // Execute queries without branch filtering for other roles
    if ($result = $conn->query($branchesQuery)) {
        $stats["branches"] = (int)$result->fetch_assoc()['branches'];
        $result->free();
    }
    if ($result = $conn->query($employeesQuery)) {
        $stats["employees"] = (int)$result->fetch_assoc()['employees'];
        $result->free();
    }
    if ($result = $conn->query($onTimeQuery)) {
        $stats["onTimeToday"] = (int)$result->fetch_assoc()['onTimeToday'];
        $result->free();
    }
    if ($result = $conn->query($lateQuery)) {
        $stats["lateToday"] = (int)$result->fetch_assoc()['lateToday'];
        $result->free();
    }
}

// Send JSON response with stats
echo json_encode($stats);
// Close database connection
$conn->close();
?>