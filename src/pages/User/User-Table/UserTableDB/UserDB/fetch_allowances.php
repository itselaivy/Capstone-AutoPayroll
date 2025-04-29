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
            'allowances' => 'AllowanceID',
            'branches' => 'BranchID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        return $stmt->num_rows > 0;
    }

    function getEmployeeNameById($conn, $employeeId) {
        $stmt = $conn->prepare("SELECT EmployeeName FROM employees WHERE EmployeeID = ?");
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
                throw new Exception("user_id and role are required for allowances fetch.");
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
                    echo json_encode([
                        "success" => true,
                        "data" => [],
                        "total" => 0,
                        "page" => $page,
                        "limit" => $limit
                    ]);
                    exit;
                }

                $sql = "SELECT 
                            a.AllowanceID,
                            a.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            a.Description,
                            a.Amount
                        FROM allowances a
                        JOIN employees e ON a.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        WHERE e.BranchID IN (" . implode(',', array_fill(0, count($allowedBranches), '?')) . ")";
                $countSql = "SELECT COUNT(*) as total 
                            FROM allowances a
                            JOIN employees e ON a.EmployeeID = e.EmployeeID
                            WHERE e.BranchID IN (" . implode(',', array_fill(0, count($allowedBranches), '?')) . ")";

                if ($branch_id !== null) {
                    if (!in_array($branch_id, $allowedBranches)) {
                        throw new Exception("Selected branch is not assigned to this user.");
                    }
                    $sql .= " AND e.BranchID = ?";
                    $countSql .= " AND e.BranchID = ?";
                }

                $sql .= " LIMIT ? OFFSET ?";
                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

                $types = str_repeat('i', count($allowedBranches));
                $params = $allowedBranches;
                if ($branch_id !== null) {
                    $types .= 'i';
                    $params[] = $branch_id;
                }
                $types .= 'ii';
                $params[] = $limit;
                $params[] = $offset;

                $stmt->bind_param($types, ...$params);

                $countTypes = str_repeat('i', count($allowedBranches));
                $countParams = $allowedBranches;
                if ($branch_id !== null) {
                    $countTypes .= 'i';
                    $countParams[] = $branch_id;
                }
                $countStmt->bind_param($countTypes, ...$countParams);
            } else {
                $sql = "SELECT 
                            a.AllowanceID,
                            a.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            a.Description,
                            a.Amount
                        FROM allowances a
                        JOIN employees e ON a.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID";
                $countSql = "SELECT COUNT(*) as total FROM allowances a";

                if ($branch_id !== null) {
                    $sql .= " WHERE e.BranchID = ?";
                    $countSql .= " JOIN employees e ON a.EmployeeID = e.EmployeeID WHERE e.BranchID = ?";
                }

                $sql .= " LIMIT ? OFFSET ?";
                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

                if ($branch_id !== null) {
                    $stmt->bind_param("iii", $branch_id, $limit, $offset);
                    $countStmt->bind_param("i", $branch_id);
                } else {
                    $stmt->bind_param("ii", $limit, $offset);
                }
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
            !empty($data["Description"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

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
                $stmt = $conn->prepare("INSERT INTO allowances (EmployeeID, Description, Amount) VALUES (?, ?, ?)");
                $stmt->bind_param("isd", $data["EmployeeID"], $data["Description"], $data["Amount"]);

                if ($stmt->execute()) {
                    $allowanceId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = "Allowance '{$data["Description"]}' of ₱" . formatNumber($data["Amount"]) . " added for '$employeeName'";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Allowances", $allowanceId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $allowanceId]);
                } else {
                    throw new Exception("Failed to add allowance: " . $stmt->error);
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

        if (!empty($data["AllowanceID"]) && 
            isset($data["EmployeeID"]) && 
            !empty($data["Description"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, Description, Amount FROM allowances WHERE AllowanceID = ?");
                $stmt->bind_param("i", $data["AllowanceID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Allowance record with ID {$data["AllowanceID"]} not found.");
                }

                $changes = [];
                if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                    $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                    $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
                }
                if ($currentRecord["Description"] != $data["Description"]) {
                    $changes[] = "Description from '{$currentRecord["Description"]}' to '{$data["Description"]}'";
                }
                if ($currentRecord["Amount"] != $data["Amount"]) {
                    $changes[] = "Amount from '₱" . formatNumber($currentRecord["Amount"]) . "' to '₱" . formatNumber($data["Amount"]) . "'";
                }

                $stmt = $conn->prepare("UPDATE allowances SET EmployeeID = ?, Description = ?, Amount = ? WHERE AllowanceID = ?");
                $stmt->bind_param("isdi", $data["EmployeeID"], $data["Description"], $data["Amount"], $data["AllowanceID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = empty($changes)
                        ? "Allowance '{$data["Description"]}' for '$employeeName' updated: No changes made"
                        : "Allowance '{$data["Description"]}' for '$employeeName' updated: " . implode('/ ', $changes);
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Allowances", $data["AllowanceID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update allowance: " . $stmt->error);
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

        if (!empty($data["AllowanceID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, Description, Amount FROM allowances WHERE AllowanceID = ?");
                $stmt->bind_param("i", $data["AllowanceID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Allowance record with ID {$data["AllowanceID"]} not found.");
                }

                $stmt = $conn->prepare("DELETE FROM allowances WHERE AllowanceID = ?");
                $stmt->bind_param("i", $data["AllowanceID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $description = "Allowance '{$record["Description"]}' of ₱" . formatNumber($record["Amount"]) . " deleted for '$employeeName'";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Allowances", $data["AllowanceID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete allowance: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Allowance ID is required");
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?> 