<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

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
        throw new Exception("Unable to connect to the database: " . $conn->connect_error);
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
            'branches' => 'BranchID',
            'employees' => 'EmployeeID',
            'attendance' => 'AttendanceID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        $result = $stmt->num_rows > 0;
        $stmt->close();
        return $result;
    }

    function attendanceExists($conn, $employeeId, $date) {
        $stmt = $conn->prepare("SELECT * FROM attendance WHERE EmployeeID = ? AND Date = ?");
        $stmt->bind_param("is", $employeeId, $date);
        $stmt->execute();
        $stmt->store_result();
        $result = $stmt->num_rows > 0;
        $stmt->close();
        return $result;
    }

    function getAttendanceRecord($conn, $employeeId, $date) {
        $stmt = $conn->prepare("SELECT AttendanceID, Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus, TotalHours FROM attendance WHERE EmployeeID = ? AND Date = ?");
        $stmt->bind_param("is", $employeeId, $date);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $stmt->close();
            return $row;
        }
        $stmt->close();
        return null;
    }

    function getEmployeeIdByName($conn, $employeeName) {
        $stmt = $conn->prepare("SELECT EmployeeID FROM employees WHERE EmployeeName = ?");
        $stmt->bind_param("s", $employeeName);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $employeeId = $row['EmployeeID'];
            $stmt->close();
            return $employeeId;
        }
        $stmt->close();
        return null;
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

    function getBranchIdByName($conn, $branchName) {
        $stmt = $conn->prepare("SELECT BranchID FROM branches WHERE BranchName = ?");
        $stmt->bind_param("s", $branchName);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $branchId = $row['BranchID'];
            $stmt->close();
            return $branchId;
        }
        $stmt->close();
        return null;
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

    function formatDate($date) {
        return (new DateTime($date))->format('m/d/Y');
    }

    function validateTime($time) {
        return preg_match("/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/", $time);
    }

    function computeHours($conn, $employeeId, $date) {
        $stmt = $conn->prepare("SELECT ROUND(TIME_TO_SEC(TIMEDIFF(TimeOut, TimeIn)) / 3600, 2) AS TotalHours FROM attendance WHERE EmployeeID = ? AND Date = ?");
        $stmt->bind_param("is", $employeeId, $date);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $stmt->close();
            return $row['TotalHours'];
        }
        $stmt->close();
        return 0;
    }

    function formatNumber($amount) {
        return number_format((float)$amount, 2, '.', '');
    }

    function getBasicPayFromDays($conn, $employeeId, $daysPresent) {
        try {
            if (!is_numeric($daysPresent) || $daysPresent < 0) {
                throw new Exception("Invalid days present: must be a non-negative number");
            }
            $stmt = $conn->prepare("SELECT p.HourlyMinimumWage FROM employees e JOIN positions p ON e.PositionID = p.PositionID WHERE e.EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $hourlyMinWage = floatval($row['HourlyMinimumWage']);
            } else {
                throw new Exception("No hourly wage found for employee");
            }
            $stmt->close();
            $dailyBasic = ($hourlyMinWage * 8) - 100.00; // Exclude transportation allowance
            $basicPay = $dailyBasic * $daysPresent;
            return number_format((float)$basicPay, 2, '.', '');
        } catch (Exception $e) {
            throw new Exception("Error calculating basic pay from days: " . $e->getMessage());
        }
    }

    function getPhilHealthContri($conn, $employeeId, $daysPresent = null) {
        try {
            $stmt = $conn->prepare("SELECT p.HourlyMinimumWage FROM employees e JOIN positions p ON e.PositionID = p.PositionID WHERE e.EmployeeID = ?");
            $stmt->bind_param("i", $employeeId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $hourlySalary = floatval($row['HourlyMinimumWage']);
            } else {
                throw new Exception("No hourly wage found for employee");
            }
            $stmt->close();
            $dailySalary = $hourlySalary * 8;
            $dailyBasic = $dailySalary - 100.00; // Exclude transportation allowance
            if ($daysPresent !== null) {
                $monthlyBasicPay = $dailyBasic * $daysPresent;
            } else {
                $monthlyFactor = 365 / 12;
                $monthlyBasicPay = $dailyBasic * $monthlyFactor;
            }
            $assessedSalary = min(max($monthlyBasicPay, 10000), 100000);
            $totalContriAmount = $assessedSalary * 0.05;
            $employeeShare = $totalContriAmount / 2;
            return number_format((float)$employeeShare, 2, '.', '');
        } catch (Exception $e) {
            throw new Exception("Error calculating PhilHealth contribution: " . $e->getMessage());
        }
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
            } else {
                throw new Exception("Invalid request type specified.");
            }
        } elseif (isset($_GET['year'])) {
            $year = (int)$_GET['year'];
            $month = isset($_GET['month']) && $_GET['month'] !== 'all' ? (int)$_GET['month'] : null;
            $branch = isset($_GET['branch']) && $_GET['branch'] !== 'all' ? (int)$_GET['branch'] : null;
            $employee = isset($_GET['employee']) && $_GET['employee'] !== 'all' ? (int)$_GET['employee'] : null;
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for attendance fetch.");
            }

            $sql = "SELECT 
                        a.EmployeeID, 
                        e.EmployeeName, 
                        a.BranchID, 
                        b.BranchName,
                        DAY(a.Date) AS day,
                        a.TimeInStatus,
                        a.TotalHours
                    FROM attendance a
                    JOIN employees e ON a.EmployeeID = e.EmployeeID
                    JOIN branches b ON a.BranchID = b.BranchID
                    WHERE YEAR(a.Date) = ?";
            $types = "i";
            $params = [$year];

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

                if ($branch !== null) {
                    if (!in_array($branch, $allowedBranches)) {
                        echo json_encode([]);
                        exit;
                    }
                    $sql .= " AND a.BranchID = ?";
                    $types .= "i";
                    $params[] = $branch;
                } else {
                    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                    $sql .= " AND a.BranchID IN ($placeholders)";
                    $types .= str_repeat('i', count($allowedBranches));
                    $params = array_merge($params, $allowedBranches);
                }
            } else {
                if ($branch !== null) {
                    $sql .= " AND a.BranchID = ?";
                    $types .= "i";
                    $params[] = $branch;
                }
            }

            if ($employee !== null) {
                $sql .= " AND a.EmployeeID = ?";
                $types .= "i";
                $params[] = $employee;
            }

            if ($month !== null) {
                $sql .= " AND MONTH(a.Date) = ?";
                $types .= "i";
                $params[] = $month;
            }

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Failed to prepare the database query: " . $conn->error);

            if ($types) {
                $stmt->bind_param($types, ...$params);
            } else {
                $stmt->bind_param("i", $year);
            }

            $stmt->execute();
            $result = $stmt->get_result();

            $employeeData = [];
            $daysInPeriod = $month !== null ? cal_days_in_month(CAL_GREGORIAN, $month, $year) : 365;

            while ($row = $result->fetch_assoc()) {
                $employeeId = $row['EmployeeID'];
                if (!isset($employeeData[$employeeId])) {
                    $employeeData[$employeeId] = [
                        'employee_id' => $employeeId,
                        'employee_name' => $row['EmployeeName'],
                        'branch_id' => $row['BranchID'],
                        'branch_name' => $row['BranchName'],
                        'days_present' => 0,
                        'basic_pay' => '0.00',
                        'philhealth_contribution' => '0.00',
                        'daily_attendance' => array_fill(1, $daysInPeriod, ['onTime' => 0, 'late' => 0])
                    ];
                }

                $day = (int)$row['day'];
                if ($row['TotalHours'] >= 8 && in_array($row['TimeInStatus'], ['On-Time', 'Late'])) {
                    $employeeData[$employeeId]['days_present']++;
                    $employeeData[$employeeId]['daily_attendance'][$day] = [
                        'onTime' => $row['TimeInStatus'] === 'On-Time' ? 1 : 0,
                        'late' => $row['TimeInStatus'] === 'Late' ? 1 : 0
                    ];
                }
            }

            $data = [];
            foreach ($employeeData as $emp) {
                try {
                    $emp['basic_pay'] = getBasicPayFromDays($conn, $emp['employee_id'], $emp['days_present']);
                    $emp['philhealth_contribution'] = getPhilHealthContri($conn, $emp['employee_id'], $emp['days_present']);
                } catch (Exception $e) {
                    $emp['error'] = $e->getMessage();
                }

                $emp['daily_attendance'] = array_map(function ($counts, $day) use ($year, $month) {
                    return [
                        'date' => sprintf("%d-%02d-%02d", $year, $month ?: 1, $day),
                        'onTime' => $counts['onTime'],
                        'late' => $counts['late']
                    ];
                }, $emp['daily_attendance'], array_keys($emp['daily_attendance']));
                $data[] = $emp;
            }

            if (empty($data)) {
                $data[] = [
                    'employee_id' => null,
                    'employee_name' => 'No Data',
                    'branch_id' => null,
                    'branch_name' => 'No Data',
                    'days_present' => 0,
                    'basic_pay' => '0.00',
                    'philhealth_contribution' => '0.00',
                    'daily_attendance' => array_map(function ($day) use ($year, $month) {
                        return [
                            'date' => sprintf("%d-%02d-%02d", $year, $month ?: 1, $day),
                            'onTime' => 0,
                            'late' => 0
                        ];
                    }, range(1, $daysInPeriod))
                ];
            }

            echo json_encode($data);
            $stmt->close();
        } else {
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $branch = isset($_GET['branch']) && $_GET['branch'] !== 'all' ? (int)$_GET['branch'] : null;
            $start_date = isset($_GET['start_date']) ? $_GET['start_date'] : null;
            $end_date = isset($_GET['end_date']) ? $_GET['end_date'] : null;
            $fetchAll = isset($_GET['all']) && $_GET['all'] == '1';

            error_log("Received parameters: user_id=$user_id, role=$role, page=$page, limit=$limit, branch=$branch, start_date=$start_date, end_date=$end_date");

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for attendance fetch.");
            }

            $offset = ($page - 1) * $limit;

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

                error_log("Allowed branches for user_id=$user_id: " . json_encode($allowedBranches));

                if (empty($allowedBranches)) {
                    echo json_encode([
                        "success" => true,
                        "data" => [],
                        "total" => 0,
                        "page" => $page,
                        "limit" => $limit
                    ]);
                    error_log("No branches assigned to user_id=$user_id");
                    exit;
                }

                $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                $sql = "SELECT
                            a.AttendanceID,
                            a.Date,
                            a.EmployeeID,
                            e.EmployeeName,
                            b.BranchName,
                            a.TimeIn,
                            a.TimeOut,
                            a.TotalHours,
                            a.TimeInStatus,
                            a.BranchID
                        FROM attendance a
                        JOIN employees e ON a.EmployeeID = e.EmployeeID
                        JOIN branches b ON a.BranchID = b.BranchID
                        WHERE a.BranchID IN ($placeholders)";
                $countSql = "SELECT COUNT(*) as total
                            FROM attendance a
                            WHERE a.BranchID IN ($placeholders)";
                $types = str_repeat('i', count($allowedBranches));
                $params = $allowedBranches;
            } else {
                $sql = "SELECT
                            a.AttendanceID,
                            a.Date,
                            a.EmployeeID,
                            e.EmployeeName,
                            b.BranchName,
                            a.TimeIn,
                            a.TimeOut,
                            a.TotalHours,
                            a.TimeInStatus,
                            a.BranchID
                        FROM attendance a
                        JOIN employees e ON a.EmployeeID = e.EmployeeID
                        JOIN branches b ON a.BranchID = b.BranchID
                        WHERE 1=1";
                $countSql = "SELECT COUNT(*) as total
                            FROM attendance a
                            WHERE 1=1";
                $types = "";
                $params = [];
            }

            if ($branch !== null) {
                $sql .= " AND a.BranchID = ?";
                $countSql .= " AND a.BranchID = ?";
                $types .= "i";
                $params[] = $branch;
            }

            if ($start_date && $end_date) {
                $sql .= " AND a.Date BETWEEN ? AND ?";
                $countSql .= " AND a.Date BETWEEN ? AND ?";
                $types .= "ss";
                $params[] = $start_date;
                $params[] = $end_date;
            }

            if (!$fetchAll) {
                $sql .= " ORDER BY a.Date DESC LIMIT ? OFFSET ?";
                $types .= "ii";
                $params[] = $limit;
                $params[] = $offset;
            } else {
                $sql .= " ORDER BY a.Date DESC";
            }

            error_log("SQL Query: $sql");
            error_log("Count SQL Query: $countSql");
            error_log("Parameter Types: $types");
            error_log("Parameters: " . json_encode($params));

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);

            if ($types) {
                $stmt->bind_param($types, ...$params);
            }

            if (!$stmt->execute()) {
                throw new Exception("Main query execution failed: " . $stmt->error);
            }
            $result = $stmt->get_result();
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }

            if ($fetchAll) {
                echo json_encode([
                    "success" => true,
                    "data" => $data,
                    "total" => count($data)
                ]);
                $stmt->close();
                exit;
            }

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);
            if ($types) {
                $countTypes = substr($types, 0, -2);
                $countParams = array_slice($params, 0, -2);
                if ($countTypes) {
                    $countStmt->bind_param($countTypes, ...$countParams);
                }
            }
            if (!$countStmt->execute()) {
                throw new Exception("Count query execution failed: " . $countStmt->error);
            }
            $countResult = $countStmt->get_result();
            $total = $countResult->fetch_assoc()['total'];
            $countStmt->close();

            echo json_encode([
                "success" => true,
                "data" => $data,
                "total" => $total,
                "page" => $page,
                "limit" => $limit
            ]);
            $stmt->close();
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;

        if (is_array($data) && isset($data[0])) {
            $successCount = 0;
            $updatedCount = 0;
            $duplicateCount = 0;
            $errors = [];
            $validRecords = 0;

            $conn->begin_transaction();
            try {
                foreach ($data as $index => $record) {
                    if (!isset($record["Date"]) || empty($record["Date"]) ||
                        !isset($record["TimeIn"]) || empty($record["TimeIn"]) ||
                        !isset($record["TimeOut"]) || empty($record["TimeOut"]) ||
                        !isset($record["TimeInStatus"]) || empty($record["TimeInStatus"])) {
                        $errors[] = "Row " . ($index + 1) . ": Missing required fields (Date, TimeIn, TimeOut, TimeInStatus).";
                        continue;
                    }

                    if (!validateTime($record["TimeIn"]) || !validateTime($record["TimeOut"])) {
                        $errors[] = "Row " . ($index + 1) . ": TimeIn and TimeOut must be in HH:mm format.";
                        continue;
                    }

                    $employeeId = null;
                    if (isset($record["EmployeeID"]) && !empty($record["EmployeeID"])) {
                        $employeeId = $record["EmployeeID"];
                    } elseif (isset($record["EmployeeName"]) && !empty($record["EmployeeName"])) {
                        $employeeId = getEmployeeIdByName($conn, $record["EmployeeName"]);
                        if (!$employeeId) {
                            $errors[] = "Row " . ($index + 1) . ": Employee '" . $record["EmployeeName"] . "' not found.";
                            continue;
                        }
                    } else {
                        $errors[] = "Row " . ($index + 1) . ": Employee information is required (either EmployeeID or EmployeeName).";
                        continue;
                    }

                    $branchId = null;
                    if (isset($record["BranchID"]) && !empty($record["BranchID"])) {
                        $branchId = $record["BranchID"];
                    } elseif (isset($record["BranchName"]) && !empty($record["BranchName"])) {
                        $branchId = getBranchIdByName($conn, $record["BranchName"]);
                        if (!$branchId) {
                            $errors[] = "Row " . ($index + 1) . ": Branch '" . $record["BranchName"] . "' not found.";
                            continue;
                        }
                    } else {
                        $errors[] = "Row " . ($index + 1) . ": Branch information is required (either BranchID or BranchName).";
                        continue;
                    }

                    if (!recordExists($conn, "employees", $employeeId)) {
                        $errors[] = "Row " . ($index + 1) . ": Invalid Employee ID: $employeeId.";
                        continue;
                    }
                    if (!recordExists($conn, "branches", $branchId)) {
                        $errors[] = "Row " . ($index + 1) . ": Invalid Branch ID: $branchId.";
                        continue;
                    }

                    $validRecords++;
                    $totalHours = computeHours($conn, $employeeId, $record["Date"]);

                    if (attendanceExists($conn, $employeeId, $record["Date"])) {
                        $existingRecord = getAttendanceRecord($conn, $employeeId, $record["Date"]);
                        $changes = [];
                        if ($existingRecord["BranchID"] != $branchId) {
                            $oldBranchName = getBranchNameById($conn, $existingRecord["BranchID"]);
                            $newBranchName = getBranchNameById($conn, $branchId);
                            $changes[] = "Branch from '$oldBranchName' to '$newBranchName'";
                        }
                        if ($existingRecord["TimeIn"] != $record["TimeIn"]) {
                            $changes[] = "TimeIn from '{$existingRecord["TimeIn"]}' to '{$record["TimeIn"]}'";
                        }
                        if ($existingRecord["TimeOut"] != $record["TimeOut"]) {
                            $changes[] = "TimeOut from '{$existingRecord["TimeOut"]}' to '{$record["TimeOut"]}'";
                        }
                        if ($existingRecord["TimeInStatus"] != $record["TimeInStatus"]) {
                            $changes[] = "TimeInStatus from '{$existingRecord["TimeInStatus"]}' to '{$record["TimeInStatus"]}'";
                        }
                        if ($existingRecord["TotalHours"] != $totalHours) {
                            $changes[] = "TotalHours from '{$existingRecord["TotalHours"]}' to '$totalHours'";
                        }

                        if (empty($changes)) {
                            $duplicateCount++;
                            continue;
                        }

                        $stmt = $conn->prepare("UPDATE attendance SET BranchID = ?, TimeIn = ?, TimeOut = ?, TotalHours = ?, TimeInStatus = ? WHERE AttendanceID = ?");
                        $stmt->bind_param("isssdi", $branchId, $record["TimeIn"], $record["TimeOut"], $totalHours, $record["TimeInStatus"], $existingRecord["AttendanceID"]);

                        if ($stmt->execute()) {
                            $updatedCount++;
                            $employeeName = getEmployeeNameById($conn, $employeeId);
                            $formattedDate = formatDate($record["Date"]);
                            $description = "Attendance for '$employeeName' on '$formattedDate' updated: " . implode('/ ', $changes);
                            logUserActivity($conn, $user_id, "UPDATE_DATA", "Attendance", $existingRecord["AttendanceID"], $description);
                        } else {
                            $errors[] = "Row " . ($index + 1) . ": Unable to update attendance record due to a database error.";
                        }
                        $stmt->close();
                    } else {
                        $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TotalHours, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmt->bind_param("siisssd", $record["Date"], $employeeId, $branchId, $record["TimeIn"], $record["TimeOut"], $totalHours, $record["TimeInStatus"]);

                        if ($stmt->execute()) {
                            $successCount++;
                            $attendanceId = $conn->insert_id;
                            $employeeName = getEmployeeNameById($conn, $employeeId);
                            $formattedDate = formatDate($record["Date"]);
                            $description = "Attendance for '$employeeName' on '$formattedDate' added";
                            logUserActivity($conn, $user_id, "ADD_DATA", "Attendance", $attendanceId, $description);
                        } else {
                            $errors[] = "Row " . ($index + 1) . ": Unable to add attendance record due to a database error.";
                        }
                        $stmt->close();
                    }
                }

                $description = "CSV upload: $successCount records added, $updatedCount records updated";
                logUserActivity($conn, $user_id, "UPLOAD_DATA", "Attendance", null, $description);

                $conn->commit();

                $response = [
                    "success" => true,
                    "successCount" => $successCount,
                    "updatedCount" => $updatedCount,
                ];

                if ($successCount === 0 && $updatedCount === 0) {
                    if ($validRecords > 0 && $duplicateCount === $validRecords) {
                        $response["allDuplicates"] = true;
                    } elseif (!empty($errors)) {
                        $response["errors"] = $errors;
                    } else {
                        $response["errors"] = ["No valid records were processed."];
                    }
                }

                echo json_encode($response);
            } catch (Exception $e) {
                $conn->rollback();
                throw new Exception("CSV upload failed: " . $e->getMessage());
            }
        } else {
            if (!isset($data["Date"]) || empty($data["Date"]) ||
                !isset($data["EmployeeID"]) || empty($data["EmployeeID"]) ||
                !isset($data["BranchID"]) || empty($data["BranchID"]) ||
                !isset($data["TimeIn"]) || empty($data["TimeIn"]) ||
                !isset($data["TimeOut"]) || empty($data["TimeOut"]) ||
                !isset($data["TotalHours"]) || empty($data["TotalHours"]) ||
                !isset($data["TimeInStatus"]) || empty($data["TimeInStatus"])) {
                throw new Exception("All fields are required to add an attendance record.");
            }

            if (!validateTime($data["TimeIn"]) || !validateTime($data["TimeOut"])) {
                throw new Exception("TimeIn and TimeOut must be in HH:mm format.");
            }

            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("The specified Employee ID does not exist.");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("The specified Branch ID does not exist.");
            }

            if (attendanceExists($conn, $data["EmployeeID"], $data["Date"])) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                $formattedDate = formatDate($data["Date"]);
                throw new Exception("An attendance record for $employeeName on $formattedDate already exists.");
            }

            $totalHours = computeHours($conn, $data["EmployeeID"], $data["Date"]);

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TotalHours, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->bind_param("siisssd", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $totalHours, $data["TimeInStatus"]);

                if ($stmt->execute()) {
                    $attendanceId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $formattedDate = formatDate($data["Date"]);
                    $description = "Attendance for '$employeeName' on '$formattedDate' added";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Attendance", $attendanceId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Attendance record added successfully.", "id" => $attendanceId]);
                } else {
                    throw new Exception("Unable to add the attendance record due to a database error.");
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;

        if (!empty($data["AttendanceID"]) &&
            !empty($data["Date"]) &&
            isset($data["EmployeeID"]) &&
            isset($data["BranchID"]) &&
            !empty($data["TimeIn"]) &&
            !empty($data["TimeOut"]) &&
            !empty($data["TimeInStatus"])) {

            if (!validateTime($data["TimeIn"]) || !validateTime($data["TimeOut"])) {
                throw new Exception("TimeIn and TimeOut must be in HH:mm format.");
            }

            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("The specified Employee ID does not exist.");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("The specified Branch ID does not exist.");
            }

            $stmt = $conn->prepare("SELECT * FROM attendance WHERE EmployeeID = ? AND Date = ? AND AttendanceID != ?");
            $stmt->bind_param("isi", $data["EmployeeID"], $data["Date"], $data["AttendanceID"]);
            $stmt->execute();
            $stmt->store_result();
            if ($stmt->num_rows > 0) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                $formattedDate = formatDate($data["Date"]);
                throw new Exception("An attendance record for $employeeName on $formattedDate already exists.");
            }
            $stmt->close();

            $totalHours = computeHours($conn, $data["EmployeeID"], $data["Date"]);

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus, TotalHours FROM attendance WHERE AttendanceID = ?");
                $stmt->bind_param("i", $data["AttendanceID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Attendance record with ID {$data["AttendanceID"]} not found.");
                }

                $changes = [];
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
                if ($currentRecord["TimeIn"] != $data["TimeIn"]) {
                    $changes[] = "TimeIn from '{$currentRecord["TimeIn"]}' to '{$data["TimeIn"]}'";
                }
                if ($currentRecord["TimeOut"] != $data["TimeOut"]) {
                    $changes[] = "TimeOut from '{$currentRecord["TimeOut"]}' to '{$data["TimeOut"]}'";
                }
                if ($currentRecord["TotalHours"] != $totalHours) {
                    $changes[] = "TotalHours from '{$currentRecord["TotalHours"]}' to '$totalHours'";
                }
                if ($currentRecord["TimeInStatus"] != $data["TimeInStatus"]) {
                    $changes[] = "TimeInStatus from '{$currentRecord["TimeInStatus"]}' to '{$data["TimeInStatus"]}'";
                }

                $stmt = $conn->prepare("UPDATE attendance SET Date = ?, EmployeeID = ?, BranchID = ?, TimeIn = ?, TimeOut = ?, TotalHours = ?, TimeInStatus = ? WHERE AttendanceID = ?");
                $stmt->bind_param("siisssdi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $totalHours, $data["TimeInStatus"], $data["AttendanceID"]);

                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $formattedDate = formatDate($data["Date"]);
                    $description = empty($changes)
                        ? "Attendance for '$employeeName' on '$formattedDate' updated: No changes made"
                        : "Attendance for '$employeeName' on '$formattedDate' updated: " . implode('/ ', $changes);
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Attendance", $data["AttendanceID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Attendance record updated successfully."]);
                } else {
                    throw new Exception("Unable to update the attendance record due to a database error.");
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("All fields are required to update an attendance record.");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data || empty($data["AttendanceID"])) {
            throw new Exception("AttendanceID is required to delete an attendance record.");
        }

        $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("SELECT EmployeeID, Date FROM attendance WHERE AttendanceID = ?");
            $stmt->bind_param("i", $data["AttendanceID"]);
            $stmt->execute();
            $result = $stmt->get_result();
            $record = $result->fetch_assoc();
            $stmt->close();

            if (!$record) {
                throw new Exception("Attendance record with ID {$data["AttendanceID"]} not found.");
            }

            $stmt = $conn->prepare("DELETE FROM attendance WHERE AttendanceID = ?");
            $stmt->bind_param("i", $data["AttendanceID"]);

            if ($stmt->execute()) {
                $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                $formattedDate = formatDate($record["Date"]);
                $description = "Attendance for '$employeeName' on '$formattedDate' deleted";
                logUserActivity($conn, $user_id, "DELETE_DATA", "Attendance", $data["AttendanceID"], $description);
                $conn->commit();
                echo json_encode(["success" => true, "message" => "Attendance record deleted successfully."]);
            } else {
                throw new Exception("Unable to delete the attendance record due to a database error.");
            }
            $stmt->close();
        } catch (Exception $e) {
            $conn->rollback();
            throw $e;
        }
    } else {
        throw new Exception("Invalid request method.");
    }

    $conn->close();
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
    error_log("Error: " . $e->getMessage());
}
?>