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
            'deductions' => 'DeductionID',
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
                throw new Exception("user_id and role are required for deductions fetch.");
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

                if ($branch_id && !in_array($branch_id, $allowedBranches)) {
                    throw new Exception("Selected branch is not assigned to this user.");
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $sql = "SELECT 
                            d.DeductionID,
                            d.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            d.DeductionType,
                            d.Amount
                        FROM deductions d
                        JOIN employees e ON d.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID
                        WHERE e.BranchID IN ($placeholders)";
                $countSql = "SELECT COUNT(*) as total 
                            FROM deductions d
                            JOIN employees e ON d.EmployeeID = e.EmployeeID
                            WHERE e.BranchID IN ($placeholders)";

                $params = $allowedBranches;
                $types = str_repeat('i', count($allowedBranches));

                if ($branch_id) {
                    $sql .= " AND e.BranchID = ?";
                    $countSql .= " AND e.BranchID = ?";
                    $params[] = $branch_id;
                    $types .= 'i';
                }

                $sql .= " LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= 'ii';

                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

                $countParams = $branch_id ? array_merge($allowedBranches, [$branch_id]) : $allowedBranches;
                $countTypes = $branch_id ? str_repeat('i', count($allowedBranches)) . 'i' : str_repeat('i', count($allowedBranches));
                $countStmt->bind_param($countTypes, ...$countParams);

                $stmt->bind_param($types, ...$params);
            } else {
                $sql = "SELECT 
                            d.DeductionID,
                            d.EmployeeID,
                            e.EmployeeName,
                            e.BranchID,
                            b.BranchName,
                            d.DeductionType,
                            d.Amount
                        FROM deductions d
                        JOIN employees e ON d.EmployeeID = e.EmployeeID
                        JOIN branches b ON e.BranchID = b.BranchID";
                $countSql = "SELECT COUNT(*) as total 
                            FROM deductions d
                            JOIN employees e ON d.EmployeeID = e.EmployeeID";

                if ($branch_id) {
                    if (!recordExists($conn, 'branches', $branch_id)) {
                        throw new Exception("Invalid BranchID: Branch $branch_id does not exist.");
                    }
                    $sql .= " WHERE e.BranchID = ?";
                    $countSql .= " WHERE e.BranchID = ?";
                }

                $sql .= " LIMIT ? OFFSET ?";

                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);
                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

                $params = $branch_id ? [$branch_id, $limit, $offset] : [$limit, $offset];
                $types = $branch_id ? 'iii' : 'ii';
                $stmt->bind_param($types, ...$params);

                $countParams = $branch_id ? [$branch_id] : [];
                $countTypes = $branch_id ? 'i' : '';
                if ($countParams) {
                    $countStmt->bind_param($countTypes, ...$countParams);
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
            !empty($data["DeductionType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
            if (!in_array($data["DeductionType"], $validTypes)) {
                throw new Exception("Invalid DeductionType");
            }

            // Check for duplicate deduction
            $checkStmt = $conn->prepare("SELECT DeductionID FROM deductions WHERE EmployeeID = ? AND DeductionType = ?");
            $checkStmt->bind_param("is", $data["EmployeeID"], $data["DeductionType"]);
            $checkStmt->execute();
            $checkStmt->store_result();
            if ($checkStmt->num_rows > 0) {
                $checkStmt->close();
                echo json_encode([
                    "success" => false,
                    "warning" => "Warning: An employee with this deduction record already exists."
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
                $stmt = $conn->prepare("INSERT INTO deductions (EmployeeID, DeductionType, Amount) VALUES (?, ?, ?)");
                $stmt->bind_param("isd", $data["EmployeeID"], $data["DeductionType"], $data["Amount"]);

                if ($stmt->execute()) {
                    $deductionId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = "Deduction '{$data["DeductionType"]}' of ₱" . formatNumber($data["Amount"]) . " added for '$employeeName'";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Deductions", $deductionId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $deductionId]);
                } else {
                    throw new Exception("Failed to add deduction: " . $stmt->error);
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

        if (!empty($data["DeductionID"]) && 
            isset($data["EmployeeID"]) && 
            !empty($data["DeductionType"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }

            $validTypes = ['Pag-Ibig', 'SSS', 'PhilHealth'];
            if (!in_array($data["DeductionType"], $validTypes)) {
                throw new Exception("Invalid DeductionType");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, DeductionType, Amount FROM deductions WHERE DeductionID = ?");
                $stmt->bind_param("i", $data["DeductionID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Deduction record with ID {$data["DeductionID"]} not found.");
                }

                $changes = [];
                if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                    $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                    $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
                }
                if ($currentRecord["DeductionType"] != $data["DeductionType"]) {
                    $changes[] = "DeductionType from '{$currentRecord["DeductionType"]}' to '{$data["DeductionType"]}'";
                }
                if ($currentRecord["Amount"] != $data["Amount"]) {
                    $changes[] = "Amount from '₱" . formatNumber($currentRecord["Amount"]) . "' to '₱" . formatNumber($data["Amount"]) . "'";
                }

                $stmt = $conn->prepare("UPDATE deductions SET EmployeeID = ?, DeductionType = ?, Amount = ? WHERE DeductionID = ?");
                $stmt->bind_param("isdi", $data["EmployeeID"], $data["DeductionType"], $data["Amount"], $data["DeductionID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $description = empty($changes)
                        ? "Deduction '{$data["DeductionType"]}' for '$employeeName' updated: No changes made"
                        : "Deduction '{$data["DeductionType"]}' for '$employeeName' updated: " . implode('/ ', $changes);
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Deductions", $data["DeductionID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update deduction: " . $stmt->error);
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

        if (!empty($data["DeductionID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT EmployeeID, DeductionType, Amount FROM deductions WHERE DeductionID = ?");
                $stmt->bind_param("i", $data["DeductionID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Deduction record with ID {$data["DeductionID"]} not found.");
                }

                $stmt = $conn->prepare("DELETE FROM deductions WHERE DeductionID = ?");
                $stmt->bind_param("i", $data["DeductionID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $description = "Deduction '{$record["DeductionType"]}' of ₱" . formatNumber($record["Amount"]) . " deleted for '$employeeName'";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Deductions", $data["DeductionID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete deduction: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Deduction ID is required");
        }
    } else {
        throw new Exception("Method not allowed");
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log("Error in fetch_deductions.php: " . $e->getMessage());
    echo json_encode(["error" => $e->getMessage()]);
}

$conn->close();
?>