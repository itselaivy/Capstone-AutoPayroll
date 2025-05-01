<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'php_errors.log');

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
            'branches' => 'BranchID',
            'cashadvance' => 'CashAdvanceID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        return $stmt->num_rows > 0;
    }

    function formatDate($date) {
        return (new DateTime($date))->format('m/d/Y');
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

    function getBranchNameById($conn, $branchId) {
        $stmt = $conn->prepare("SELECT BranchName FROM branches WHERE BranchID = ?");
        $stmt->bind_param("i", $branchId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $branchName = $row['BranchName'];
            $stmt->close();
            return $branchName;
        }
        $stmt->close();
        return "Branch ID $branchId";
    }

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;

            if ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
                $result = $conn->query($sql);
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    $data[] = $row;
                }
                echo json_encode($data);
            } elseif ($type == 'employees') {
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
            } elseif ($type == 'check_duplicate') {
                $date = isset($_GET['date']) ? $_GET['date'] : null;
                $employee_id = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
                $exclude_id = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;

                if (!$date || !$employee_id) {
                    throw new Exception("Date and employee_id are required for duplicate check.");
                }

                $sql = "SELECT COUNT(*) as count FROM cashadvance WHERE Date = ? AND EmployeeID = ?";
                $params = [$date, $employee_id];
                $types = "si";

                if ($exclude_id !== null) {
                    $sql .= " AND CashAdvanceID != ?";
                    $params[] = $exclude_id;
                    $types .= "i";
                }

                $stmt = $conn->prepare($sql);
                if (!$stmt) throw new Exception("Prepare failed for duplicate check: " . $conn->error);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $result = $stmt->get_result();
                $row = $result->fetch_assoc();
                $exists = $row['count'] > 0;
                $stmt->close();

                echo json_encode(["exists" => $exists]);
            } elseif ($type == 'payment_history') {
                $cash_advance_id = isset($_GET['cash_advance_id']) ? (int)$_GET['cash_advance_id'] : null;
                if (!$cash_advance_id || !$user_id || !$role) {
                    throw new Exception("cash_advance_id, user_id, and role are required for fetching payment history.");
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
                        echo json_encode(["success" => true, "data" => []]);
                        exit;
                    }

                    $stmt = $conn->prepare("
                        SELECT ual.created_at, ual.activity_description
                        FROM user_activity_logs ual
                        JOIN cashadvance ca ON ual.affected_record_id = ca.CashAdvanceID
                        WHERE ual.activity_type = 'UPDATE_DATA'
                        AND ual.affected_table = 'Cash Advance'
                        AND ual.affected_record_id = ?
                        AND ca.BranchID IN (" . implode(',', array_fill(0, count($allowedBranches), '?')) . ")
                        AND ual.activity_description LIKE '%(Payment:%'
                        ORDER BY ual.created_at DESC
                    ");
                    if (!$stmt) throw new Exception("Prepare failed for payment history query: " . $conn->error);
                    $types = "i" . str_repeat('i', count($allowedBranches));
                    $params = array_merge([$cash_advance_id], $allowedBranches);
                    $stmt->bind_param($types, ...$params);
                } else {
                    $stmt = $conn->prepare("
                        SELECT created_at, activity_description
                        FROM user_activity_logs
                        WHERE activity_type = 'UPDATE_DATA'
                        AND affected_table = 'Cash Advance'
                        AND affected_record_id = ?
                        AND activity_description LIKE '%(Payment:%'
                        ORDER BY created_at DESC
                    ");
                    if (!$stmt) throw new Exception("Prepare failed for payment history query: " . $conn->error);
                    $stmt->bind_param("i", $cash_advance_id);
                }

                $stmt->execute();
                $result = $stmt->get_result();
                $data = [];
                while ($row = $result->fetch_assoc()) {
                    preg_match('/\(Payment: ₱([\d,.]+)\)/', $row['activity_description'], $matches);
                    if (isset($matches[1])) {
                        $data[] = [
                            'date' => (new DateTime($row['created_at']))->format('m/d/Y'),
                            'amount' => str_replace(',', '', $matches[1])
                        ];
                    }
                }
                $stmt->close();

                echo json_encode(["success" => true, "data" => $data]);
            } else {
                throw new Exception("Invalid type specified");
            }
        } else {
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $branch_id = isset($_GET['branch_id']) ? (int)$_GET['branch_id'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for cash advance fetch.");
            }

            $offset = $page * $limit;

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
                            ca.CashAdvanceID,
                            ca.Date,
                            ca.EmployeeID,
                            e.EmployeeName,
                            ca.BranchID,
                            b.BranchName,
                            ca.Amount,
                            ca.Balance
                        FROM cashadvance ca
                        JOIN employees e ON ca.EmployeeID = e.EmployeeID
                        JOIN branches b ON ca.BranchID = b.BranchID
                        WHERE ca.BranchID IN (" . implode(',', array_fill(0, count($allowedBranches), '?')) . ")";
                $countSql = "SELECT COUNT(*) as total 
                            FROM cashadvance ca
                            WHERE ca.BranchID IN (" . implode(',', array_fill(0, count($allowedBranches), '?')) . ")";
                $types = str_repeat('i', count($allowedBranches));
                $params = $allowedBranches;

                if ($branch_id !== null) {
                    if (!in_array($branch_id, $allowedBranches)) {
                        throw new Exception("Selected branch is not assigned to this user.");
                    }
                    $sql .= " AND ca.BranchID = ?";
                    $countSql .= " AND ca.BranchID = ?";
                    $types .= "i";
                    $params[] = $branch_id;
                }
            } else {
                $sql = "SELECT 
                            ca.CashAdvanceID,
                            ca.Date,
                            ca.EmployeeID,
                            e.EmployeeName,
                            ca.BranchID,
                            b.BranchName,
                            ca.Amount,
                            ca.Balance
                        FROM cashadvance ca
                        JOIN employees e ON ca.EmployeeID = e.EmployeeID
                        JOIN branches b ON ca.BranchID = b.BranchID";
                $countSql = "SELECT COUNT(*) as total FROM cashadvance ca";
                $types = "";
                $params = [];

                if ($branch_id !== null) {
                    $sql .= " WHERE ca.BranchID = ?";
                    $countSql .= " WHERE ca.BranchID = ?";
                    $types .= "i";
                    $params[] = $branch_id;
                }
            }

            $sql .= " ORDER BY ca.Date DESC LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

            if ($types) {
                $stmt->bind_param($types, ...$params);
                $countTypes = substr($types, 0, -2);
                $countParams = array_slice($params, 0, -2);
                if ($countTypes) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
            }

            $countStmt->execute();
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            $stmt->execute();
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
            throw new Exception("User ID is required");
        }

        if (!empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["Amount"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID: Branch does not exist");
            }

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("INSERT INTO cashadvance (Date, EmployeeID, BranchID, Amount, Balance) VALUES (?, ?, ?, ?, ?)");
                $balance = $data["Balance"] ?? $data["Amount"];
                $stmt->bind_param("siidd", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["Amount"], $balance);

                if ($stmt->execute()) {
                    $cashAdvanceId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $formattedDate = formatDate($data["Date"]);
                    $description = "Cash Advance for '$employeeName' on '$formattedDate' added: Amount: ₱{$data['Amount']}, Balance: ₱{$balance}";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Cash Advance", $cashAdvanceId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $cashAdvanceId]);
                } else {
                    throw new Exception("Failed to add cash advance: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Missing required fields: " . 
                (!empty($data["Date"]) ? "" : "Date, ") . 
                (isset($data["EmployeeID"]) ? "" : "EmployeeID, ") . 
                (isset($data["BranchID"]) ? "" : "BranchID, ") . 
                (!empty($data["Amount"]) ? "" : "Amount"));
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("User ID is required");
        }

        if (!empty($data["CashAdvanceID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT Date, EmployeeID, BranchID, Amount, Balance FROM cashadvance WHERE CashAdvanceID = ?");
                $stmt->bind_param("i", $data["CashAdvanceID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Cash Advance record with ID {$data['CashAdvanceID']} not found.");
                }

                $changes = [];
                $employeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                $formattedDate = formatDate($currentRecord["Date"]);

                if (isset($data["Balance"]) && isset($data["PaymentAmount"])) {
                    // Payment update
                    $paymentAmount = $data["PaymentAmount"] ?? 0;
                    $changes[] = "Balance from '₱{$currentRecord['Balance']}' to '₱{$data['Balance']}' (Payment: ₱{$paymentAmount})";
                    $stmt = $conn->prepare("UPDATE cashadvance SET Balance = ? WHERE CashAdvanceID = ?");
                    $stmt->bind_param("di", $data["Balance"], $data["CashAdvanceID"]);
                    $description = "Cash Advance payment for '$employeeName' on '$formattedDate': " . implode('/ ', $changes);
                } else {
                    // Regular update
                    if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                        throw new Exception("Invalid EmployeeID");
                    }
                    if (!recordExists($conn, "branches", $data["BranchID"])) {
                        throw new Exception("Invalid BranchID: Branch does not exist");
                    }

                    if ($currentRecord["Date"] != $data["Date"]) {
                        $oldDate = formatDate($currentRecord["Date"]);
                        $newDate = formatDate($data["Date"]);
                        $changes[] = "Date from '$oldDate' to '$newDate'";
                    }
                    if ($currentRecord["EmployeeID"] != $data["EmployeeID"]) {
                        $oldEmployeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                        $newEmployeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                        $changes[] = "Employee from '$oldEmployeeName' to '$newEmployeeName'";
                    }
                    if ($currentRecord["BranchID"] != $data["BranchID"]) {
                        $oldBranchName = getBranchNameById($conn, $currentRecord["BranchID"]);
                        $newBranchName = getBranchNameById($conn, $data["BranchID"]);
                        $changes[] = "Branch from '$oldBranchName' to '$newBranchName'";
                    }
                    if ($currentRecord["Amount"] != $data["Amount"]) {
                        $changes[] = "Amount from '₱{$currentRecord['Amount']}' to '₱{$data['Amount']}'";
                    }
                    if ($currentRecord["Balance"] != $data["Balance"]) {
                        $changes[] = "Balance from '₱{$currentRecord['Balance']}' to '₱{$data['Balance']}'";
                    }

                    $stmt = $conn->prepare("UPDATE cashadvance SET Date = ?, EmployeeID = ?, BranchID = ?, Amount = ?, Balance = ? WHERE CashAdvanceID = ?");
                    $balance = $data["Balance"] ?? $data["Amount"];
                    $stmt->bind_param("siiddi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["Amount"], $balance, $data["CashAdvanceID"]);
                    $description = empty($changes)
                        ? "Cash Advance for '$employeeName' on '$formattedDate' updated: No changes made"
                        : "Cash Advance for '$employeeName' on '$formattedDate' updated: " . implode('/ ', $changes);
                }

                if ($stmt->execute()) {
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Cash Advance", $data["CashAdvanceID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update cash advance: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Cash Advance ID is required");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid JSON data");
        }

        $user_id = isset($data['user_id']) ? (int)$data['user_id'] : null;
        if (!$user_id) {
            throw new Exception("User ID is required");
        }

        if (!empty($data["CashAdvanceID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT Date, EmployeeID, Amount, Balance FROM cashadvance WHERE CashAdvanceID = ?");
                $stmt->bind_param("i", $data["CashAdvanceID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Cash Advance record with ID {$data['CashAdvanceID']} not found.");
                }

                $stmt = $conn->prepare("DELETE FROM cashadvance WHERE CashAdvanceID = ?");
                $stmt->bind_param("i", $data["CashAdvanceID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $formattedDate = formatDate($record["Date"]);
                    $description = "Cash Advance for '$employeeName' on '$formattedDate' deleted: Amount: ₱{$record['Amount']}, Balance: ₱{$record['Balance']}";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Cash Advance", $data["CashAdvanceID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete cash advance: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Cash Advance ID is required");
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