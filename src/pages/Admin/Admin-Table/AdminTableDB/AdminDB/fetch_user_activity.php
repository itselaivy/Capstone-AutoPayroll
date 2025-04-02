<?php
// Enable reporting of all PHP errors
error_reporting(E_ALL);
// Enable displaying errors in the output (for debugging)
ini_set('display_errors', 1);
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

// Define the database server name
$servername = "localhost";
// Define the database username
$dbusername = "root";
// Define the database password (empty in this case)
$dbpassword = "";
// Define the database name
$dbname = "autopayrolldb";

// Create a new MySQLi connection object with server, username, password, and database name
$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);

// Check if the database connection failed
if ($conn->connect_error) {
    // Log the connection error to the error log file
    error_log("Connection failed: " . $conn->connect_error);
    // Set HTTP response code to 500 (Internal Server Error)
    http_response_code(500);
    // Output a JSON-encoded error message with the connection error details
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    // Terminate script execution
    exit();
}

// Check if the request method is GET
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Get the page number from the query string, ensure it's at least 1
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    // Get the page size from the query string, ensure it's at least 1
    $pageSize = isset($_GET['pageSize']) ? max(1, (int)$_GET['pageSize']) : 10;
    // Calculate the offset for pagination ((page - 1) * pageSize)
    $offset = ($page - 1) * $pageSize;

    // Get the search term from the query string, default to empty string if not set
    $search = isset($_GET['search']) ? $_GET['search'] : '';
    // Get the activity type filter from the query string, default to empty string if not set
    $activityType = isset($_GET['activityType']) ? $_GET['activityType'] : '';
    // Get the date filter from the query string, default to empty string if not set
    $date = isset($_GET['date']) ? $_GET['date'] : '';

    // Initialize an array with a base condition to exclude null or empty activity types
    $whereConditions = ["ual.activity_type IS NOT NULL AND ual.activity_type != ''"];
    // Initialize an array to store query parameters
    $params = [];
    // Initialize a string to store parameter types
    $types = "";

    // Check if a search term is provided
    if ($search) {
        // Add a condition to search username or activity description
        $whereConditions[] = "(ua.Username LIKE ? OR ual.activity_description LIKE ?)";
        // Create a search parameter with wildcards
        $searchParam = "%$search%";
        // Add the search parameter to the parameters array (twice for username and description)
        $params[] = $searchParam;
        $params[] = $searchParam;
        // Add 'ss' (two strings) to the types string
        $types .= "ss";
    }

    // Check if an activity type filter is provided
    if ($activityType) {
        // Add a condition to filter by activity type
        $whereConditions[] = "ual.activity_type = ?";
        // Add the activity type to the parameters array
        $params[] = $activityType;
        // Add 's' (string) to the types string
        $types .= "s";
    }

    // Check if a date filter is provided
    if ($date) {
        // Add a condition to filter by the date portion of created_at
        $whereConditions[] = "DATE(ual.created_at) = ?";
        // Add the date to the parameters array
        $params[] = $date;
        // Add 's' (string) to the types string
        $types .= "s";
    }

    // Combine all where conditions with AND
    $whereClause = implode(" AND ", $whereConditions);

    // Define an SQL query to get the total count of logs
    $totalSql = "SELECT COUNT(*) as total FROM user_activity_logs ual 
                 LEFT JOIN UserAccounts ua ON ual.user_id = ua.UserID 
                 WHERE $whereClause";
    // Prepare the total count query
    $totalStmt = $conn->prepare($totalSql);
    // Check if the statement preparation failed
    if ($totalStmt === false) {
        // Log the preparation error to the error log file
        error_log("Total count prepare failed: " . $conn->error);
        // Set HTTP response code to 500 (Internal Server Error)
        http_response_code(500);
        // Output a JSON-encoded error message with the preparation error
        echo json_encode(["success" => false, "error" => "Total count prepare failed: " . $conn->error]);
        // Terminate script execution
        exit();
    }
    // Check if there are any parameters to bind
    if (!empty($params)) {
        // Bind the parameters to the prepared statement
        $totalStmt->bind_param($types, ...$params);
    }
    // Execute the prepared statement
    $totalStmt->execute();
    // Get the result set from the executed statement
    $totalResult = $totalStmt->get_result();
    // Fetch the total count as an associative array
    $totalRow = $totalResult->fetch_assoc();
    // Cast the total count to an integer
    $total = (int)$totalRow['total'];
    // Close the total count statement
    $totalStmt->close();

    // Define an SQL query to fetch paginated activity logs
    $sql = "
        SELECT 
            ual.log_id AS `key`,
            ual.user_id,
            ua.Username,
            ual.activity_type,
            ual.affected_table,
            ual.affected_record_id,
            ual.activity_description,
            ual.created_at
        FROM user_activity_logs ual
        LEFT JOIN UserAccounts ua ON ual.user_id = ua.UserID
        WHERE $whereClause
        ORDER BY ual.created_at DESC
        LIMIT ? OFFSET ?
    ";

    // Prepare the paginated query
    $stmt = $conn->prepare($sql);
    // Check if the statement preparation failed
    if ($stmt === false) {
        // Log the preparation error to the error log file
        error_log("Prepare failed: " . $conn->error);
        // Set HTTP response code to 500 (Internal Server Error)
        http_response_code(500);
        // Output a JSON-encoded error message with the preparation error
        echo json_encode(["success" => false, "error" => "Prepare failed: " . $conn->error]);
        // Terminate script execution
        exit();
    }

    // Add 'ii' (two integers) to the types string for LIMIT and OFFSET
    $types .= "ii";
    // Add the page size to the parameters array
    $params[] = $pageSize;
    // Add the offset to the parameters array
    $params[] = $offset;
    // Bind the parameters to the prepared statement
    $stmt->bind_param($types, ...$params);
    // Execute the prepared statement
    $stmt->execute();
    // Get the result set from the executed statement
    $result = $stmt->get_result();

    // Check if the query execution failed
    if ($result === false) {
        // Log the query error to the error log file
        error_log("Query failed: " . $conn->error);
        // Set HTTP response code to 500 (Internal Server Error)
        http_response_code(500);
        // Output a JSON-encoded error message with the query error
        echo json_encode(["success" => false, "error" => "Query failed: " . $conn->error]);
        // Terminate script execution
        exit();
    }

    // Initialize an array to store the fetched logs
    $logs = [];
    // Fetch each row from the result set
    while ($row = $result->fetch_assoc()) {
        // Format the created_at timestamp to a specific date-time format
        $row['created_at'] = date('Y-m-d H:i:s', strtotime($row['created_at']));
        // Add the row to the logs array
        $logs[] = $row;
    }

    // Log the fetched logs to the error log file for debugging
    error_log("Fetched logs: " . json_encode($logs));
    // Set HTTP response code to 200 (OK)
    http_response_code(200);
    // Output a JSON-encoded response with success flag, logs, and total count
    echo json_encode([
        "success" => true,
        "logs" => $logs,
        "total" => $total
    ]);

    // Close the prepared statement
    $stmt->close();
} else {
    // Set HTTP response code to 405 (Method Not Allowed)
    http_response_code(405);
    // Output a JSON-encoded error message indicating an unsupported method
    echo json_encode(["success" => false, "error" => "Method not allowed. Use GET."]);
}

// Close the database connection
$conn->close();
?>