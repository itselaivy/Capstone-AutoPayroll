<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("HTTP/1.1 200 OK");
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

try {
    $conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
    if ($conn->connect_error) {
        throw new Exception("Connection failed: " . $conn->connect_error);
    }

    function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description) {
        $stmt = $conn->prepare("
            INSERT INTO user_activity_logs (
                user_id, activity_type, affected_table, affected_record_id, activity_description, created_at
            ) VALUES (?, ?, ?, ?, ?, NOW())
        ");
        if (!$stmt) {
            error_log("Prepare failed for log: " . $conn->error);
            return false;
        }
        $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);
        $success = $stmt->execute();
        if (!$success) error_log("Log insert failed: " . $stmt->error);
        $stmt->close();
        return $success;
    }

    function recordExists($conn, $table, $id) {
        $idColumnMap = [
            'employees' => 'EmployeeID',
            'Loans' => 'LoanID',
            'branches' => 'BranchID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        if (!$stmt) {
            error_log("Prepare failed for recordExists: " . $conn->error);
            throw new Exception("Failed to check record existence: " . $conn->error);
        }
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    function getEmployeeNameById($conn, $employeeId) {
        $stmt = $conn->prepare("SELECT EmployeeName FROM employees WHERE EmployeeID = ?");
        if (!$stmt) {
            error_log("Prepare failed for getEmployeeNameById: " . $conn->error);
            throw new Exception("Failed to fetch employee name: " . $conn->error);
        }
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $employeeName = $row['EmployeeName'];
            $stmt->close();
            return $employeeName;
        }
        $stmt->close();
        return "Employee ID $employeeId";
    }

    function formatNumber($amount) {
        return number_format((float)$amount, 2, '.', '');
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $role = isset($_GET['role']) ? $_GET['role'] : null;
    $search = isset($_GET['search']) ? trim($_GET['search']) : '';

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'employees') {
                if (!$user_id || !$role) {
                    throw new Exception("user_id and role are required for fetching employees.");
                }

                if ($role === 'Payroll Staff') {
                    $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                    if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                    $branchStmt->bind_param("i", $user_id);
                    $branchStmt->execute();
                    $branchResult = $branchStmt->get_result();
                    $allowedBranches = [];
                    while ($row = $branchResult->fetch_assoc()) {
                        $allowedBranches[] = $row['BranchID'];
                    }
                    $branchStmt->close();

                    if (empty($allowedBranches)) {
                        echo json_encode([]);
                        exit;
                    }

                    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees WHERE BranchID IN ($placeholders)";
                    $stmt = $conn->prepare($sql);
                    if (!$stmt) throw new Exception("Prepare failed for employees query: " . $conn->error);
                    $types = str_repeat('i', count($allowedBranches));
                    $stmt->bind_param($types, ...$allowedBranches);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    $stmt->close();
                    echo json_encode($data);
                } else {
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees";
                    $result = $conn->query($sql);
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    echo json_encode($data);
                }
            } elseif ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
                $result = $conn->query($sql);
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $data[] = $row;
                }
                echo json_encode($data);
            } else {
                throw new Exception("Invalid type specified");
            }
        } else {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for loans fetch.");
            }

            $params = [];
            $types = '';
            $countParams = [];
            $countTypes = '';

            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) throw new Exception("Prepare failed for branch query: " . $conn->error);
                $branchStmt->bind_param("i", $user_id);
                $branchStmt->execute();
                $branchResult = $branchStmt->get_result();
                $allowedBranches = [];
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();

                if (empty($allowedBranches)) {
                    echo json_encode([
                        "success" => true,
                        "data" => [],
                        "total" => 0,
                        "page" => $page,
                        "limit" => $limit
                    ]);
                    exit;
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $countSql = "SELECT COUNT(DISTINCT l2.EmployeeID) as total 
                            FROM Loans l2
                            JOIN employees e2 ON l2.EmployeeID = e2.EmployeeID
                            WHERE e2.BranchID IN ($placeholders)";
                
                // Derived table for paginated EmployeeIDs
                $subquery = "SELECT DISTINCT l2.EmployeeID
                            FROM Loans l2
                            JOIN employees e2 ON l2.EmployeeID = e2.EmployeeID
                            WHERE e2.BranchID IN ($placeholders)";
                if ($branch_id) {
                    $subquery .= " AND e2.BranchID = ?";
                    $countSql .= " AND e2.BranchID = ?";
                    $params[] = $branch_id;
                    $countParams[] = $branch_id;
                    $types .= 'i';
                    $countTypes .= 'i';
                }
                if ($search) {
                    $subquery .= " AND (e2.EmployeeName LIKE ? OR l2.LoanKey LIKE ? OR l2.LoanType LIKE ?)";
                    $countSql .= " AND (e2.EmployeeName LIKE ? OR l2.LoanKey LIKE ? OR l2.LoanType LIKE ?)";
                    $searchParam = "%$search%";
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $types .= 'sss';
                    $countTypes .= 'sss';
                }
                $subquery .= " ORDER BY l2.EmployeeID LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= 'ii';

                $sql = "SELECT 
                            l.LoanID,
                            l.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            l.LoanKey,
                            l.LoanType,
                            l.Amount
                        FROM Loans l
                        JOIN employees e ON l.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        JOIN ($subquery) AS emp ON l.EmployeeID = emp.EmployeeID
                        ORDER BY l.EmployeeID";

                $countParams = array_merge($allowedBranches, $countParams);
                $countTypes = str_repeat('i', count($allowedBranches)) . $countTypes;
                $params = array_merge($allowedBranches, $params);
                $types = str_repeat('i', count($allowedBranches)) . $types;
            } else {
                $countSql = "SELECT COUNT(DISTINCT l2.EmployeeID) as total 
                            FROM Loans l2
                            JOIN employees e2 ON l2.EmployeeID = e2.EmployeeID";
                
                $subquery = "SELECT DISTINCT l2.EmployeeID
                            FROM Loans l2
                            JOIN employees e2 ON l2.EmployeeID = e2.EmployeeID";
                if ($branch_id) {
                    if (!recordExists($conn, 'branches', $branch_id)) {
                        throw new Exception("Invalid BranchID: Branch $branch_id does not exist.");
                    }
                    $subquery .= " WHERE e2.BranchID = ?";
                    $countSql .= " WHERE e2.BranchID = ?";
                    $params[] = $branch_id;
                    $countParams[] = $branch_id;
                    $types .= 'i';
                    $countTypes .= 'i';
                }
                if ($search) {
                    $where = $branch_id ? " AND" : " WHERE";
                    $subquery .= "$where (e2.EmployeeName LIKE ? OR l2.LoanKey LIKE ? OR l2.LoanType LIKE ?)";
                    $countSql .= "$where (e2.EmployeeName LIKE ? OR l2.LoanKey LIKE ? OR l2.LoanType LIKE ?)";
                    $searchParam = "%$search%";
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $params[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $countParams[] = $searchParam;
                    $types .= 'sss';
                    $countTypes .= 'sss';
                }
                $subquery .= " ORDER BY l2.EmployeeID LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= 'ii';

                $sql = "SELECT 
                            l.LoanID,
                            l.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            l.LoanKey,
                            l.LoanType,
                            l.Amount
                        FROM Loans l
                        JOIN employees e ON l.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        JOIN ($subquery) AS emp ON l.EmployeeID = emp.EmployeeID
                        ORDER BY l.EmployeeID";
            }

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
            if ($params) {
                $stmt->bind_param($types, ...$params);
            }

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);
            if ($countParams) {
                $countStmt->bind_param($countTypes, ...$countParams);
            }

            if (!$countStmt->execute()) {
                throw new Exception("Count query execution failed: " . $countStmt->error);
            }
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            if (!$stmt->execute()) {
                throw new Exception("Main query execution failed: " . $stmt->error);
            }
            $result = $stmt->get_result();
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            $stmt->close();

            echo json_encode([
                "success" => true,
                "data" => $data,
                "total" => $total,
                "page" => $page,
                "limit" => $limit
            ]);
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (isset($data["EmployeeID"]) && 
            !empty($data["LoanKey"]) && 
            !empty($data["LoanType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validKeys = ['Pag-Ibig', 'SSS'];
            if (!in_array($data["LoanKey"], $validKeys)) {
                throw new Exception("Invalid LoanKey");
            }

            $validTypes = ['Calamity', 'Salary'];
            if (!in_array($data["LoanType"], $validTypes)) {
                throw new Exception("Invalid LoanType");
            }

            $checkStmt = $conn->prepare("SELECT LoanID FROM Loans WHERE EmployeeID = ? AND LoanKey = ? AND LoanType = ?");
            $checkStmt->bind_param("iss", $data["EmployeeID"], $data["LoanKey"], $data["LoanType"]);
            $checkStmt->execute();
            $checkStmt->store_result();
            if ($checkStmt->num_rows > 0) {
                $checkStmt->close();
                echo json_encode([
                    "success" => false,
                    "warning" => "Warning: An employee with this loan record already exists."
                ]);
                exit;
            }
            $checkStmt->close();

            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                $branchStmt->bind_param("i", $user_id);
                $branchStmt->execute();
                $branchResult = $branchStmt->get_result();
                $allowedBranches = [];
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();

                $empStmt = $conn->prepare("SELECT BranchID FROM employees WHERE EmployeeID = ?");
                $empStmt->bind_param("i", $data["EmployeeID"]);
                $empStmt->execute();
                $empResult = $empStmt->get_result();
                $employeeBranch = $empResult->fetch_assoc()['BranchID'];
                $empStmt->close();

                if (!in_array($employeeBranch, $allowedBranches)) {
                    throw new Exception("Employee does not belong to an assigned branch");
                }
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("INSERT INTO Loans (EmployeeID, LoanKey, LoanType, Amount) VALUES (?, ?, ?, ?)");
                $stmt->bind_param("issd", $data["EmployeeID"], $data["LoanKey"], $data["LoanType"], $data["Amount"]);

                if ($stmt->execute()) {
                    $loanId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = "Loan '{$data["LoanKey"]} {$data["LoanType"]}' of ₱" . formatNumber($data["Amount"]) . " added for '$employeeName'";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Loans", $loanId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $loanId]);
                } else {
                    throw new Exception("Failed to add loan: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (!empty($data["LoanID"]) && 
            isset($data["EmployeeID"]) && 
            !empty($data["LoanKey"]) && 
            !empty($data["LoanType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validKeys = ['Pag-Ibig', 'SSS'];
            if (!in_array($data["LoanKey"], $validKeys)) {
                throw new Exception("Invalid LoanKey");
            }

            $validTypes = ['Calamity', 'Salary'];
            if (!in_array($data["LoanType"], $validTypes)) {
                throw new Exception("Invalid LoanType");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, LoanKey, LoanType, Amount FROM Loans WHERE LoanID = ?");
                $stmt->bind_param("i", $data["LoanID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Loan record with ID {$data["LoanID"]} not found.");
                }

                $changes = [];
                if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                    $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                    $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
                }
                if ($currentRecord["LoanKey"] != $data["LoanKey"]) {
                    $changes[] = "LoanKey from '{$currentRecord["LoanKey"]}' to '{$data["LoanKey"]}'";
                }
                if ($currentRecord["LoanType"] != $data["LoanType"]) {
                    $changes[] = "LoanType from '{$currentRecord["LoanType"]}' to '{$data["LoanType"]}'";
                }
                if ($currentRecord["Amount"] != $data["Amount"]) {
                    $changes[] = "Amount from '₱" . formatNumber($currentRecord["Amount"]) . "' to '₱" . formatNumber($data["Amount"]) . "'";
                }

                $stmt = $conn->prepare("UPDATE Loans SET EmployeeID = ?, LoanKey = ?, LoanType = ?, Amount = ? WHERE LoanID = ?");
                $stmt->bind_param("issdi", $data["EmployeeID"], $data["LoanKey"], $data["LoanType"], $data["Amount"], $data["LoanID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = empty($changes)
                        ? "Loan '{$data["LoanKey"]} {$data["LoanType"]}' for '$employeeName' updated: No changes made"
                        : "Loan '{$data["LoanKey"]} {$data["LoanType"]}' for '$employeeName' updated: " . implode('/ ', $changes);
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Loans", $data["LoanID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update loan: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("All fields are required");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("user_id is required");
        }

        if (!empty($data["LoanID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, LoanKey, LoanType, Amount FROM Loans WHERE LoanID = ?");
                $stmt->bind_param("i", $data["LoanID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Loan record with ID {$data["LoanID"]} not found.");
                }

                $stmt = $conn->prepare("DELETE FROM Loans WHERE LoanID = ?");
                $stmt->bind_param("i", $data["LoanID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $description = "Loan '{$record["LoanKey"]} {$record["LoanType"]}' of ₱" . formatNumber($record["Amount"]) . " deleted for '$employeeName'";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Loans", $data["LoanID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete loan: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Loan ID is required");
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log("Error in fetch_loans.php: " . $e->getMessage());
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>