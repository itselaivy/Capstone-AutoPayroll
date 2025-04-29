<?php
error_reporting(E_ALL); // Enables reporting of all PHP errors
ini_set('display_errors', 0); // Disables displaying errors on screen
ini_set('log_errors', 1); // Enables logging of errors
ini_set('error_log', 'php_errors.log'); // Sets the file where errors are logged

header("Access-Control-Allow-Origin: *"); // Allows cross-origin requests from any domain
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS"); // Specifies allowed HTTP methods
header("Access-Control-Allow-Headers: Content-Type"); // Specifies allowed request headers
header("Content-Type: application/json"); // Sets response content type to JSON

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { // Handles CORS preflight requests
    http_response_code(200); // Sends success status for OPTIONS request
    exit(); // Exits script after handling preflight
}

$servername = "localhost"; // Defines database server hostname
$dbusername = "root"; // Defines database username
$dbpassword = ""; // Defines database password (empty in this case)
$dbname = "autopayrolldb"; // Defines database name

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname); // Creates new MySQLi connection
if ($conn->connect_error) { // Checks if database connection failed
    error_log("Connection failed: " . $conn->connect_error); // Logs connection error
    http_response_code(500); // Sets HTTP status to 500 (Internal Server Error)
    echo json_encode(["success" => false, "error" => "Database connection failed: " . $conn->connect_error]); // Sends error response
    exit(); // Exits script on connection failure
}

function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description) { // Defines function to log user activity
    $stmt = $conn->prepare("
        INSERT INTO user_activity_logs (
            user_id, activity_type, affected_table, affected_record_id, activity_description, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())
    "); // Prepares SQL to insert activity log
    if (!$stmt) { // Checks if prepare failed
        error_log("Prepare failed for log: " . $conn->error); // Logs prepare error
        return false; // Returns false on failure
    }
    $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description); // Binds parameters to statement
    $success = $stmt->execute(); // Executes the prepared statement
    if (!$success) error_log("Log insert failed: " . $stmt->error); // Logs error if execution fails
    $stmt->close(); // Closes the statement
    return $success; // Returns true if successful, false otherwise
}

$method = $_SERVER['REQUEST_METHOD']; // Gets the HTTP request method

