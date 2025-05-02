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
            'leaves' => 'LeaveID'
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

    // Check if employee has been in the company for at least a year
    function isEmployeeEligible($conn, $employeeId, $currentDate) {
        $stmt = $conn->prepare("SELECT MemberSince FROM employees WHERE EmployeeID = ?");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $memberSince = new DateTime($row['MemberSince']);
            $current = new DateTime($currentDate);
            $interval = $memberSince->diff($current);
            $years = $interval->y;
            $stmt->close();
            return $years >= 1;
        }
        $stmt->close();
        return false;
    }

    // Calculate leave days (inclusive)
    function calculateLeaveDays($startDate, $endDate) {
        $start = new DateTime($startDate);
        $end = new DateTime($endDate);
        $interval = $start->diff($end);
        return $interval->days + 1; // Include both start and end dates
    }

    // Get employee's total used leave credits
    function getTotalUsedLeaveCredits($conn, $employeeId, $excludeLeaveId = null) {
        $sql = "SELECT SUM(UsedLeaveCredits) as totalUsed FROM leaves WHERE EmployeeID = ?";
        $params = [$employeeId];
        $types = "i";
        if ($excludeLeaveId !== null) {
            $sql .= " AND LeaveID != ?";
            $params[] = $excludeLeaveId;
            $types .= "i";
        }
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $totalUsed = $row['totalUsed'] ?? 0;
        $stmt->close();
        return (int)$totalUsed;
    }

    // New function to determine the relevant anniversary date for a given date
    function getRelevantAnniversary($memberSince, $targetDate) {
        $memberSinceDate = new DateTime($memberSince);
        $target = new DateTime($targetDate);
        $memberSinceMonthDay = $memberSinceDate->format('m-d');
        $targetYear = $target->format('Y');
        $targetMonthDay = $target->format('m-d');

        $anniversaryYear = $targetYear;
        if ($targetMonthDay < $memberSinceMonthDay) {
            $anniversaryYear--;
        }
        return new DateTime("$anniversaryYear-$memberSinceMonthDay");
    }

    // Updated function to determine leave credits with annual refresh, considering the leave's date
    function getEmployeeLeaveCredits($conn, $employeeId, $currentDate, $leaveStartDate = null) {
        $stmt = $conn->prepare("SELECT MemberSince FROM employees WHERE EmployeeID = ?");
        $stmt->bind_param("i", $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if (!$row = $result->fetch_assoc()) {
            $stmt->close();
            return ['leaveCredits' => 0, 'availableCredits' => 0];
        }
        $memberSince = $row['MemberSince'];
        $stmt->close();

        $memberSinceDate = new DateTime($memberSince);
        $current = new DateTime($currentDate);
        $targetDate = $leaveStartDate ? new DateTime($leaveStartDate) : $current;

        // Check eligibility (at least 1 year in the company)
        $interval = $memberSinceDate->diff($current);
        if ($interval->y < 1) {
            return ['leaveCredits' => 0, 'availableCredits' => 0];
        }

        // Determine the anniversary relevant to the leave's start date (or current date if not specified)
        $relevantAnniversary = getRelevantAnniversary($memberSince, $targetDate->format('Y-m-d'));
        $nextAnniversary = clone $relevantAnniversary;
        $nextAnniversary->modify('+1 year');

        // Determine the cycle boundaries
        $cycleStart = $relevantAnniversary;
        $cycleEnd = $nextAnniversary;

        // Get total used credits within this cycle
        $totalUsedInCycle = 0;
        $stmt = $conn->prepare("
            SELECT SUM(UsedLeaveCredits) as totalUsed 
            FROM leaves 
            WHERE EmployeeID = ? AND StartDate >= ? AND StartDate < ?
        ");
        $stmt->bind_param("iss", $employeeId, $cycleStart->format('Y-m-d'), $cycleEnd->format('Y-m-d'));
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $totalUsedInCycle = (int)($row['totalUsed'] ?? 0);
        }
        $stmt->close();

        // Default credits are 5 per year after the first year
        $defaultCredits = 5;
        $availableCredits = $defaultCredits - $totalUsedInCycle;

        return [
            'leaveCredits' => $defaultCredits,
            'availableCredits' => max(0, $availableCredits)
        ];
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $currentDate = '2025-05-01'; // Current date as per system (May 01, 2025)

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
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID, MemberSince FROM employees WHERE BranchID IN ($placeholders)";
                    $stmt = $conn->prepare($sql);
                    if (!$stmt) throw new Exception("Prepare failed for employees query: " . $conn->error);
                    $types = str_repeat('i', count($allowedBranches));
                    $stmt->bind_param($types, ...$allowedBranches);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $isEligible = isEmployeeEligible($conn, $row['EmployeeID'], $currentDate);
                        if ($isEligible) {
                            $data[] = [
                                'EmployeeID' => $row['EmployeeID'],
                                'EmployeeName' => $row['EmployeeName'],
                                'BranchID' => $row['BranchID']
                            ];
                        }
                    }
                    $stmt->close();
                    echo json_encode($data);
                } else {
                    $sql = "SELECT EmployeeID, EmployeeName, BranchID, MemberSince FROM employees";
                    $result = $conn->query($sql);
                    $data = [];
                    while ($row = $result->fetch_assoc()) {
                        $memberSince = new DateTime($row['MemberSince']);
                        $current = new DateTime($currentDate);
                        $interval = $memberSince->diff($current);
                        if ($interval->y >= 1) {
                            $data[] = [
                                'EmployeeID' => $row['EmployeeID'],
                                'EmployeeName' => $row['EmployeeName'],
                                'BranchID' => $row['BranchID']
                            ];
                        }
                    }
                    echo json_encode($data);
                }
            } elseif ($type == 'check_duplicate') {
                $start_date = isset($_GET['start_date']) ? $_GET['start_date'] : null;
                $end_date = isset($_GET['end_date']) ? $_GET['end_date'] : null;
                $employee_id = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
                $exclude_id = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;

                if (!$start_date || !$end_date || !$employee_id) {
                    throw new Exception("start_date, end_date, and employee_id are required for duplicate check.");
                }

                $sql = "SELECT COUNT(*) as count FROM leaves WHERE EmployeeID = ? AND (
                    StartDate = ? OR EndDate = ? OR 
                    (StartDate <= ? AND EndDate >= ?) OR 
                    (StartDate >= ? AND EndDate <= ?)
                )";
                $params = [$employee_id, $start_date, $end_date, $start_date, $start_date, $start_date, $end_date];
                $types = "issssss";

                if ($exclude_id !== null) {
                    $sql .= " AND LeaveID != ?";
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
                throw new Exception("user_id and role are required for leave fetch.");
            }
    
            $offset = $page * $limit;
    
            // Base SQL query (removed AnniversaryDate since we calculate it dynamically)
            $sql = "SELECT 
                        l.LeaveID,
                        l.StartDate,
                        l.EndDate,
                        l.EmployeeID,
                        e.EmployeeName,
                        e.BranchID,
                        b.BranchName,
                        l.LeaveType,
                        l.LeaveCredits,
                        l.AvailableLeaveCredits,
                        l.UsedLeaveCredits,
                        e.MemberSince
                    FROM leaves l
                    JOIN employees e ON l.EmployeeID = e.EmployeeID
                    JOIN branches b ON e.BranchID = b.BranchID";
            $countSql = "SELECT COUNT(*) as total 
                         FROM leaves l
                         JOIN employees e ON l.EmployeeID = e.EmployeeID
                         JOIN branches b ON e.BranchID = b.BranchID";
    
            $types = "";
            $params = [];
            $conditions = [];
    
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
                $conditions[] = "e.BranchID IN ($placeholders)";
                $types .= str_repeat('i', count($allowedBranches));
                $params = array_merge($params, $allowedBranches);
            }

            if ($branch_id !== null) {
                if ($role === 'Payroll Staff' && !in_array($branch_id, $allowedBranches)) {
                    throw new Exception("Selected branch is not assigned to this user.");
                }
                $conditions[] = "e.BranchID = ?";
                $types .= "i";
                $params[] = $branch_id;
            }

            // Append conditions to SQL queries
            if (!empty($conditions)) {
                $sql .= " WHERE " . implode(" AND ", $conditions);
                $countSql .= " WHERE " . implode(" AND ", $conditions);
            }

            $sql .= " ORDER BY l.StartDate DESC LIMIT ? OFFSET ?";
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
                $isEligible = isEmployeeEligible($conn, $row['EmployeeID'], $currentDate);
                if (!$isEligible) {
                    $row['LeaveCredits'] = 0;
                    $row['AvailableLeaveCredits'] = 0;
                    $row['UsedLeaveCredits'] = 0;
                } else {
                    // Determine the relevant anniversary for the current date
                    $currentAnniversary = getRelevantAnniversary($row['MemberSince'], $currentDate);
                    $leaveStartDate = new DateTime($row['StartDate']);

                    if ($leaveStartDate < $currentAnniversary) {
                        // Leave is from a previous cycle, calculate credits based on that cycle
                        $creditsInfo = getEmployeeLeaveCredits($conn, $row['EmployeeID'], $currentDate, $row['StartDate']);
                        $row['LeaveCredits'] = $creditsInfo['leaveCredits'];
                        $row['AvailableLeaveCredits'] = $creditsInfo['availableCredits'];
                    } else {
                        // Leave is in the current cycle, calculate credits dynamically
                        $creditsInfo = getEmployeeLeaveCredits($conn, $row['EmployeeID'], $currentDate);
                        $row['LeaveCredits'] = $creditsInfo['leaveCredits'];
                        $row['AvailableLeaveCredits'] = $creditsInfo['availableCredits'];
                    }
                    // UsedLeaveCredits remains as stored since it's per leave record
                }
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

        if (!empty($data["StartDate"]) && 
            !empty($data["EndDate"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["LeaveType"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("Invalid EmployeeID");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("Invalid BranchID: Branch does not exist");
            }

            $conn->begin_transaction();
            try {
                // Check employee eligibility
                $isEligible = isEmployeeEligible($conn, $data["EmployeeID"], $currentDate);
                if (!$isEligible) {
                    $defaultCredits = 0;
                    $availableCredits = 0;
                    $leaveDays = 0;
                } else {
                    // Calculate leave credits with refresh logic for the current date
                    $creditsInfo = getEmployeeLeaveCredits($conn, $data["EmployeeID"], $currentDate);
                    $defaultCredits = $creditsInfo['leaveCredits'];
                    $availableCredits = $creditsInfo['availableCredits'];

                    // Calculate leave days
                    $leaveDays = calculateLeaveDays($data["StartDate"], $data["EndDate"]);

                    if ($leaveDays > 5) {
                        $conn->rollback();
                        echo json_encode([
                            "success" => false,
                            "warning" => "Your leave request exceeds the 5-day limit. You only have 5 leave credits, so please choose dates that cover 5 days or fewer."
                        ]);
                        exit();
                    }

                    if ($leaveDays > $availableCredits) {
                        $conn->rollback();
                        echo json_encode([
                            "success" => false,
                            "warning" => "You don’t have enough leave credits for this request. You have $availableCredits credits left, but this leave requires $leaveDays days. Please adjust your dates to fit within your available credits."
                        ]);
                        exit();
                    }

                    // Update available credits after this leave
                    $availableCredits -= $leaveDays;
                }

                $stmt = $conn->prepare("
                    INSERT INTO leaves (
                        StartDate, EndDate, EmployeeID, LeaveType, LeaveCredits, AvailableLeaveCredits, UsedLeaveCredits
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->bind_param(
                    "ssissii",
                    $data["StartDate"],
                    $data["EndDate"],
                    $data["EmployeeID"],
                    $data["LeaveType"],
                    $defaultCredits,
                    $availableCredits,
                    $leaveDays
                );

                if ($stmt->execute()) {
                    $leaveId = $conn->insert_id;
                    $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                    $formattedStartDate = formatDate($data["StartDate"]);
                    $description = "Leave for '$employeeName' starting on '$formattedStartDate' added: Type: {$data['LeaveType']}, Credits Used: $leaveDays";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Leaves", $leaveId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $leaveId]);
                } else {
                    throw new Exception("Failed to add leave record: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Missing required fields: " . 
                (!empty($data["StartDate"]) ? "" : "StartDate, ") . 
                (!empty($data["EndDate"]) ? "" : "EndDate, ") . 
                (isset($data["EmployeeID"]) ? "" : "EmployeeID, ") . 
                (isset($data["BranchID"]) ? "" : "BranchID, ") . 
                (!empty($data["LeaveType"]) ? "" : "LeaveType"));
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

        if (!empty($data["LeaveID"])) {
            $conn->begin_transaction();
            try {
                // Fetch current leave record
                $stmt = $conn->prepare("
                    SELECT StartDate, EndDate, EmployeeID, LeaveType, LeaveCredits, AvailableLeaveCredits, UsedLeaveCredits 
                    FROM leaves WHERE LeaveID = ?
                ");
                $stmt->bind_param("i", $data["LeaveID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecord = $result->fetch_assoc();
                $stmt->close();

                if (!$currentRecord) {
                    throw new Exception("Leave record with ID {$data['LeaveID']} not found.");
                }

                // Check employee eligibility
                $isEligible = isEmployeeEligible($conn, $currentRecord["EmployeeID"], $currentDate);
                if (!$isEligible) {
                    $defaultCredits = 0;
                    $availableCredits = 0;
                    $newLeaveDays = 0;
                } else {
                    // Calculate leave credits with refresh logic for the current date
                    $creditsInfo = getEmployeeLeaveCredits($conn, $currentRecord["EmployeeID"], $currentDate);
                    $defaultCredits = $creditsInfo['leaveCredits'];
                    $availableCredits = $creditsInfo['availableCredits'];

                    // Calculate old and new leave days
                    $oldLeaveDays = calculateLeaveDays($currentRecord["StartDate"], $currentRecord["EndDate"]);
                    $newLeaveDays = calculateLeaveDays($data["StartDate"], $data["EndDate"]);

                    // Adjust available credits: add back old leave days, subtract new leave days
                    $availableCredits += $oldLeaveDays;

                    if ($newLeaveDays > 5) {
                        $conn->rollback();
                        echo json_encode([
                            "success" => false,
                            "warning" => "Your leave request exceeds the 5-day limit. You only have 5 leave credits, so please choose dates that cover 5 days or fewer."
                        ]);
                        exit();
                    }

                    if ($newLeaveDays > $availableCredits) {
                        $conn->rollback();
                        echo json_encode([
                            "success" => false,
                            "warning" => "You don’t have enough leave credits for this request. You have $availableCredits credits left, but this leave requires $newLeaveDays days. Please adjust your dates to fit within your available credits."
                        ]);
                        exit();
                    }

                    // Update available credits after this leave
                    $availableCredits -= $newLeaveDays;
                }

                // Log changes
                $changes = [];
                $employeeName = getEmployeeNameById($conn, $currentRecord["EmployeeID"]);
                $formattedStartDate = formatDate($currentRecord["StartDate"]);

                if ($currentRecord["StartDate"] != $data["StartDate"]) {
                    $oldDate = formatDate($currentRecord["StartDate"]);
                    $newDate = formatDate($data["StartDate"]);
                    $changes[] = "Start Date from '$oldDate' to '$newDate'";
                }
                if ($currentRecord["EndDate"] != $data["EndDate"]) {
                    $oldDate = formatDate($currentRecord["EndDate"]);
                    $newDate = formatDate($data["EndDate"]);
                    $changes[] = "End Date from '$oldDate' to '$newDate'";
                }
                if ($currentRecord["LeaveType"] != $data["LeaveType"]) {
                    $changes[] = "Leave Type from '{$currentRecord['LeaveType']}' to '{$data['LeaveType']}'";
                }
                if ($oldLeaveDays != $newLeaveDays) {
                    $changes[] = "Credits Used from '$oldLeaveDays' to '$newLeaveDays'";
                }

                $stmt = $conn->prepare("
                    UPDATE leaves 
                    SET StartDate = ?, EndDate = ?, LeaveType = ?, LeaveCredits = ?, AvailableLeaveCredits = ?, UsedLeaveCredits = ? 
                    WHERE LeaveID = ?
                ");
                $stmt->bind_param(
                    "sssiiii",
                    $data["StartDate"],
                    $data["EndDate"],
                    $data["LeaveType"],
                    $defaultCredits,
                    $availableCredits,
                    $newLeaveDays,
                    $data["LeaveID"]
                );

                $description = empty($changes)
                    ? "Leave for '$employeeName' starting on '$formattedStartDate' updated: No changes made"
                    : "Leave for '$employeeName' starting on '$formattedStartDate' updated: " . implode('/ ', $changes);

                if ($stmt->execute()) {
                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Leaves", $data["LeaveID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update leave record: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Leave ID is required");
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

        if (!empty($data["LeaveID"])) {
            $conn->begin_transaction();
            try {
                // Fetch the leave record to get credits used
                $stmt = $conn->prepare("
                    SELECT StartDate, EmployeeID, LeaveType, LeaveCredits, AvailableLeaveCredits, UsedLeaveCredits 
                    FROM leaves WHERE LeaveID = ?
                ");
                $stmt->bind_param("i", $data["LeaveID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $record = $result->fetch_assoc();
                $stmt->close();

                if (!$record) {
                    throw new Exception("Leave record with ID {$data['LeaveID']} not found.");
                }

                $creditsUsed = (int)$record["UsedLeaveCredits"];
                $employeeId = $record["EmployeeID"];

                // Delete the leave record
                $stmt = $conn->prepare("DELETE FROM leaves WHERE LeaveID = ?");
                $stmt->bind_param("i", $data["LeaveID"]);
                if ($stmt->execute()) {
                    $employeeName = getEmployeeNameById($conn, $record["EmployeeID"]);
                    $formattedStartDate = formatDate($record["StartDate"]);
                    $description = "Leave for '$employeeName' starting on '$formattedStartDate' deleted: Type: {$record['LeaveType']}, Credits Used: $creditsUsed";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Leaves", $data["LeaveID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete leave record: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Leave ID is required");
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