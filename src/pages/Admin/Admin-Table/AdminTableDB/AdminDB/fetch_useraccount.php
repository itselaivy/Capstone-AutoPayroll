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
// Set header to allow GET, POST, PUT, DELETE, and OPTIONS requests
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
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

// Define a function to log user activity into the user_activity_logs table
function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description) {
    // Prepare an SQL statement to insert activity log data
    $stmt = $conn->prepare("
        INSERT INTO user_activity_logs (
            user_id, activity_type, affected_table, affected_record_id, activity_description
        ) VALUES (?, ?, ?, ?, ?)
    ");
    // Check if the statement preparation failed
    if (!$stmt) {
        // Log the preparation error to the error log file
        error_log("Prepare failed for log: " . $conn->error);
        // Return false to indicate failure
        return false;
    }
    // Bind parameters to the prepared statement (integer, string, string, integer, string)
    $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);
    // Execute the prepared statement and store the result
    $success = $stmt->execute();
    // Check if the execution failed
    if (!$success) {
        // Log the execution error to the error log file
        error_log("Log insert failed: " . $stmt->error);
    }
    // Close the prepared statement
    $stmt->close();
    // Return the success status of the operation
    return $success;
}

// Define a function to convert branch IDs to branch names
function getBranchNames($conn, $branchIds) {
    // Check if the branch IDs array is empty
    if (empty($branchIds)) {
        // Return 'None' if no branch IDs are provided
        return 'None';
    }
    // Create a string of placeholders (e.g., ?,?,?) for the IN clause based on the number of branch IDs
    $placeholders = implode(',', array_fill(0, count($branchIds), '?'));
    // Prepare an SQL statement to select branch names from the Branches table
    $stmt = $conn->prepare("SELECT BranchName FROM Branches WHERE BranchID IN ($placeholders)");
    // Check if the statement preparation failed
    if (!$stmt) {
        // Log the preparation error to the error log file
        error_log("Prepare failed for branch names: " . $conn->error);
        // Return a pipe-separated string of branch IDs as a fallback
        return implode('|', $branchIds);
    }
    // Create a string of 'i' (integer) types based on the number of branch IDs
    $types = str_repeat('i', count($branchIds));
    // Bind the branch IDs to the prepared statement
    $stmt->bind_param($types, ...$branchIds);
    // Execute the prepared statement
    $stmt->execute();
    // Get the result set from the executed statement
    $result = $stmt->get_result();
    // Initialize an array to store branch names
    $names = [];
    // Fetch each row from the result set
    while ($row = $result->fetch_assoc()) {
        // Add the branch name to the names array
        $names[] = $row['BranchName'];
    }
    // Close the prepared statement
    $stmt->close();
    // Return the branch names as a pipe-separated string, or 'None' if empty
    return implode('|', $names) ?: 'None';
}

// Get the HTTP request method (e.g., GET, POST, PUT, DELETE)
$method = $_SERVER['REQUEST_METHOD'];