switch ($method) { // Switches based on HTTP method
    case "GET": // Handles GET requests
        $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null; // Gets user_id from query string, casts to int
        $role = isset($_GET['role']) ? $_GET['role'] : null; // Gets role from query string

        error_log("GET Request - User ID: $user_id, Role: $role"); // Logs GET request details

        if (!$user_id || !$role) { // Checks if user_id or role is missing
            error_log("Missing user_id or role in GET request"); // Logs missing parameter error
            http_response_code(400); // Sets HTTP status to 400 (Bad Request)
            echo json_encode(["success" => false, "error" => "user_id and role are required"]); // Sends error response
            exit(); // Exits script
        }

        $data = []; // Initializes empty array for data

        try { // Starts try block for error handling
            if ($role === 'Payroll Staff') { // Checks if role is Payroll Staff
                error_log("Fetching assigned branches for Payroll Staff UserID: $user_id"); // Logs fetch action
                $stmt = $conn->prepare("
                    SELECT b.BranchID, b.BranchName, b.BranchAddress, b.BranchContact 
                    FROM UserBranches ub
                    JOIN Branches b ON ub.BranchID = b.BranchID
                    WHERE ub.UserID = ?
                "); // Prepares SQL to fetch assigned branches
                if (!$stmt) { // Checks if prepare failed
                    throw new Exception("Prepare failed for UserBranches query: " . $conn->error); // Throws exception on failure
                }
                $stmt->bind_param("i", $user_id); // Binds user_id to statement
                if (!$stmt->execute()) { // Checks if execution failed
                    throw new Exception("Execute failed for UserBranches query: " . $stmt->error); // Throws exception on failure
                }
                $result = $stmt->get_result(); // Gets query result
                $data = $result->fetch_all(MYSQLI_ASSOC); // Fetches all rows as associative array
                $stmt->close(); // Closes the statement

                error_log("Assigned branches result for UserID $user_id: " . json_encode($data)); // Logs result
            } else { // Handles all other roles
                error_log("Fetching all branches for role: $role"); // Logs fetch action
                $stmt = $conn->prepare("
                    SELECT BranchID, BranchName, BranchAddress, BranchContact 
                    FROM Branches
                "); // Prepares SQL to fetch all branches
                if (!$stmt) { // Checks if prepare failed
                    throw new Exception("Prepare failed for Branches query: " . $conn->error); // Throws exception on failure
                }
                if (!$stmt->execute()) { // Checks if execution failed
                    throw new Exception("Execute failed for Branches query: " . $stmt->error); // Throws exception on failure
                }
                $result = $stmt->get_result(); // Gets query result
                $data = $result->fetch_all(MYSQLI_ASSOC); // Fetches all rows as associative array
                $stmt->close(); // Closes the statement

                error_log("All branches result: " . json_encode($data)); // Logs result
            }

            echo json_encode(["success" => true, "data" => $data]); // Sends success response with data
        } catch (Exception $e) { // Catches exceptions
            error_log("Error in GET request: " . $e->getMessage()); // Logs error
            http_response_code(500); // Sets HTTP status to 500
            echo json_encode(["success" => false, "error" => $e->getMessage()]); // Sends error response
            exit(); // Exits script
        }
        break; // Ends GET case

    case "POST": // Handles POST requests
        $data = json_decode(file_get_contents("php://input"), true); // Parses JSON request body
        $user_id = isset($data["user_id"]) ? (int)$data["user_id"] : null; // Gets user_id, casts to int
        $branchName = $data["branchName"] ?? null; // Gets branchName, defaults to null if missing
        $branchAddress = $data["branchAddress"] ?? null; // Gets branchAddress, defaults to null if missing
        $branchContact = $data["branchContact"] ?? null; // Gets branchContact, defaults to null if missing

        if (!$user_id || !$branchName || !$branchAddress || !$branchContact) { // Checks for missing fields
            error_log("Missing required fields in POST request"); // Logs missing field error
            http_response_code(400); // Sets HTTP status to 400
            echo json_encode(["success" => false, "error" => "user_id, branchName, branchAddress, and branchContact are required"]); // Sends error response
            exit(); // Exits script
        }

        $conn->begin_transaction(); // Starts database transaction
        try { // Starts try block
            $stmt = $conn->prepare("
                INSERT INTO Branches (BranchName, BranchAddress, BranchContact)
                VALUES (?, ?, ?)
            "); // Prepares SQL to insert new branch
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error); // Throws exception if prepare fails
            $stmt->bind_param("sss", $branchName, $branchAddress, $branchContact); // Binds parameters
            $stmt->execute(); // Executes the insert
            $branch_id = $conn->insert_id; // Gets the inserted branch ID
            $stmt->close(); // Closes the statement

            logUserActivity($conn, $user_id, "ADD_DATA", "Branches", $branch_id, "Branch '$branchName' has been added"); // Logs add activity
            $conn->commit(); // Commits the transaction
            echo json_encode(["success" => true]); // Sends success response
        } catch (Exception $e) { // Catches exceptions
            $conn->rollback(); // Rolls back transaction on error
            error_log("POST failed: " . $e->getMessage()); // Logs error
            http_response_code(500); // Sets HTTP status to 500
            echo json_encode(["success" => false, "error" => $e->getMessage()]); // Sends error response
        }
        break; // Ends POST case

    case "PUT": // Handles PUT requests
        $data = json_decode(file_get_contents("php://input"), true); // Parses JSON request body
        $user_id = isset($data["user_id"]) ? (int)$data["user_id"] : null; // Gets user_id, casts to int
        $branchID = isset($data["branchID"]) ? (int)$data["branchID"] : null; // Gets branchID, casts to int
        $branchName = $data["branchName"] ?? null; // Gets branchName, defaults to null if missing
        $branchAddress = $data["branchAddress"] ?? null; // Gets branchAddress, defaults to null if missing
        $branchContact = $data["branchContact"] ?? null; // Gets branchContact, defaults to null if missing

        if (!$user_id || !$branchID || !$branchName || !$branchAddress || !$branchContact) { // Checks for missing fields
            error_log("Missing required fields in PUT request"); // Logs missing field error
            http_response_code(400); // Sets HTTP status to 400
            echo json_encode(["success" => false, "error" => "user_id, branchID, branchName, branchAddress, and branchContact are required"]); // Sends error response
            exit(); // Exits script
        }

        $conn->begin_transaction(); // Starts database transaction
        try { // Starts try block
            // Fetch current branch data before update
            $stmt = $conn->prepare("SELECT BranchName, BranchAddress, BranchContact FROM Branches WHERE BranchID = ?"); // Prepares SQL to fetch current branch
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error); // Throws exception if prepare fails
            $stmt->bind_param("i", $branchID); // Binds branchID
            $stmt->execute(); // Executes the query
            $result = $stmt->get_result(); // Gets query result
            $currentBranch = $result->fetch_assoc(); // Fetches current branch data
            $stmt->close(); // Closes the statement

            if (!$currentBranch) { // Checks if branch exists
                throw new Exception("Branch with ID $branchID not found"); // Throws exception if branch not found
            }

            // Build update description with old and new data
            $changes = []; // Initializes array for changes
            if ($currentBranch['BranchName'] !== $branchName) { // Checks if BranchName changed
                $changes[] = "Branch Name from '{$currentBranch['BranchName']}' to '$branchName'"; // Adds change with old and new values
            }
            if ($currentBranch['BranchAddress'] !== $branchAddress) { // Checks if BranchAddress changed
                $changes[] = "Branch Address from '{$currentBranch['BranchAddress']}' to '$branchAddress'"; // Adds change with old and new values
            }
            if ($currentBranch['BranchContact'] !== $branchContact) { // Checks if BranchContact changed
                $changes[] = "Branch Contact from '{$currentBranch['BranchContact']}' to '$branchContact'"; // Adds change with old and new values
            }
            $description = empty($changes) 
                ? "Branch '{$currentBranch['BranchName']}' has been updated: No changes made" 
                : "Branch '{$currentBranch['BranchName']}' has been updated: " . implode('/ ', $changes); // Constructs description, handles no-change case

            $stmt = $conn->prepare("
                UPDATE Branches 
                SET BranchName = ?, BranchAddress = ?, BranchContact = ?
                WHERE BranchID = ?
            "); // Prepares SQL to update branch
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error); // Throws exception if prepare fails
            $stmt->bind_param("sssi", $branchName, $branchAddress, $branchContact, $branchID); // Binds parameters
            $stmt->execute(); // Executes the update
            $stmt->close(); // Closes the statement

            logUserActivity($conn, $user_id, "UPDATE_DATA", "Branches", $branchID, $description); // Logs update with detailed description
            $conn->commit(); // Commits the transaction
            echo json_encode(["success" => true]); // Sends success response
        } catch (Exception $e) { // Catches exceptions
            $conn->rollback(); // Rolls back transaction on error
            error_log("PUT failed: " . $e->getMessage()); // Logs error
            http_response_code(500); // Sets HTTP status to 500
            echo json_encode(["success" => false, "error" => $e->getMessage()]); // Sends error response
        }
        break; // Ends PUT case

    case "DELETE": // Handles DELETE requests
        $data = json_decode(file_get_contents("php://input"), true); // Parses JSON request body
        $user_id = isset($data["user_id"]) ? (int)$data["user_id"] : null; // Gets user_id, casts to int
        $branchID = isset($data["branchID"]) ? (int)$data["branchID"] : null; // Gets branchID, casts to int

        if (!$user_id || !$branchID) { // Checks for missing fields
            error_log("Missing user_id or branchID in DELETE request"); // Logs missing field error
            http_response_code(400); // Sets HTTP status to 400
            echo json_encode(["success" => false, "error" => "user_id and branchID are required"]); // Sends error response
            exit(); // Exits script
        }

        $conn->begin_transaction(); // Starts database transaction
        try { // Starts try block
            $stmt = $conn->prepare("SELECT BranchName FROM Branches WHERE BranchID = ?"); // Prepares SQL to fetch branch name
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error); // Throws exception if prepare fails
            $stmt->bind_param("i", $branchID); // Binds branchID
            $stmt->execute(); // Executes the query
            $result = $stmt->get_result(); // Gets query result
            $branch = $result->fetch_assoc(); // Fetches branch data
            $branchName = $branch['BranchName'] ?? 'Unknown'; // Gets branch name, defaults to 'Unknown'
            $stmt->close(); // Closes the statement

            $stmt = $conn->prepare("DELETE FROM Branches WHERE BranchID = ?"); // Prepares SQL to delete branch
            if (!$stmt) throw new Exception("Prepare failed: " . $conn->error); // Throws exception if prepare fails
            $stmt->bind_param("i", $branchID); // Binds branchID
            $stmt->execute(); // Executes the delete
            $stmt->close(); // Closes the statement

            logUserActivity($conn, $user_id, "DELETE_DATA", "Branches", $branchID, "Branch '$branchName' has been deleted"); // Logs delete activity
            $conn->commit(); // Commits the transaction
            echo json_encode(["success" => true]); // Sends success response
        } catch (Exception $e) { // Catches exceptions
            $conn->rollback(); // Rolls back transaction on error
            error_log("DELETE failed: " . $e->getMessage()); // Logs error
            http_response_code(500); // Sets HTTP status to 500
            echo json_encode(["success" => false, "error" => $e->getMessage()]); // Sends error response
        }
        break; // Ends DELETE case

    default: // Handles unsupported methods
        error_log("Unsupported method: " . $method); // Logs unsupported method
        http_response_code(405); // Sets HTTP status to 405 (Method Not Allowed)
        echo json_encode(["success" => false, "error" => "Method not allowed"]); // Sends error response
        break; // Ends default case
}

$conn->close(); // Closes database connection
?>