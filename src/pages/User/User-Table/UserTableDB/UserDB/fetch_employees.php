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
    http_response_code(200);
    exit();
}

$servername = "localhost";
$dbusername = "root";
$dbpassword = "";
$dbname = "autopayrolldb";

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
if ($conn->connect_error) {
    error_log("Connection failed: " . $conn->connect_error);
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Connection failed: " . $conn->connect_error]);
    exit();
}

function recordExists($conn, $table, $id) {
    $idColumnMap = [
        'branches' => 'BranchID',
        'positions' => 'PositionID',
        'schedules' => 'ScheduleID',
        'employees' => 'EmployeeID'
    ];
    $idColumn = $idColumnMap[$table] ?? 'ID';
    $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->store_result();
    $exists = $stmt->num_rows > 0;
    $stmt->close();
    return $exists;
}

function checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince, $excludeEmployeeId = null) {
    $sql = "SELECT EmployeeID FROM Employees WHERE EmployeeName = ? AND BranchID = ? AND PositionID = ? AND MemberSince = ?";
    $types = "siis";
    $params = [$employeeName, $branchId, $positionId, $memberSince];

    if ($excludeEmployeeId !== null) {
        $sql .= " AND EmployeeID != ?";
        $types .= "i";
        $params[] = $excludeEmployeeId;
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->store_result();
    $exists = $stmt->num_rows > 0;
    $stmt->close();
    return $exists;
}

function logUserActivity($conn, $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description) {
    $stmt = $conn->prepare("
        INSERT INTO user_activity_logs (
            user_id, activity_type, affected_table, affected_record_id, activity_description
        ) VALUES (?, ?, ?, ?, ?)
    ");
    if (!$stmt) {
        error_log("Prepare failed for log: " . $conn->error);
        return false;
    }
    $stmt->bind_param("issis", $user_id, $activity_type, $affected_table, $affected_record_id, $activity_description);
    $success = $stmt->execute();
    if (!$success) {
        error_log("Log insert failed: " . $stmt->error);
    }
    $stmt->close();
    return $success;
}

function formatDateToMMDDYYYY($date) {
    $dateTime = new DateTime($date);
    return $dateTime->format('m/d/Y');
}

function getBranchNameById($conn, $branchId) {
    $stmt = $conn->prepare("SELECT BranchName FROM branches WHERE BranchID = ?");
    $stmt->bind_param("i", $branchId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $stmt->close();
        return $row['BranchName'];
    }
    $stmt->close();
    return "Branch ID $branchId";
}

function getPositionTitleById($conn, $positionId) {
    $stmt = $conn->prepare("SELECT PositionTitle FROM positions WHERE PositionID = ?");
    $stmt->bind_param("i", $positionId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $stmt->close();
        return $row['PositionTitle'];
    }
    $stmt->close();
    return "Position ID $positionId";
}

function getScheduleById($conn, $scheduleId) {
    $stmt = $conn->prepare("SELECT CONCAT(ShiftStart, ' - ', ShiftEnd) AS Schedule FROM schedules WHERE ScheduleID = ?");
    $stmt->bind_param("i", $scheduleId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $stmt->close();
        return $row['Schedule'];
    }
    $stmt->close();
    return "Schedule ID $scheduleId";
}

$method = $_SERVER['REQUEST_METHOD'];
$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$role = isset($_GET['role']) ? $_GET['role'] : null;

switch ($method) {
    case "GET":
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
                $result = $conn->query($sql);
                if ($result) {
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    echo json_encode($data);
                } else {
                    error_log("Failed to fetch branches: " . $conn->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to fetch branches"]);
                }
            } elseif ($type == 'positions') {
                $sql = "SELECT PositionID, PositionTitle FROM positions";
                $result = $conn->query($sql);
                if ($result) {
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    echo json_encode($data);
                } else {
                    error_log("Failed to fetch positions: " . $conn->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to fetch positions"]);
                }
            } elseif ($type == 'schedules') {
                $sql = "SELECT ScheduleID, ShiftStart, ShiftEnd FROM schedules";
                $result = $conn->query($sql);
                if ($result) {
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $data[] = $row;
                    }
                    echo json_encode($data);
                } else {
                    error_log("Failed to fetch schedules: " . $conn->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to fetch schedules"]);
                }
            } elseif ($type == 'employee_details') {
                $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
                if (!$employeeId) {
                    http_response_code(400);
                    echo json_encode(["success" => false, "error" => "EmployeeID is required"]);
                    exit();
                }
                if (!recordExists($conn, 'employees', $employeeId)) {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Employee not found"]);
                    exit();
                }
    
                // Fetch Allowances
                $allowanceStmt = $conn->prepare("SELECT AllowanceID, Description, Amount FROM Allowances WHERE EmployeeID = ?");
                $allowanceStmt->bind_param("i", $employeeId);
                $allowanceStmt->execute();
                $allowanceResult = $allowanceStmt->get_result();
                $allowances = [];
                while ($row = $allowanceResult->fetch_assoc()) {
                    $allowances[] = $row;
                }
                $allowanceStmt->close();
    
                // Fetch Deductions
                $deductionStmt = $conn->prepare("SELECT DeductionID, DeductionType, Amount FROM Deductions WHERE EmployeeID = ?");
                $deductionStmt->bind_param("i", $employeeId);
                $deductionStmt->execute();
                $deductionResult = $deductionStmt->get_result();
                $deductions = [];
                while ($row = $deductionResult->fetch_assoc()) {
                    $deductions[] = $row;
                }
                $deductionStmt->close();
    
                // Fetch Cash Advances
                $cashAdvanceStmt = $conn->prepare("SELECT CashAdvanceID, Date, Amount, Balance FROM CashAdvance WHERE EmployeeID = ?");
                $cashAdvanceStmt->bind_param("i", $employeeId);
                $cashAdvanceStmt->execute();
                $cashAdvanceResult = $cashAdvanceStmt->get_result();
                $cashAdvances = [];
                while ($row = $cashAdvanceResult->fetch_assoc()) {
                    $cashAdvances[] = [
                        'CashAdvanceID' => $row['CashAdvanceID'],
                        'Date' => $row['Date'],
                        'Amount' => $row['Amount'],
                        'Balance' => $row['Balance'] ?? $row['Amount'] // Ensure Balance is set to Amount initially
                    ];
                }
                $cashAdvanceStmt->close();
    
                // Fetch Rate per Hour
                $rateStmt = $conn->prepare("
                    SELECT p.RatePerHour 
                    FROM positions p 
                    JOIN employees e ON e.PositionID = p.PositionID 
                    WHERE e.EmployeeID = ?
                ");
                $rateStmt->bind_param("i", $employeeId);
                $rateStmt->execute();
                $rateResult = $rateStmt->get_result();
                $ratePerHour = $rateResult->fetch_assoc()['RatePerHour'] ?? null;
                $rateStmt->close();
    
                // Fetch Payment History
                if ($role === 'Payroll Staff') {
                    $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                    if (!$branchStmt) {
                        error_log("Prepare failed for branch query: " . $conn->error);
                        http_response_code(500);
                        echo json_encode(["success" => false, "error" => "Failed to prepare branch query"]);
                        exit();
                    }
                    $branchStmt->bind_param("i", $userId);
                    $branchStmt->execute();
                    $branchResult = $branchStmt->get_result();
                    $allowedBranches = [];
                    while ($row = $branchResult->fetch_assoc()) {
                        $allowedBranches[] = $row['BranchID'];
                    }
                    $branchStmt->close();
    
                    if (empty($allowedBranches)) {
                        $paymentHistory = [];
                    } else {
                        $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                        $paymentStmt = $conn->prepare("
                            SELECT ual.created_at, ual.activity_description, ca.Amount, ca.CashAdvanceID
                            FROM user_activity_logs ual
                            JOIN cashadvance ca ON ual.affected_record_id = ca.CashAdvanceID
                            WHERE ual.activity_type = 'UPDATE_DATA'
                            AND ual.affected_table = 'Cash Advance'
                            AND ca.EmployeeID = ?
                            AND ca.BranchID IN ($placeholders)
                            AND ual.activity_description LIKE '%(Payment:%'
                            ORDER BY ual.created_at DESC
                        ");
                        if (!$paymentStmt) {
                            error_log("Prepare failed for payment history query: " . $conn->error);
                            http_response_code(500);
                            echo json_encode(["success" => false, "error" => "Failed to prepare payment history query"]);
                            exit();
                        }
                        $types = "i" . str_repeat('i', count($allowedBranches));
                        $params = array_merge([$employeeId], $allowedBranches);
                        $paymentStmt->bind_param($types, ...$params);
                        $paymentStmt->execute();
                        $paymentResult = $paymentStmt->get_result();
                        $paymentHistory = [];
                        while ($row = $paymentResult->fetch_assoc()) {
                            preg_match('/\(Payment: ₱([\d,.]+)\)/', $row['activity_description'], $matches);
                            if (isset($matches[1])) {
                                $paymentHistory[] = [
                                    'date' => (new DateTime($row['created_at']))->format('m/d/Y'),
                                    'amount' => str_replace(',', '', $row['Amount']),
                                    'paid' => str_replace(',', '', $matches[1]),
                                    'cashAdvanceId' => $row['CashAdvanceID']
                                ];
                            }
                        }
                        $paymentStmt->close();
                    }
                } else {
                    $paymentStmt = $conn->prepare("
                        SELECT ual.created_at, ual.activity_description, ca.Amount, ca.CashAdvanceID
                        FROM user_activity_logs ual
                        JOIN cashadvance ca ON ual.affected_record_id = ca.CashAdvanceID
                        WHERE ual.activity_type = 'UPDATE_DATA'
                        AND ual.affected_table = 'Cash Advance'
                        AND ca.EmployeeID = ?
                        AND ual.activity_description LIKE '%(Payment:%'
                        ORDER BY ual.created_at DESC
                    ");
                    if (!$paymentStmt) {
                        error_log("Prepare failed for payment history query: " . $conn->error);
                        http_response_code(500);
                        echo json_encode(["success" => false, "error" => "Failed to prepare payment history query"]);
                        exit();
                    }
                    $paymentStmt->bind_param("i", $employeeId);
                    $paymentStmt->execute();
                    $paymentResult = $paymentStmt->get_result();
                    $paymentHistory = [];
                    while ($row = $paymentResult->fetch_assoc()) {
                        preg_match('/\(Payment: ₱([\d,.]+)\)/', $row['activity_description'], $matches);
                        if (isset($matches[1])) {
                            $paymentHistory[] = [
                                'date' => (new DateTime($row['created_at']))->format('m/d/Y'),
                                'amount' => str_replace(',', '', $row['Amount']),
                                'paid' => str_replace(',', '', $matches[1]),
                                'cashAdvanceId' => $row['CashAdvanceID']
                            ];
                        }
                    }
                    $paymentStmt->close();
                }
    
                echo json_encode([
                    "success" => true,
                    "allowances" => $allowances,
                    "deductions" => $deductions,
                    "rate_per_hour" => $ratePerHour,
                    "payment_history" => $paymentHistory,
                    "cash_advances" => $cashAdvances
                ]);
            } elseif ($type == 'check_duplicate') {
                $data = json_decode(file_get_contents("php://input"), true);
                $employeeName = isset($data['EmployeeName']) ? trim($data['EmployeeName']) : null;
                $branchId = isset($data['BranchID']) ? (int)$data['BranchID'] : null;
                $positionId = isset($data['PositionID']) ? (int)$data['PositionID'] : null;
                $memberSince = isset($data['MemberSince']) ? $data['MemberSince'] : null;
                $employeeId = isset($data['EmployeeID']) ? (int)$data['EmployeeID'] : null;

                if (!$employeeName || !$branchId || !$positionId || !$memberSince) {
                    http_response_code(400);
                    echo json_encode(["success" => false, "error" => "All fields are required for duplicate check"]);
                    exit();
                }

                $exists = checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince, $employeeId);
                echo json_encode(["success" => true, "exists" => $exists]);
            } else {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid type"]);
            }
        } else {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = $page * $limit;
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            $branch = isset($_GET['branch']) ? (int)$_GET['branch'] : null;
            $position = isset($_GET['position']) ? (int)$_GET['position'] : null;

            if (!$userId || !$role) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "user_id and role are required"]);
                exit();
            }

            $sql = "
                SELECT 
                    e.EmployeeID AS `key`,
                    e.EmployeeName,
                    b.BranchID,
                    b.BranchName,
                    p.PositionID,
                    p.PositionTitle,
                    s.ScheduleID,
                    CONCAT(s.ShiftStart, ' - ', s.ShiftEnd) AS Schedule,
                    e.MemberSince
                FROM employees e
                LEFT JOIN branches b ON e.BranchID = b.BranchID
                LEFT JOIN positions p ON e.PositionID = p.PositionID
                LEFT JOIN schedules s ON e.ScheduleID = s.ScheduleID
            ";
            $countSql = "SELECT COUNT(*) as total FROM employees e";
            $types = "";
            $params = [];

            if ($role === 'Payroll Staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) {
                    error_log("Prepare failed for branch query: " . $conn->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to prepare branch query"]);
                    exit();
                }
                $branchStmt->bind_param("i", $userId);
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
                        "employees" => [],
                        "total" => 0
                    ]);
                    exit();
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $sql .= " WHERE e.BranchID IN ($placeholders)";
                $countSql .= " WHERE e.BranchID IN ($placeholders)";
                $types .= str_repeat('i', count($allowedBranches));
                $params = array_merge($params, $allowedBranches);
            }

            if ($branch !== null) {
                $sql .= $role === 'Payroll Staff' ? " AND e.BranchID = ?" : " WHERE e.BranchID = ?";
                $countSql .= $role === 'Payroll Staff' ? " AND e.BranchID = ?" : " WHERE e.BranchID = ?";
                $types .= "i";
                $params[] = $branch;
            }

            if ($position !== null) {
                $sql .= " AND e.PositionID = ?";
                $countSql .= " AND e.PositionID = ?";
                $types .= "i";
                $params[] = $position;
            }

            if ($search) {
                $sql .= " AND (e.EmployeeName LIKE ? OR b.BranchName LIKE ? OR p.PositionTitle LIKE ?)";
                $countSql .= " AND e.EmployeeName LIKE ?";
                $searchParam = "%$search%";
                $types .= "sss";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                if (!$role || $role !== 'Payroll Staff') {
                    $types = substr($types, 0, -2);
                    $params = array_slice($params, 0, -2);
                }
            }

            $sql .= " ORDER BY e.EmployeeID LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;

            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                error_log("Prepare failed for main query: " . $conn->error);
                http_response_code(500);
                echo json_encode(["success" => false, "error" => "Failed to prepare query"]);
                exit();
            }

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) {
                error_log("Prepare failed for count query: " . $conn->error);
                http_response_code(500);
                echo json_encode(["success" => false, "error" => "Failed to prepare count query"]);
                exit();
            }

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
            $employees = [];
            while ($row = $result->fetch_assoc()) {
                $employees[] = $row;
            }
            $stmt->close();

            echo json_encode([
                "success" => true,
                "employees" => $employees,
                "total" => $total
            ]);
        }
        break;

    case "POST":
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid JSON data"]);
            exit();
        }

        if (!$userId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "User ID is required"]);
            exit();
        }

        $employeeName = isset($data['EmployeeName']) ? trim($data['EmployeeName']) : null;
        $branchId = isset($data['BranchID']) ? (int)$data['BranchID'] : null;
        $positionId = isset($data['PositionID']) ? (int)$data['PositionID'] : null;
        $scheduleId = isset($data['ScheduleID']) ? (int)$data['ScheduleID'] : null;
        $memberSince = isset($data['MemberSince']) ? $data['MemberSince'] : null;

        if (!$employeeName || !$branchId || !$positionId || !$scheduleId || !$memberSince) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "All fields are required"]);
            exit();
        }

        if (!recordExists($conn, 'branches', $branchId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid BranchID"]);
            exit();
        }
        if (!recordExists($conn, 'positions', $positionId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid PositionID"]);
            exit();
        }
        if (!recordExists($conn, 'schedules', $scheduleId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid ScheduleID"]);
            exit();
        }

        if ($role === 'Payroll Staff') {
            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ? AND BranchID = ?");
            $branchStmt->bind_param("ii", $userId, $branchId);
            $branchStmt->execute();
            $branchStmt->store_result();
            if ($branchStmt->num_rows === 0) {
                $branchStmt->close();
                http_response_code(403);
                echo json_encode(["success" => false, "error" => "You are not authorized to add employees to this branch"]);
                exit();
            }
            $branchStmt->close();
        }

        $exists = checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince);
        if ($exists) {
            http_response_code(400);
            echo json_encode(["success" => false, "warning" => "An employee with these details already exists"]);
            exit();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("
                INSERT INTO employees (EmployeeName, BranchID, PositionID, ScheduleID, MemberSince)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->bind_param("siiis", $employeeName, $branchId, $positionId, $scheduleId, $memberSince);
            $stmt->execute();
            $employeeId = $conn->insert_id;
            $stmt->close();

            $branchName = getBranchNameById($conn, $branchId);
            $positionTitle = getPositionTitleById($conn, $positionId);
            $schedule = getScheduleById($conn, $scheduleId);
            $description = "Added employee '$employeeName' to branch '$branchName' with position '$positionTitle', schedule '$schedule', member since '$memberSince'";
            logUserActivity($conn, $userId, "ADD_DATA", "employees", $employeeId, $description);

            $conn->commit();
            echo json_encode(["success" => true, "id" => $employeeId]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Insert employee failed: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => "Failed to add employee: " . $e->getMessage()]);
        }
        break;

    case "PUT":
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid JSON data"]);
            exit();
        }

        if (!$userId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "User ID is required"]);
            exit();
        }

        $employeeId = isset($data['EmployeeID']) ? (int)$data['EmployeeID'] : null;
        $employeeName = isset($data['EmployeeName']) ? trim($data['EmployeeName']) : null;
        $branchId = isset($data['BranchID']) ? (int)$data['BranchID'] : null;
        $positionId = isset($data['PositionID']) ? (int)$data['PositionID'] : null;
        $scheduleId = isset($data['ScheduleID']) ? (int)$data['ScheduleID'] : null;
        $memberSince = isset($data['MemberSince']) ? $data['MemberSince'] : null;

        if (!$employeeId || !$employeeName || !$branchId || !$positionId || !$scheduleId || !$memberSince) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "All fields are required"]);
            exit();
        }

        if (!recordExists($conn, 'employees', $employeeId)) {
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Employee not found"]);
            exit();
        }
        if (!recordExists($conn, 'branches', $branchId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid BranchID"]);
            exit();
        }
        if (!recordExists($conn, 'positions', $positionId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid PositionID"]);
            exit();
        }
        if (!recordExists($conn, 'schedules', $scheduleId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid ScheduleID"]);
            exit();
        }

        if ($role === 'Payroll Staff') {
            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ? AND BranchID = ?");
            $branchStmt->bind_param("ii", $userId, $branchId);
            $branchStmt->execute();
            $branchStmt->store_result();
            if ($branchStmt->num_rows === 0) {
                $branchStmt->close();
                http_response_code(403);
                echo json_encode(["success" => false, "error" => "You are not authorized to edit employees in this branch"]);
                exit();
            }
            $branchStmt->close();
        }

        $exists = checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince, $employeeId);
        if ($exists) {
            http_response_code(400);
            echo json_encode(["success" => false, "warning" => "An employee with these details already exists"]);
            exit();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("
                SELECT EmployeeName, BranchID, PositionID, ScheduleID, MemberSince
                FROM employees
                WHERE EmployeeID = ?
            ");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $current = $result->fetch_assoc();
            $stmt->close();

            $changes = [];
            if ($current['EmployeeName'] !== $employeeName) {
                $changes[] = "EmployeeName from '{$current['EmployeeName']}' to '$employeeName'";
            }
            if ($current['BranchID'] !== $branchId) {
                $oldBranch = getBranchNameById($conn, $current['BranchID']);
                $newBranch = getBranchNameById($conn, $branchId);
                $changes[] = "Branch from '$oldBranch' to '$newBranch'";
            }
            if ($current['PositionID'] !== $positionId) {
                $oldPosition = getPositionTitleById($conn, $current['PositionID']);
                $newPosition = getPositionTitleById($conn, $positionId);
                $changes[] = "Position from '$oldPosition' to '$newPosition'";
            }
            if ($current['ScheduleID'] !== $scheduleId) {
                $oldSchedule = getScheduleById($conn, $current['ScheduleID']);
                $newSchedule = getScheduleById($conn, $scheduleId);
                $changes[] = "Schedule from '$oldSchedule' to '$newSchedule'";
            }
            if ($current['MemberSince'] !== $memberSince) {
                $changes[] = "MemberSince from '{$current['MemberSince']}' to '$memberSince'";
            }

            $stmt = $conn->prepare("
                UPDATE employees
                SET EmployeeName = ?, BranchID = ?, PositionID = ?, ScheduleID = ?, MemberSince = ?
                WHERE EmployeeID = ?
            ");
            $stmt->bind_param("siiisi", $employeeName, $branchId, $positionId, $scheduleId, $memberSince, $employeeId);
            $stmt->execute();
            $stmt->close();

            $description = empty($changes)
                ? "Updated employee '$employeeName': No changes made"
                : "Updated employee '$employeeName': " . implode(', ', $changes);
            logUserActivity($conn, $userId, "UPDATE_DATA", "employees", $employeeId, $description);

            $conn->commit();
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Update employee failed: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => "Failed to update employee: " . $e->getMessage()]);
        }
        break;

    case "DELETE":
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid JSON data"]);
            exit();
        }

        if (!$userId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "User ID is required"]);
            exit();
        }

        $employeeId = isset($data['EmployeeID']) ? (int)$data['EmployeeID'] : null;
        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "EmployeeID is required"]);
            exit();
        }

        if (!recordExists($conn, 'employees', $employeeId)) {
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Employee not found"]);
            exit();
        }

        if ($role === 'Payroll Staff') {
            $branchStmt = $conn->prepare("
                SELECT e.BranchID
                FROM employees e
                JOIN UserBranches ub ON e.BranchID = ub.BranchID
                WHERE e.EmployeeID = ? AND ub.UserID = ?
            ");
            $branchStmt->bind_param("ii", $employeeId, $userId);
            $branchStmt->execute();
            $branchStmt->store_result();
            if ($branchStmt->num_rows === 0) {
                $branchStmt->close();
                http_response_code(403);
                echo json_encode(["success" => false, "error" => "You are not authorized to delete employees from this branch"]);
                exit();
            }
            $branchStmt->close();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeName, BranchID, PositionID, ScheduleID, MemberSince FROM employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $employee = $result->fetch_assoc();
            $stmt->close();

            $stmt = $conn->prepare("DELETE FROM employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $stmt->close();

            $branchName = getBranchNameById($conn, $employee['BranchID']);
            $positionTitle = getPositionTitleById($conn, $employee['PositionID']);
            $schedule = getScheduleById($conn, $employee['ScheduleID']);
            $description = "Deleted employee '{$employee['EmployeeName']}' from branch '$branchName' with position '$positionTitle', schedule '$schedule', member since '{$employee['MemberSince']}'";
            logUserActivity($conn, $userId, "DELETE_DATA", "employees", $employeeId, $description);

            $conn->commit();
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Delete employee failed: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => "Failed to delete employee: " . $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(["success" => false, "error" => "Method not allowed"]);
}

$conn->close();
?>