// Use a switch statement to handle different request methods
switch ($method) {
    case "GET":
        // Get the page number from the query string, default to 0 if not set
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
        // Get the page size from the query string, default to 10 if not set
        $size = isset($_GET['size']) ? (int)$_GET['size'] : 10;
        // Calculate the offset for pagination (page * size)
        $offset = $page * $size;

        // Get the branch filter from the query string, default to null if not set
        $branchFilter = isset($_GET['branch']) ? $_GET['branch'] : null;
        // Get the role filter from the query string, default to null if not set
        $roleFilter = isset($_GET['role']) ? $_GET['role'] : null;
        // Get the start date filter from the query string, default to null if not set
        $startDate = isset($_GET['startDate']) ? $_GET['startDate'] : null;
        // Get the end date filter from the query string, default to null if not set
        $endDate = isset($_GET['endDate']) ? $_GET['endDate'] : null;
        // Get the search term from the query string, default to null if not set
        $search = isset($_GET['search']) ? $_GET['search'] : null;

        // Define the base SQL query to select user account data with branch IDs
        $query = "
            SELECT SQL_CALC_FOUND_ROWS ua.*, GROUP_CONCAT(b.BranchID SEPARATOR '|') AS Branches
            FROM UserAccounts ua
            LEFT JOIN UserBranches ub ON ua.UserID = ub.UserID
            LEFT JOIN Branches b ON ub.BranchID = b.BranchID
            WHERE 1=1
        ";

        // Initialize an array to store query parameters
        $params = [];
        // Initialize a string to store parameter types
        $types = "";

        // Check if a branch filter is provided
        if ($branchFilter) {
            // Add a condition to filter by branch name
            $query .= " AND b.BranchName = ?";
            // Add the branch filter value to the parameters array
            $params[] = $branchFilter;
            // Add 's' (string) to the types string
            $types .= "s";
        }
        // Check if a role filter is provided
        if ($roleFilter) {
            // Add a condition to filter by role
            $query .= " AND ua.Role = ?";
            // Add the role filter value to the parameters array
            $params[] = $roleFilter;
            // Add 's' (string) to the types string
            $types .= "s";
        }
        // Check if a start date filter is provided
        if ($startDate) {
            // Add a condition to filter by creation date (greater than or equal)
            $query .= " AND ua.CreatedOn >= ?";
            // Add the start date value to the parameters array
            $params[] = $startDate;
            // Add 's' (string) to the types string
            $types .= "s";
        }
        // Check if an end date filter is provided
        if ($endDate) {
            // Add a condition to filter by creation date (less than or equal)
            $query .= " AND ua.CreatedOn <= ?";
            // Add the end date value to the parameters array
            $params[] = $endDate;
            // Add 's' (string) to the types string
            $types .= "s";
        }
        // Check if a search term is provided
        if ($search) {
            // Add a condition to search name or username fields
            $query .= " AND (ua.Name LIKE ? OR ua.Username LIKE ?)";
            // Add the search term with wildcards to the parameters array (twice for name and username)
            $params[] = "%$search%";
            $params[] = "%$search%";
            // Add 'ss' (two strings) to the types string
            $types .= "ss";
        }

        // Add pagination to the query (LIMIT and OFFSET)
        $query .= " GROUP BY ua.UserID LIMIT ?, ?";
        // Add the offset value to the parameters array
        $params[] = $offset;
        // Add the size value to the parameters array
        $params[] = $size;
        // Add 'ii' (two integers) to the types string
        $types .= "ii";

        // Prepare the SQL query with placeholders
        $stmt = $conn->prepare($query);
        // Check if there are any parameters to bind
        if ($types) {
            // Bind the parameters to the prepared statement
            $stmt->bind_param($types, ...$params);
        }
        // Execute the prepared statement
        $stmt->execute();
        // Get the result set from the executed statement
        $result = $stmt->get_result();
        // Fetch all rows from the result set as an associative array
        $data = $result->fetch_all(MYSQLI_ASSOC);

        // Execute a query to get the total number of rows (without LIMIT)
        $totalResult = $conn->query("SELECT FOUND_ROWS() as total");
        // Fetch the total count from the result
        $total = $totalResult->fetch_assoc()['total'];

        // Output a JSON-encoded response with success flag, data, and total count
        echo json_encode([
            "success" => true,
            "data" => $data,
            "total" => (int)$total
        ]);
        // Close the prepared statement
        $stmt->close();
        // Exit the switch case
        break;

    case "POST":
        // Decode the JSON input from the request body into an associative array
        $data = json_decode(file_get_contents("php://input"), true);
        // Get the current user ID from the input data and cast it to an integer
        $currentUserId = (int)$data["current_user_id"];
        // Prepare an SQL statement to insert a new user into UserAccounts
        $stmt = $conn->prepare("
            INSERT INTO UserAccounts (Name, Username, Role, Email, Password)
            VALUES (?, ?, ?, ?, ?)
        ");
        // Hash the provided password using the default algorithm
        $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
        // Bind parameters to the prepared statement (all strings)
        $stmt->bind_param("sssss", $data["name"], $data["username"], $data["role"], $data["email"], $hashedPassword);
        
        // Begin a database transaction
        $conn->begin_transaction();
        // Start a try block to handle exceptions
        try {
            // Execute the prepared statement to insert the user
            $stmt->execute();
            // Get the ID of the newly inserted user
            $userID = $conn->insert_id;
            
            // Check if branches are provided in the input data
            if (!empty($data["branches"])) {
                // Convert branch IDs to integers
                $branchIds = array_map('intval', $data["branches"]);
                // Remove duplicates from the branch IDs array
                $uniqueBranches = array_unique($branchIds);
                // Check if there are duplicates by comparing counts
                if (count($branchIds) !== count($uniqueBranches)) {
                    // Throw an exception if duplicates are detected
                    throw new Exception("Duplicate BranchIDs detected: " . implode("|", array_diff_key($branchIds, array_unique($branchIds))));
                }

                // Initialize an array to store valid branch IDs
                $validBranchIds = [];
                // Prepare a statement to validate branch IDs against the Branches table
                $stmtValid = $conn->prepare("SELECT BranchID FROM Branches WHERE BranchID IN (" . implode(',', array_fill(0, count($uniqueBranches), '?')) . ")");
                // Create a string of 'i' (integer) types based on the number of branches
                $types = str_repeat('i', count($uniqueBranches));
                // Bind the branch IDs to the prepared statement
                $stmtValid->bind_param($types, ...$uniqueBranches);
                // Execute the prepared statement
                $stmtValid->execute();
                // Get the result set from the executed statement
                $result = $stmtValid->get_result();
                // Fetch each valid branch ID from the result
                while ($row = $result->fetch_assoc()) {
                    // Add the valid branch ID to the array
                    $validBranchIds[] = $row['BranchID'];
                }
                // Close the validation statement
                $stmtValid->close();

                // Find any invalid branch IDs by comparing arrays
                $invalidBranches = array_diff($uniqueBranches, $validBranchIds);
                // Check if there are any invalid branch IDs
                if (!empty($invalidBranches)) {
                    // Throw an exception if invalid branch IDs are found
                    throw new Exception("Invalid BranchIDs: " . implode("|", $invalidBranches));
                }

                // Prepare a statement to insert user-branch associations
                $branchStmt = $conn->prepare("INSERT INTO UserBranches (UserID, BranchID) VALUES (?, ?)");
                // Loop through each unique branch ID
                foreach ($uniqueBranches as $branchID) {
                    // Bind the user ID and branch ID to the prepared statement
                    $branchStmt->bind_param("ii", $userID, $branchID);
                    // Execute the prepared statement to insert the association
                    $branchStmt->execute();
                }
                // Close the branch insertion statement
                $branchStmt->close();
            }
            
            // Create a description for the activity log
            $description = "{$data["username"]} has been added";
            // Log the user addition activity
            logUserActivity($conn, $currentUserId, "ADD_DATA", "UserAccounts", $userID, $description);
            // Commit the transaction if all operations succeed
            $conn->commit();
            // Output a JSON-encoded success message
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            // Roll back the transaction if an exception occurs
            $conn->rollback();
            // Log the error to the error log file
            error_log("POST failed: " . $e->getMessage());
            // Output a JSON-encoded error message with the exception details
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        // Close the prepared statement
        $stmt->close();
        // Exit the switch case
        break;

    case "PUT":
        // Decode the JSON input from the request body into an associative array
        $data = json_decode(file_get_contents("php://input"), true);
        // Check if required fields (current_user_id and UserID) are missing
        if (!isset($data["current_user_id"]) || !isset($data["UserID"])) {
            // Set HTTP response code to 400 (Bad Request)
            http_response_code(400);
            // Output a JSON-encoded error message indicating missing fields
            echo json_encode(["success" => false, "error" => "Current user ID and UserID required"]);
            // Terminate script execution
            exit();
        }

        // Get the user ID from the input data and cast it to an integer
        $userID = (int)$data["UserID"];
        // Get the current user ID from the input data and cast it to an integer
        $currentUserId = (int)$data["current_user_id"];
        
        // Begin a database transaction
        $conn->begin_transaction();
        // Start a try block to handle exceptions
        try {
            // Prepare a statement to select existing user data for comparison
            $stmt = $conn->prepare("SELECT Name, Username, Role, Email FROM UserAccounts WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $stmt->bind_param("i", $userID);
            // Execute the prepared statement
            $stmt->execute();
            // Fetch the existing user data as an associative array
            $oldData = $stmt->get_result()->fetch_assoc();
            // Close the prepared statement
            $stmt->close();

            // Initialize an array to store old branch IDs
            $oldBranches = [];
            // Prepare a statement to select existing branch IDs for the user
            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $branchStmt->bind_param("i", $userID);
            // Execute the prepared statement
            $branchStmt->execute();
            // Get the result set from the executed statement
            $result = $branchStmt->get_result();
            // Fetch each branch ID from the result
            while ($row = $result->fetch_assoc()) {
                // Add the branch ID to the oldBranches array
                $oldBranches[] = $row['BranchID'];
            }
            // Close the branch statement
            $branchStmt->close();

            // Initialize an array to store fields to update
            $updateFields = [];
            // Initialize an array to store parameter values
            $params = [];
            // Initialize a string to store parameter types
            $types = "";
            // Initialize an array to store changes for the activity log
            $changes = [];
            
            // Check if the name field has changed
            if (isset($data["name"]) && $data["name"] !== $oldData["Name"]) {
                // Add the name field to the update fields array
                $updateFields[] = "Name = ?";
                // Add the new name to the parameters array
                $params[] = $data["name"];
                // Add 's' (string) to the types string
                $types .= "s";
                // Add the name change to the changes array for logging
                $changes[] = "Name from '{$oldData["Name"]}' to '{$data["name"]}'";
            }
            // Check if the username field has changed
            if (isset($data["username"]) && $data["username"] !== $oldData["Username"]) {
                // Add the username field to the update fields array
                $updateFields[] = "Username = ?";
                // Add the new username to the parameters array
                $params[] = $data["username"];
                // Add 's' (string) to the types string
                $types .= "s";
                // Add the username change to the changes array for logging
                $changes[] = "Username from '{$oldData["Username"]}' to '{$data["username"]}'";
            }
            // Check if the role field has changed
            if (isset($data["role"]) && $data["role"] !== $oldData["Role"]) {
                // Add the role field to the update fields array
                $updateFields[] = "Role = ?";
                // Add the new role to the parameters array
                $params[] = $data["role"];
                // Add 's' (string) to the types string
                $types .= "s";
                // Add the role change to the changes array for logging
                $changes[] = "Role from '{$oldData["Role"]}' to '{$data["role"]}'";
            }
            // Check if the email field has changed
            if (isset($data["email"]) && $data["email"] !== $oldData["Email"]) {
                // Add the email field to the update fields array
                $updateFields[] = "Email = ?";
                // Add the new email to the parameters array
                $params[] = $data["email"];
                // Add 's' (string) to the types string
                $types .= "s";
                // Add the email change to the changes array for logging
                $changes[] = "Email from '{$oldData["Email"]}' to '{$data["email"]}'";
            }
            // Check if a new password is provided
            if (!empty($data["password"])) {
                // Hash the new password using the default algorithm
                $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
                // Add the password field to the update fields array
                $updateFields[] = "Password = ?";
                // Add the hashed password to the parameters array
                $params[] = $hashedPassword;
                // Add 's' (string) to the types string
                $types .= "s";
                // Add a generic password update message to the changes array
                $changes[] = "Password updated";
            }

            // Get the new branch IDs from the input data, default to empty array if not set
            $newBranches = !empty($data["branches"]) ? array_map('intval', $data["branches"]) : [];
            // Sort the old branch IDs for comparison
            sort($oldBranches);
            // Sort the new branch IDs for comparison
            sort($newBranches);
            // Check if the branches have changed
            if ($oldBranches != $newBranches) {
                // Get the old branch names using the getBranchNames function
                $oldBranchNames = getBranchNames($conn, $oldBranches);
                // Get the new branch names using the getBranchNames function
                $newBranchNames = getBranchNames($conn, $newBranches);
                // Add the branch change to the changes array for logging
                $changes[] = "Branches from '$oldBranchNames' to '$newBranchNames'";
            }

            // Check if there are any fields to update
            if (!empty($updateFields)) {
                // Construct the UPDATE query with the fields to update
                $query = "UPDATE UserAccounts SET " . implode(", ", $updateFields) . " WHERE UserID = ?";
                // Add the user ID to the parameters array
                $params[] = $userID;
                // Add 'i' (integer) to the types string
                $types .= "i";
                
                // Prepare the UPDATE statement
                $stmt = $conn->prepare($query);
                // Bind the parameters to the prepared statement
                $stmt->bind_param($types, ...$params);
                // Execute the prepared statement to update the user
                $stmt->execute();
                // Close the prepared statement
                $stmt->close();
            }

            // Prepare a statement to delete existing branch associations
            $stmtDelete = $conn->prepare("DELETE FROM UserBranches WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $stmtDelete->bind_param("i", $userID);
            // Execute the prepared statement to delete branches
            $stmtDelete->execute();
            // Close the delete statement
            $stmtDelete->close();

            // Check if new branches are provided
            if (!empty($data["branches"])) {
                // Convert branch IDs to integers
                $branchIds = array_map('intval', $data["branches"]);
                // Remove duplicates from the branch IDs array
                $uniqueBranches = array_unique($branchIds);
                // Check if there are duplicates by comparing counts
                if (count($branchIds) !== count($uniqueBranches)) {
                    // Throw an exception if duplicates are detected
                    throw new Exception("Duplicate BranchIDs detected: " . implode("|", array_diff_key($branchIds, array_unique($branchIds))));
                }

                // Initialize an array to store valid branch IDs
                $validBranchIds = [];
                // Prepare a statement to validate branch IDs against the Branches table
                $stmtValid = $conn->prepare("SELECT BranchID FROM Branches WHERE BranchID IN (" . implode(',', array_fill(0, count($uniqueBranches), '?')) . ")");
                // Create a string of 'i' (integer) types based on the number of branches
                $types = str_repeat('i', count($uniqueBranches));
                // Bind the branch IDs to the prepared statement
                $stmtValid->bind_param($types, ...$uniqueBranches);
                // Execute the prepared statement
                $stmtValid->execute();
                // Get the result set from the executed statement
                $result = $stmtValid->get_result();
                // Fetch each valid branch ID from the result
                while ($row = $result->fetch_assoc()) {
                    // Add the valid branch ID to the array
                    $validBranchIds[] = $row['BranchID'];
                }
                // Close the validation statement
                $stmtValid->close();

                // Find any invalid branch IDs by comparing arrays
                $invalidBranches = array_diff($uniqueBranches, $validBranchIds);
                // Check if there are any invalid branch IDs
                if (!empty($invalidBranches)) {
                    // Throw an exception if invalid branch IDs are found
                    throw new Exception("Invalid BranchIDs: " . implode("|", $invalidBranches));
                }

                // Prepare a statement to insert new user-branch associations
                $stmtBranches = $conn->prepare("INSERT INTO UserBranches (UserID, BranchID) VALUES (?, ?)");
                // Loop through each unique branch ID
                foreach ($uniqueBranches as $branchID) {
                    // Bind the user ID and branch ID to the prepared statement
                    $stmtBranches->bind_param("ii", $userID, $branchID);
                    // Execute the prepared statement to insert the association
                    $stmtBranches->execute();
                }
                // Close the branch insertion statement
                $stmtBranches->close();
            }

            // Determine the username to use in the log (new if updated, old if not)
            $username = isset($data["username"]) && $data["username"] !== $oldData["Username"] ? $data["username"] : $oldData["Username"];
            // Create a description for the activity log based on changes
            $description = !empty($changes) 
                ? "$username has been updated: " . implode(", ", $changes)
                : "$username has been updated: No fields changed";
            // Log the user update activity
            logUserActivity($conn, $currentUserId, "UPDATE_DATA", "UserAccounts", $userID, $description);
            // Commit the transaction if all operations succeed
            $conn->commit();
            // Output a JSON-encoded success message
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            // Roll back the transaction if an exception occurs
            $conn->rollback();
            // Log the error to the error log file
            error_log("PUT failed: " . $e->getMessage());
            // Output a JSON-encoded error message with the exception details
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        // Exit the switch case
        break;

    case "DELETE":
        // Decode the JSON input from the request body into an associative array
        $data = json_decode(file_get_contents("php://input"), true);
        // Get the user ID from the input data and cast it to an integer
        $userID = (int)$data["UserID"];
        // Get the current user ID from the input data and cast it to an integer
        $currentUserId = (int)$data["current_user_id"];
        
        // Begin a database transaction
        $conn->begin_transaction();
        // Start a try block to handle exceptions
        try {
            // Prepare a statement to select existing user data for logging
            $stmt = $conn->prepare("SELECT Name, Username, Role, Email FROM UserAccounts WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $stmt->bind_param("i", $userID);
            // Execute the prepared statement
            $stmt->execute();
            // Fetch the existing user data as an associative array
            $deletedData = $stmt->get_result()->fetch_assoc();
            // Close the prepared statement
            $stmt->close();

            // Prepare a statement to delete the user's branch associations
            $stmt = $conn->prepare("DELETE FROM UserBranches WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $stmt->bind_param("i", $userID);
            // Execute the prepared statement to delete branches
            $stmt->execute();
            // Close the prepared statement
            $stmt->close();

            // Prepare a statement to delete the user from UserAccounts
            $stmt = $conn->prepare("DELETE FROM UserAccounts WHERE UserID = ?");
            // Bind the user ID to the prepared statement
            $stmt->bind_param("i", $userID);
            // Execute the prepared statement to delete the user
            $stmt->execute();
            // Close the prepared statement
            $stmt->close();
            
            // Create a description for the activity log
            $description = "{$deletedData["Username"]} has been deleted";
            // Log the user deletion activity
            logUserActivity($conn, $currentUserId, "DELETE_DATA", "UserAccounts", $userID, $description);
            // Commit the transaction if all operations succeed
            $conn->commit();
            // Output a JSON-encoded success message
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            // Roll back the transaction if an exception occurs
            $conn->rollback();
            // Log the error to the error log file
            error_log("DELETE failed: " . $e->getMessage());
            // Output a JSON-encoded error message with the exception details
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        // Exit the switch case
        break;

    default:
        // Set HTTP response code to 405 (Method Not Allowed)
        http_response_code(405);
        // Output a JSON-encoded error message indicating an unsupported method
        echo json_encode(["success" => false, "error" => "Method not allowed"]);
        // Exit the switch case
        break;
}

// Close the database connection
$conn->close();
?>