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
        $stmt = $conn->prepare("SELECT AttendanceID, Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus FROM attendance WHERE EmployeeID = ? AND Date = ?");
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
            $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
            $role = isset($_GET['role']) ? $_GET['role'] : null;

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for attendance fetch.");
            }

            $sql = "SELECT DAY(Date) AS day,
                           SUM(CASE WHEN TimeInStatus = 'On-Time' THEN 1 ELSE 0 END) AS onTime,
                           SUM(CASE WHEN TimeInStatus = 'Late' THEN 1 ELSE 0 END) AS late
                    FROM attendance
                    WHERE YEAR(Date) = ?";
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
                    $sql .= " AND BranchID = ?";
                    $types .= "i";
                    $params[] = $branch;
                } else {
                    $placeholders = implode(',', array_fill(0, count($allowedBranches), '?'));
                    $sql .= " AND BranchID IN ($placeholders)";
                    $types .= str_repeat('i', count($allowedBranches));
                    $params = array_merge($params, $allowedBranches);
                }
            } else {
                if ($branch !== null) {
                    $sql .= " AND BranchID = ?";
                    $types .= "i";
                    $params[] = $branch;
                }
            }

            if ($month !== null) {
                $sql .= " AND MONTH(Date) = ?";
                $types .= "i";
                $params[] = $month;
            }

            $sql .= " GROUP BY DAY(Date)";

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Failed to prepare the database query: " . $conn->error);

            if (count($params) > 1) {
                $stmt->bind_param($types, ...$params);
            } else {
                $stmt->bind_param($types, $params[0]);
            }

            $stmt->execute();
            $result = $stmt->get_result();
            $data = [];

            $daysInPeriod = $month !== null ? cal_days_in_month(CAL_GREGORIAN, $month, $year) : 365;
            $dayMap = array_fill(1, $daysInPeriod, ['onTime' => 0, 'late' => 0]);

            while ($row = $result->fetch_assoc()) {
                $dayMap[(int)$row['day']] = [
                    'onTime' => (int)$row['onTime'],
                    'late' => (int)$row['late'],
                ];
            }

            foreach ($dayMap as $day => $counts) {
                $data[] = [
                    "date" => sprintf("%d-%02d-%02d", $year, $month ?: 1, $day),
                    "onTime" => $counts['onTime'],
                    "late" => $counts['late'],
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

            error_log("Received parameters: user_id=$user_id, role=$role, page=$page, limit=$limit, branch=$branch, start_date=$start_date, end_date=$end_date");

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for attendance fetch.");
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

            $sql .= " ORDER BY a.Date DESC LIMIT ? OFFSET ?";
            $types .= "ii";
            $params[] = $limit;
            $params[] = $offset;

            error_log("SQL Query: $sql");
            error_log("Count SQL Query: $countSql");
            error_log("Parameter Types: $types");
            error_log("Parameters: " . json_encode($params));

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

            if ($types) {
                $stmt->bind_param($types, ...$params);
                $countTypes = substr($types, 0, -2);
                $countParams = array_slice($params, 0, -2);
                if ($countTypes) {
                    if (!$countStmt->bind_param($countTypes, ...$countParams)) {
                        throw new Exception("Count query bind failed: " . $countStmt->error);
                    }
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

            error_log("Fetched " . count($data) . " records");
            error_log("Sample data (first 2 records): " . (count($data) > 0 ? json_encode(array_slice($data, 0, 2)) : "No records"));
            error_log("Total matching records: $total");

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

                        if (empty($changes)) {
                            $duplicateCount++;
                            continue;
                        }

                        $stmt = $conn->prepare("UPDATE attendance SET BranchID = ?, TimeIn = ?, TimeOut = ?, TimeInStatus = ? WHERE AttendanceID = ?");
                        $stmt->bind_param("isssi", $branchId, $record["TimeIn"], $record["TimeOut"], $record["TimeInStatus"], $existingRecord["AttendanceID"]);

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
                        $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->bind_param("siisss", $record["Date"], $employeeId, $branchId, $record["TimeIn"], $record["TimeOut"], $record["TimeInStatus"]);

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

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->bind_param("siisss", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"]);

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

            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus FROM attendance WHERE AttendanceID = ?");
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
                if ($currentRecord["TimeInStatus"] != $data["TimeInStatus"]) {
                    $changes[] = "TimeInStatus from '{$currentRecord["TimeInStatus"]}' to '{$data["TimeInStatus"]}'";
                }

                $stmt = $conn->prepare("UPDATE attendance SET Date = ?, EmployeeID = ?, BranchID = ?, TimeIn = ?, TimeOut = ?, TimeInStatus = ? WHERE AttendanceID = ?");
                $stmt->bind_param("siisssi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"], $data["AttendanceID"]);

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