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
        throw new Exception("Unable to connect to the database. Please try again later or contact support.");
    }

    // Function to check if a record exists by ID
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

    // Function to check if an attendance record exists for a specific employee on a specific date
    function attendanceExists($conn, $employeeId, $date) {
        $stmt = $conn->prepare("SELECT * FROM attendance WHERE EmployeeID = ? AND Date = ?");
        $stmt->bind_param("is", $employeeId, $date);
        $stmt->execute();
        $stmt->store_result();
        $result = $stmt->num_rows > 0;
        $stmt->close();
        return $result;
    }

    // Function to get the existing attendance record
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

    // Function to get EmployeeID by EmployeeName
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

    // Function to get EmployeeName by EmployeeID
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

    // Function to get BranchID by BranchName
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

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method == "GET") {
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
            if ($type == 'branches') {
                $sql = "SELECT BranchID, BranchName FROM branches";
            } elseif ($type == 'employees') {
                $sql = "SELECT EmployeeID, EmployeeName, BranchID FROM employees";
            } else {
                throw new Exception("Invalid request type specified.");
            }
            $result = $conn->query($sql);
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
        } elseif (isset($_GET['year'])) {
            $year = $_GET['year'];
            $month = isset($_GET['month']) && $_GET['month'] !== 'all' ? $_GET['month'] : null;
            $branch = isset($_GET['branch']) && $_GET['branch'] !== 'all' ? $_GET['branch'] : null;

            $sql = "SELECT DAY(Date) AS day, 
                           SUM(CASE WHEN TimeInStatus = 'On-Time' THEN 1 ELSE 0 END) AS onTime, 
                           SUM(CASE WHEN TimeInStatus = 'Late' THEN 1 ELSE 0 END) AS late
                    FROM attendance 
                    WHERE YEAR(Date) = ?";
            $types = "i";
            $params = [$year];

            if ($month !== null) {
                $sql .= " AND MONTH(Date) = ?";
                $types .= "i";
                $params[] = $month;
            }

            if ($branch !== null) {
                $sql .= " AND BranchID = ?";
                $types .= "i";
                $params[] = $branch;
            }

            $sql .= " GROUP BY DAY(Date)";

            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                throw new Exception("Failed to prepare the database query.");
            }

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
                    JOIN branches b ON a.BranchID = b.BranchID";
            $result = $conn->query($sql);
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
        }
    } elseif ($method == "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        // Check if the data is an array (bulk insert/update from CSV) or a single record (from Add modal)
        if (is_array($data) && isset($data[0])) {
            $successCount = 0; // Count of new records inserted
            $updatedCount = 0; // Count of existing records updated
            $duplicateCount = 0; // Count of records that are duplicates with no changes
            $errors = [];
            $validRecords = 0;

            foreach ($data as $index => $record) {
                // Validate required fields
                if (!isset($record["Date"]) || empty($record["Date"]) ||
                    !isset($record["TimeIn"]) || empty($record["TimeIn"]) ||
                    !isset($record["TimeOut"]) || empty($record["TimeOut"]) ||
                    !isset($record["TimeInStatus"]) || empty($record["TimeInStatus"])) {
                    $errors[] = "Row " . ($index + 1) . ": Missing required fields (Date, TimeIn, TimeOut, TimeInStatus).";
                    continue;
                }

                // Resolve EmployeeID
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

                // Resolve BranchID
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

                // Validate EmployeeID and BranchID
                if (!recordExists($conn, "employees", $employeeId)) {
                    $errors[] = "Row " . ($index + 1) . ": Invalid Employee ID: $employeeId.";
                    continue;
                }
                if (!recordExists($conn, "branches", $branchId)) {
                    $errors[] = "Row " . ($index + 1) . ": Invalid Branch ID: $branchId.";
                    continue;
                }

                $validRecords++;

                // Check if the record already exists
                if (attendanceExists($conn, $employeeId, $record["Date"])) {
                    // Fetch the existing record
                    $existingRecord = getAttendanceRecord($conn, $employeeId, $record["Date"]);

                    // Compare fields to determine if an update is needed
                    $fieldsToUpdate = [];
                    if ($existingRecord["BranchID"] != $branchId) {
                        $fieldsToUpdate[] = "BranchID";
                    }
                    if ($existingRecord["TimeIn"] != $record["TimeIn"]) {
                        $fieldsToUpdate[] = "TimeIn";
                    }
                    if ($existingRecord["TimeOut"] != $record["TimeOut"]) {
                        $fieldsToUpdate[] = "TimeOut";
                    }
                    if ($existingRecord["TimeInStatus"] != $record["TimeInStatus"]) {
                        $fieldsToUpdate[] = "TimeInStatus";
                    }

                    if (empty($fieldsToUpdate)) {
                        // No changes needed; the record is a duplicate
                        $duplicateCount++;
                        continue;
                    }

                    // Update the existing record
                    $stmt = $conn->prepare("UPDATE attendance SET BranchID = ?, TimeIn = ?, TimeOut = ?, TimeInStatus = ? WHERE AttendanceID = ?");
                    $stmt->bind_param("isssi", $branchId, $record["TimeIn"], $record["TimeOut"], $record["TimeInStatus"], $existingRecord["AttendanceID"]);

                    if ($stmt->execute()) {
                        $updatedCount++;
                    } else {
                        $errors[] = "Row " . ($index + 1) . ": Unable to update attendance record due to a database error.";
                    }
                    $stmt->close();
                } else {
                    // Insert the new record
                    $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->bind_param("siisss", $record["Date"], $employeeId, $branchId, $record["TimeIn"], $record["TimeOut"], $record["TimeInStatus"]);

                    if ($stmt->execute()) {
                        $successCount++;
                    } else {
                        $errors[] = "Row " . ($index + 1) . ": Unable to add attendance record due to a database error.";
                    }
                    $stmt->close();
                }
            }

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
        } else {
            // Single record insert (for Add modal)
            if (!isset($data["Date"]) || empty($data["Date"]) ||
                !isset($data["EmployeeID"]) || empty($data["EmployeeID"]) ||
                !isset($data["BranchID"]) || empty($data["BranchID"]) ||
                !isset($data["TimeIn"]) || empty($data["TimeIn"]) ||
                !isset($data["TimeOut"]) || empty($data["TimeOut"]) ||
                !isset($data["TimeInStatus"]) || empty($data["TimeInStatus"])) {
                throw new Exception("All fields are required to add an attendance record.");
            }

            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("The specified Employee ID does not exist.");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("The specified Branch ID does not exist.");
            }

            // Check for duplicate attendance record
            if (attendanceExists($conn, $data["EmployeeID"], $data["Date"])) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                throw new Exception("An attendance record for $employeeName on {$data["Date"]} already exists.");
            }

            $stmt = $conn->prepare("INSERT INTO attendance (Date, EmployeeID, BranchID, TimeIn, TimeOut, TimeInStatus) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("siisss", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => true, "message" => "Attendance record added successfully.", "id" => $stmt->insert_id]);
            } else {
                throw new Exception("Unable to add the attendance record due to a database error.");
            }
            $stmt->close();
        }
    } elseif ($method == "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        if (!empty($data["AttendanceID"]) && 
            !empty($data["Date"]) && 
            isset($data["EmployeeID"]) && 
            isset($data["BranchID"]) && 
            !empty($data["TimeIn"]) && 
            !empty($data["TimeOut"]) && 
            !empty($data["TimeInStatus"])) {
            
            if (!recordExists($conn, "employees", $data["EmployeeID"])) {
                throw new Exception("The specified Employee ID does not exist.");
            }
            if (!recordExists($conn, "branches", $data["BranchID"])) {
                throw new Exception("The specified Branch ID does not exist.");
            }

            // Check for duplicate attendance record (excluding the current record being updated)
            $stmt = $conn->prepare("SELECT * FROM attendance WHERE EmployeeID = ? AND Date = ? AND AttendanceID != ?");
            $stmt->bind_param("isi", $data["EmployeeID"], $data["Date"], $data["AttendanceID"]);
            $stmt->execute();
            $stmt->store_result();
            if ($stmt->num_rows > 0) {
                $employeeName = getEmployeeNameById($conn, $data["EmployeeID"]);
                throw new Exception("An attendance record for $employeeName on {$data["Date"]} already exists.");
            }
            $stmt->close();

            $stmt = $conn->prepare("UPDATE attendance SET Date = ?, EmployeeID = ?, BranchID = ?, TimeIn = ?, TimeOut = ?, TimeInStatus = ? WHERE AttendanceID = ?");
            $stmt->bind_param("siisssi", $data["Date"], $data["EmployeeID"], $data["BranchID"], $data["TimeIn"], $data["TimeOut"], $data["TimeInStatus"], $data["AttendanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => true, "message" => "Attendance record updated successfully."]);
            } else {
                throw new Exception("Unable to update the attendance record due to a database error.");
            }
            $stmt->close();
        } else {
            throw new Exception("All fields are required to update an attendance record.");
        }
    } elseif ($method == "DELETE") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            throw new Exception("Invalid data format. Please ensure the request contains valid JSON.");
        }

        if (!empty($data["AttendanceID"])) {
            $stmt = $conn->prepare("DELETE FROM attendance WHERE AttendanceID = ?");
            $stmt->bind_param("i", $data["AttendanceID"]);

            if ($stmt->execute()) {
                echo json_encode(["success" => true, "message" => "Attendance record deleted successfully."]);
            } else {
                throw new Exception("Unable to delete the attendance record due to a database error.");
            }
            $stmt->close();
        } else {
            throw new Exception("Attendance ID is required to delete a record.");
        }
    } else {
        throw new Exception("Invalid request method. Only GET, POST, PUT, and DELETE are supported.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}

$conn->close();
?>