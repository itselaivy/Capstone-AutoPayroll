<?php
// Enable reporting of all PHP errors
error_reporting(E_ALL);
// Disable displaying errors in the output
ini_set('display_errors', 0);
// Enable logging of errors to a file
ini_set('log_errors', 1);
// Specify the file where errors will be logged
ini_set('error_log', 'php_errors.log');

// Set header to allow cross-origin requests from any domain
header("Access-Control-Allow-Origin: *");
// Set header to allow GET and OPTIONS requests
header("Access-Control-Allow-Methods: GET, OPTIONS");
// Set header to allow Content-Type header in requests
header("Access-Control-Allow-Headers: Content-Type");
// Set header to specify that the response will be in JSON format
header("Content-Type: application/json");

// Check if the request method is OPTIONS (pre-flight request for CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Set HTTP response code to 200 (OK) for pre-flight request
    http_response_code(200);
    // Terminate script execution
    exit();
}

// Define database connection parameters
$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

// Create a new MySQLi connection object
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

// Check if the database connection failed
if ($conn->connect_error) {
    // Log the connection error to the error log file
    error_log("Connection failed: " . $conn->connect_error);
    // Set HTTP response code to 500 (Internal Server Error)
    http_response_code(500);
    // Output a JSON-encoded error message
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    // Terminate script execution
    exit();
}

// Get the type of data requested from the query string
$type = isset($_GET['type']) ? $_GET['type'] : '';

switch ($type) {
    case 'stats':
        // Fetch total users
        $totalUsersStmt = $conn->query("SELECT COUNT(*) as total FROM UserAccounts");
        $totalUsers = $totalUsersStmt->fetch_assoc()['total'];

        // Fetch System Administrators
        $systemAdminsStmt = $conn->query("SELECT COUNT(*) as total FROM UserAccounts WHERE Role = 'System Administrator'");
        $systemAdmins = $systemAdminsStmt->fetch_assoc()['total'];

        // Fetch Payroll Admins
        $payrollAdminsStmt = $conn->query("SELECT COUNT(*) as total FROM UserAccounts WHERE Role = 'Payroll Admin'");
        $payrollAdmins = $payrollAdminsStmt->fetch_assoc()['total'];

        // Fetch Payroll Staff
        $payrollStaffStmt = $conn->query("SELECT COUNT(*) as total FROM UserAccounts WHERE Role = 'Payroll Staff'");
        $payrollStaff = $payrollStaffStmt->fetch_assoc()['total'];

        // Output JSON response with stats
        echo json_encode([
            "totalUsers" => (int)$totalUsers,
            "systemAdmins" => (int)$systemAdmins,
            "payrollAdmins" => (int)$payrollAdmins,
            "payrollStaff" => (int)$payrollStaff
        ]);
        break;

    case 'monthly':
        // Fetch monthly activity data
        $year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
        $month = isset($_GET['month']) ? (int)$_GET['month'] : null;
        $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

        $query = "
            SELECT DATE(ual.created_at) as date,
                   SUM(CASE WHEN ual.activity_type = 'ADD_DATA' THEN 1 ELSE 0 END) as `add`,
                   SUM(CASE WHEN ual.activity_type = 'UPDATE_DATA' THEN 1 ELSE 0 END) as `update`,
                   SUM(CASE WHEN ual.activity_type = 'DELETE_DATA' THEN 1 ELSE 0 END) as `delete`
            FROM user_activity_logs ual
            LEFT JOIN UserAccounts ua ON ual.user_id = ua.UserID
            LEFT JOIN UserBranches ub ON ua.UserID = ub.UserID
            WHERE YEAR(ual.created_at) = ?
        ";
        $params = [$year];
        $types = "i";

        if ($month) {
            $query .= " AND MONTH(ual.created_at) = ?";
            $params[] = $month;
            $types .= "i";
        }
        if ($branch !== 'all') {
            $query .= " AND ub.BranchID = ?";
            $params[] = $branch;
            $types .= "i";
        }

        $query .= " GROUP BY DATE(ual.created_at)";
        $stmt = $conn->prepare($query);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $data = $result->fetch_all(MYSQLI_ASSOC);
        echo json_encode($data);
        $stmt->close();
        break;

    case 'trends':
        // Fetch yearly activity trends
        $year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
        $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

        $query = "
            SELECT MONTHNAME(ual.created_at) as month,
                   SUM(CASE WHEN ual.activity_type = 'ADD_DATA' THEN 1 ELSE 0 END) as `add`,
                   SUM(CASE WHEN ual.activity_type = 'UPDATE_DATA' THEN 1 ELSE 0 END) as `update`,
                   SUM(CASE WHEN ual.activity_type = 'DELETE_DATA' THEN 1 ELSE 0 END) as `delete`
            FROM user_activity_logs ual
            LEFT JOIN UserAccounts ua ON ual.user_id = ua.UserID
            LEFT JOIN UserBranches ub ON ua.UserID = ub.UserID
            WHERE YEAR(ual.created_at) = ?
        ";
        $params = [$year];
        $types = "i";

        if ($branch !== 'all') {
            $query .= " AND ub.BranchID = ?";
            $params[] = $branch;
            $types .= "i";
        }

        $query .= " GROUP BY MONTH(ual.created_at) ORDER BY MONTH(ual.created_at)";
        $stmt = $conn->prepare($query);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $data = $result->fetch_all(MYSQLI_ASSOC);
        echo json_encode($data);
        $stmt->close();
        break;

    case 'top_users':
        // Fetch top active users
        $year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
        $month = isset($_GET['month']) ? (int)$_GET['month'] : null;
        $branch = isset($_GET['branch']) ? $_GET['branch'] : 'all';

        $query = "
            SELECT ua.Username as username, COUNT(*) as activityCount
            FROM user_activity_logs ual
            JOIN UserAccounts ua ON ual.user_id = ua.UserID
            LEFT JOIN UserBranches ub ON ua.UserID = ub.UserID
            WHERE YEAR(ual.created_at) = ?
        ";
        $params = [$year];
        $types = "i";

        if ($month) {
            $query .= " AND MONTH(ual.created_at) = ?";
            $params[] = $month;
            $types .= "i";
        }
        if ($branch !== 'all') {
            $query .= " AND ub.BranchID = ?";
            $params[] = $branch;
            $types .= "i";
        }

        $query .= " GROUP BY ua.UserID, ua.Username ORDER BY activityCount DESC LIMIT 5";
        $stmt = $conn->prepare($query);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $data = $result->fetch_all(MYSQLI_ASSOC);
        echo json_encode($data);
        $stmt->close();
        break;

    default:
        // Handle invalid type parameter
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid type parameter"]);
        break;
}

// Close the database connection
$conn->close();
?>