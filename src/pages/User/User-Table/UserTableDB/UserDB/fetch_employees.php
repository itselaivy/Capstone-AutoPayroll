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
            } elseif ($type == 'allowances_deductions') {
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
    
                $allowanceStmt = $conn->prepare("SELECT AllowanceID, Description, Amount FROM Allowances WHERE EmployeeID = ?");
                $allowanceStmt->bind_param("i", $employeeId);
                $allowanceStmt->execute();
                $allowanceResult = $allowanceStmt->get_result();
                $allowances = [];
                while ($row = $allowanceResult->fetch_assoc()) {
                    $allowances[] = $row;
                }
                $allowanceStmt->close();
    
                $deductionStmt = $conn->prepare("SELECT DeductionID, DeductionType, Amount FROM Deductions WHERE EmployeeID = ?");
                $deductionStmt->bind_param("i", $employeeId);
                $deductionStmt->execute();
                $deductionResult = $deductionStmt->get_result();
                $deductions = [];
                while ($row = $deductionResult->fetch_assoc()) {
                    $deductions[] = $row;
                }
                $deductionStmt->close();
    
                echo json_encode([
                    "success" => true,
                    "allowances" => $allowances,
                    "deductions" => $deductions
                ]);
            } elseif ($type == 'check_duplicate') {
                $data = json_decode(file_get_contents("php://input"), true);
                $employeeName = isset($data['EmployeeName']) ? trim($data['EmployeeName']) : null;
                $branchId = isset($data['BranchID']) ? (int)$data['BranchID'] : null;
                $positionId = isset($data['PositionID']) ? (int)$data['PositionID'] : null;
                $memberSince = isset($data['MemberSince']) ? $data['MemberSince'] : null;
                $excludeEmployeeId = isset($data['ExcludeEmployeeID']) ? (int)$data['ExcludeEmployeeID'] : null;
    
                if (!$employeeName || !$branchId || !$positionId || !$memberSince) {
                    http_response_code(400);
                    echo json_encode(["success" => false, "error" => "EmployeeName, BranchID, PositionID, and MemberSince are required"]);
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
    
                $exists = checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince, $excludeEmployeeId);
                echo json_encode(["success" => true, "exists" => $exists]);
            } else {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid type specified"]);
            }
        } else {
            $page = isset($_GET['page']) ? max(0, (int)$_GET['page']) : 0;
            $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 10;
            $branch = isset($_GET['branch']) && $_GET['branch'] !== 'all' ? (int)$_GET['branch'] : null;
            $position = isset($_GET['position']) && $_GET['position'] !== 'all' ? (int)$_GET['position'] : null;
            $search = isset($_GET['search']) && !empty(trim($_GET['search'])) ? trim($_GET['search']) : null;
            $offset = $page * $limit;
    
            if (!$userId || !$role) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "user_id and role are required"]);
                exit();
            }
    
            error_log("GET Employees - UserID: $userId, Role: $role");
    
            if ($branch !== null && !recordExists($conn, 'branches', $branch)) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid branch ID"]);
                exit();
            }
    
            if ($position !== null && !recordExists($conn, 'positions', $position)) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid position ID"]);
                exit();
            }
    
            $sql = "SELECT 
                        e.EmployeeID AS `key`,
                        e.EmployeeName,
                        COALESCE(b.BranchName, 'N/A') AS BranchName,
                        COALESCE(p.PositionTitle, 'N/A') AS PositionTitle,
                        COALESCE(CONCAT(s.ShiftStart, ' - ', s.ShiftEnd), 'N/A') AS Schedule,
                        e.MemberSince,
                        e.BranchID,
                        e.PositionID,
                        e.ScheduleID
                    FROM 
                        Employees e
                    LEFT JOIN 
                        branches b ON e.BranchID = b.BranchID
                    LEFT JOIN 
                        positions p ON e.PositionID = p.PositionID
                    LEFT JOIN 
                        schedules s ON e.ScheduleID = s.ScheduleID
                    WHERE 1=1";
            $countSql = "SELECT COUNT(*) as total FROM Employees e 
                        LEFT JOIN branches b ON e.BranchID = b.BranchID 
                        LEFT JOIN positions p ON e.PositionID = p.PositionID 
                        LEFT JOIN schedules s ON e.ScheduleID = s.ScheduleID 
                        WHERE 1=1";
            $types = "";
            $params = [];
    
            if (strtolower($role) === 'payroll staff') {
                $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ?");
                if (!$branchStmt) {
                    error_log("Prepare failed for UserBranches: " . $conn->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to prepare branch query"]);
                    exit();
                }
                $branchStmt->bind_param("i", $userId);
                if (!$branchStmt->execute()) {
                    error_log("Execute failed for UserBranches: " . $branchStmt->error);
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => "Failed to execute branch query"]);
                    exit();
                }
                $branchResult = $branchStmt->get_result();
                $allowedBranches = [];
                while ($row = $branchResult->fetch_assoc()) {
                    $allowedBranches[] = $row['BranchID'];
                }
                $branchStmt->close();
            
                error_log("Payroll Staff - Allowed Branches: " . json_encode($allowedBranches));
            
                if (empty($allowedBranches)) {
                    error_log("Payroll Staff - No branches assigned, returning empty list");
                    echo json_encode([
                        "success" => true,
                        "employees" => [],
                        "total" => 0,
                        "page" => $page,
                        "limit" => $limit
                    ]);
                    exit();
                }
            
                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $sql .= " AND e.BranchID IN ($placeholders)";
                $countSql .= " AND e.BranchID IN ($placeholders)";
                $types .= str_repeat('i', count($allowedBranches));
                $params = array_merge($params, $allowedBranches);
            }
    
            if ($branch !== null) {
                $sql .= " AND e.BranchID = ?";
                $countSql .= " AND e.BranchID = ?";
                $types .= "i";
                $params[] = $branch;
            }
    
            if ($position !== null) {
                $sql .= " AND e.PositionID = ?";
                $countSql .= " AND e.PositionID = ?";
                $types .= "i";
                $params[] = $position;
            }
    
            if ($search !== null) {
                $sql .= " AND (e.EmployeeName LIKE ? OR COALESCE(b.BranchName, 'N/A') LIKE ? OR COALESCE(p.PositionTitle, 'N/A') LIKE ?)";
                $countSql .= " AND (e.EmployeeName LIKE ? OR COALESCE(b.BranchName, 'N/A') LIKE ? OR COALESCE(p.PositionTitle, 'N/A') LIKE ?)";
                $searchPattern = "%$search%";
                $types .= "sss";
                $params[] = $searchPattern;
                $params[] = $searchPattern;
                $params[] = $searchPattern;
            }
    
            $sql .= " ORDER BY e.EmployeeID DESC LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;
    
            error_log("SQL Query: $sql");
            error_log("Parameters: " . json_encode($params));
            error_log("Bind Types: $types");
    
            try {
                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }
                if ($types) {
                    $stmt->bind_param($types, ...$params);
                }
                if (!$stmt->execute()) {
                    throw new Exception("Execute failed: " . $stmt->error);
                }
                $result = $stmt->get_result();
    
                $countStmt = $conn->prepare($countSql);
                if (!$countStmt) {
                    throw new Exception("Prepare failed for count query: " . $conn->error);
                }
                $countTypes = substr($types, 0, -2);
                $countParams = array_slice($params, 0, -2);
                if ($countTypes) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
                if (!$countStmt->execute()) {
                    throw new Exception("Execute failed for count query: " . $stmt->error);
                }
                $countResult = $countStmt->get_result();
                $total = $countResult->fetch_assoc()['total'];
    
                $employees = [];
                while ($row = $result->fetch_assoc()) {
                    $employees[] = $row;
                }
    
                error_log("Employees Retrieved: " . count($employees));
    
                echo json_encode([
                    "success" => true,
                    "employees" => $employees,
                    "total" => $total,
                    "page" => $page,
                    "limit" => $limit
                ]);
                $stmt->close();
                $countStmt->close();
            } catch (Exception $e) {
                error_log("Query error: " . $e->getMessage() . " | SQL: $sql");
                http_response_code(500);
                echo json_encode(["success" => false, "error" => "Failed to execute query: " . $e->getMessage()]);
                exit();
            }
        }
        break;

    case "POST":
        $data = json_decode(file_get_contents("php://input"), true);
        $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
        $role = isset($data['role']) ? $data['role'] : null;

        if (!$userId || !$role) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "user_id and role are required"]);
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

        if (checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "An employee with these details already exists"]);
            exit();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("INSERT INTO Employees (EmployeeName, BranchID, PositionID, ScheduleID, MemberSince) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("siiis", $employeeName, $branchId, $positionId, $scheduleId, $memberSince);

            if ($stmt->execute()) {
                $employeeId = $conn->insert_id;
                logUserActivity($conn, $userId, "ADD_DATA", "Employees", $employeeId, "Employee '$employeeName' added");
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Employee added successfully", "id" => $employeeId]);
            } else {
                throw new Exception("Unable to add employee: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Insert error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        break;

    case "PUT":
        $data = json_decode(file_get_contents("php://input"), true);
        $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
        $role = isset($data['role']) ? $data['role'] : null;
        $employeeId = isset($data['EmployeeID']) ? (int)$data['EmployeeID'] : null;

        if (!$userId || !$role || !$employeeId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "EmployeeID, user_id, and role are required"]);
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

        if (!recordExists($conn, 'employees', $employeeId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid EmployeeID"]);
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

        if (checkDuplicateEmployee($conn, $employeeName, $branchId, $positionId, $memberSince, $employeeId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "An employee with these details already exists"]);
            exit();
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeName, BranchID, PositionID, ScheduleID, MemberSince FROM Employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $currentRecord = $result->fetch_assoc();
            $stmt->close();

            if (!$currentRecord) {
                throw new Exception("Employee with ID $employeeId not found");
            }

            $changes = [];
            if ($currentRecord['EmployeeName'] != $employeeName) {
                $changes[] = "EmployeeName from '{$currentRecord['EmployeeName']}' to '$employeeName'";
            }
            if ($currentRecord['BranchID'] != $branchId) {
                $oldBranchName = getBranchNameById($conn, $currentRecord['BranchID']);
                $newBranchName = getBranchNameById($conn, $branchId);
                $changes[] = "BranchName from '$oldBranchName' to '$newBranchName'";
            }
            if ($currentRecord['PositionID'] != $positionId) {
                $oldPositionTitle = getPositionTitleById($conn, $currentRecord['PositionID']);
                $newPositionTitle = getPositionTitleById($conn, $positionId);
                $changes[] = "PositionTitle from '$oldPositionTitle' to '$newPositionTitle'";
            }
            if ($currentRecord['ScheduleID'] != $scheduleId) {
                $oldSchedule = getScheduleById($conn, $currentRecord['ScheduleID']);
                $newSchedule = getScheduleById($conn, $scheduleId);
                $changes[] = "Schedule from '$oldSchedule' to '$newSchedule'";
            }
            if ($currentRecord['MemberSince'] != $memberSince) {
                $oldDate = formatDateToMMDDYYYY($currentRecord['MemberSince']);
                $newDate = formatDateToMMDDYYYY($memberSince);
                $changes[] = "MemberSince from '$oldDate' to '$newDate'";
            }

            $stmt = $conn->prepare("UPDATE Employees SET EmployeeName = ?, BranchID = ?, PositionID = ?, ScheduleID = ?, MemberSince = ? WHERE EmployeeID = ?");
            $stmt->bind_param("siiisi", $employeeName, $branchId, $positionId, $scheduleId, $memberSince, $employeeId);

            if ($stmt->execute()) {
                $description = empty($changes)
                    ? "Employee $employeeName details updated: No changes made"
                    : "Employee $employeeName details updated: " . implode(', ', $changes);
                logUserActivity($conn, $userId, "UPDATE_DATA", "Employees", $employeeId, $description);
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Employee updated successfully"]);
            } else {
                throw new Exception("Unable to update employee: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Update error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        break;

    case "DELETE":
        $data = json_decode(file_get_contents("php://input"), true);
        $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
        $employeeId = isset($data['EmployeeID']) ? (int)$data['EmployeeID'] : null;

        if (!$userId || !$employeeId) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "user_id and EmployeeID are required"]);
            exit();
        }

        if (!recordExists($conn, 'employees', $employeeId)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid EmployeeID"]);
            exit();
        }

        $role = isset($data['role']) ? $data['role'] : null;
        if ($role === 'Payroll Staff') {
            $stmt = $conn->prepare("SELECT BranchID FROM Employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $employee = $result->fetch_assoc();
            $branchId = $employee['BranchID'];
            $stmt->close();

            $branchStmt = $conn->prepare("SELECT BranchID FROM UserBranches WHERE UserID = ? AND BranchID = ?");
            $branchStmt->bind_param("ii", $userId, $branchId);
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
            $stmt = $conn->prepare("SELECT EmployeeName FROM Employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            $employee = $result->fetch_assoc();
            $employeeName = $employee['EmployeeName'];
            $stmt->close();

            $stmt = $conn->prepare("DELETE FROM Employees WHERE EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);

            if ($stmt->execute()) {
                logUserActivity($conn, $userId, "DELETE_DATA", "Employees", $employeeId, "Employee '$employeeName' deleted");
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Employee deleted successfully"]);
            } else {
                throw new Exception("Unable to delete employee: " . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Delete error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(["success" => false, "error" => "Method not allowed"]);
        break;
}

$conn->close();
?>