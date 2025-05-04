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
            'holidays' => 'HolidayID'
        ];
        $idColumn = $idColumnMap[$table] ?? 'ID';
        $stmt = $conn->prepare("SELECT * FROM $table WHERE $idColumn = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        return $stmt->num_rows > 0;
    }

    function formatDate($monthDay, $year) {
        return (new DateTime("$year-$monthDay"))->format('m/d/Y');
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

    function getAllBranchIds($conn) {
        $stmt = $conn->prepare("SELECT BranchID FROM branches");
        $stmt->execute();
        $result = $stmt->get_result();
        $branchIds = [];
        while ($row = $result->fetch_assoc()) {
            $branchIds[] = $row['BranchID'];
        }
        $stmt->close();
        return $branchIds;
    }

    function getCurrentBranchIds($conn, $holidayId) {
        $stmt = $conn->prepare("SELECT BranchID FROM HolidayBranch WHERE HolidayID = ?");
        $stmt->bind_param("i", $holidayId);
        $stmt->execute();
        $result = $stmt->get_result();
        $branchIds = [];
        while ($row = $result->fetch_assoc()) {
            $branchIds[] = $row['BranchID'];
        }
        $stmt->close();
        return $branchIds;
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
            } elseif ($type == 'check_duplicate') {
                $monthDay = isset($_GET['monthDay']) ? $_GET['monthDay'] : null;
                $description = isset($_GET['description']) ? $_GET['description'] : null;
                $exclude_id = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;

                if (!$monthDay || !$description) {
                    throw new Exception("MonthDay and description are required for duplicate check.");
                }

                // Validate and format MonthDay
                try {
                    $date = DateTime::createFromFormat('m-d', $monthDay);
                    if (!$date || $date->format('m-d') !== $monthDay) {
                        throw new Exception("Invalid MonthDay format. Expected MM-DD.");
                    }
                    $formattedMonthDay = $date->format('m-d');
                } catch (Exception $e) {
                    error_log("Invalid MonthDay format: $monthDay. Error: " . $e->getMessage());
                    echo json_encode(["error" => "Invalid MonthDay format. Expected MM-DD."]);
                    exit;
                }

                $sql = "SELECT COUNT(*) as count FROM holidays WHERE (MonthDay = ? OR Description = ?)";
                $params = [$formattedMonthDay, $description];
                $types = "ss";

                if ($exclude_id !== null) {
                    $sql .= " AND HolidayID != ?";
                    $params[] = $exclude_id;
                    $types .= "i";
                }

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    error_log("Prepare failed for duplicate check: " . $conn->error);
                    throw new Exception("Prepare failed for duplicate check: " . $conn->error);
                }
                $stmt->bind_param($types, ...$params);
                if (!$stmt->execute()) {
                    error_log("Execute failed for duplicate check: " . $stmt->error);
                    throw new Exception("Execute failed for duplicate check: " . $stmt->error);
                }
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

            if (!$user_id || !$role) {
                throw new Exception("user_id and role are required for holiday fetch.");
            }

            $offset = $page * $limit;

            $sql = "SELECT 
                        h.HolidayID,
                        h.Description,
                        h.MonthDay,
                        h.HolidayType,
                        h.Recurring,
                        h.FixedYear,
                        hb.BranchID,
                        b.BranchName
                    FROM holidays h
                    JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID
                    JOIN branches b ON hb.BranchID = b.BranchID
                    ORDER BY h.MonthDay";
            $countSql = "SELECT COUNT(DISTINCT h.HolidayID) as total FROM holidays h";

            $stmt = $conn->prepare($sql);
            if (!$stmt) throw new Exception("Prepare failed for main query: " . $conn->error);

            $countStmt = $conn->prepare($countSql);
            if (!$countStmt) throw new Exception("Prepare failed for count query: " . $conn->error);

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

            // Apply pagination on the grouped data
            $groupedData = [];
            foreach ($data as $row) {
                $holidayId = $row['HolidayID'];
                if (!isset($groupedData[$holidayId])) {
                    $groupedData[$holidayId] = $row;
                    $groupedData[$holidayId]['branches'] = [];
                }
                $groupedData[$holidayId]['branches'][] = [
                    'BranchID' => $row['BranchID'],
                    'BranchName' => $row['BranchName']
                ];
            }
            $groupedData = array_values($groupedData);
            $paginatedData = array_slice($groupedData, $offset, $limit);

            // Flatten the paginated data for the frontend
            $finalData = [];
            foreach ($paginatedData as $holiday) {
                foreach ($holiday['branches'] as $branch) {
                    $finalData[] = [
                        'HolidayID' => $holiday['HolidayID'],
                        'Description' => $holiday['Description'],
                        'MonthDay' => $holiday['MonthDay'],
                        'HolidayType' => $holiday['HolidayType'],
                        'Recurring' => $holiday['Recurring'],
                        'FixedYear' => $holiday['FixedYear'],
                        'BranchID' => $branch['BranchID'],
                        'BranchName' => $branch['BranchName']
                    ];
                }
            }

            echo json_encode([
                "success" => true,
                "data" => $finalData,
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

        if (!empty($data["Description"]) && 
            !empty($data["MonthDay"]) && 
            !empty($data["HolidayType"]) && 
            isset($data["BranchID"]) && 
            isset($data["Recurring"])) {
            
            $conn->begin_transaction();
            try {
                // Validate MonthDay format
                try {
                    $date = DateTime::createFromFormat('m-d', $data["MonthDay"]);
                    if (!$date || $date->format('m-d') !== $data["MonthDay"]) {
                        throw new Exception("Invalid MonthDay format in POST. Expected MM-DD.");
                    }
                } catch (Exception $e) {
                    error_log("Invalid MonthDay format in POST: " . $data["MonthDay"] . ". Error: " . $e->getMessage());
                    throw new Exception("Invalid MonthDay format. Expected MM-DD.");
                }

                $fixedYear = isset($data["FixedYear"]) && !$data["Recurring"] ? (int)$data["FixedYear"] : null;
                $stmt = $conn->prepare("INSERT INTO holidays (Description, MonthDay, HolidayType, Recurring, FixedYear) VALUES (?, ?, ?, ?, ?)");
                $stmt->bind_param("sssii", $data["Description"], $data["MonthDay"], $data["HolidayType"], $data["Recurring"], $fixedYear);

                if ($stmt->execute()) {
                    $holidayId = $conn->insert_id;

                    $branchIds = [];
                    if ($data["BranchID"] === "All") {
                        $branchIds = getAllBranchIds($conn);
                    } else {
                        if (!recordExists($conn, "branches", $data["BranchID"])) {
                            throw new Exception("Invalid BranchID: Branch does not exist");
                        }
                        $branchIds[] = $data["BranchID"];
                    }

                    $stmtBranch = $conn->prepare("INSERT INTO HolidayBranch (HolidayID, BranchID) VALUES (?, ?)");
                    foreach ($branchIds as $branchId) {
                        $stmtBranch->bind_param("ii", $holidayId, $branchId);
                        if (!$stmtBranch->execute()) {
                            throw new Exception("Failed to insert into HolidayBranch: " . $stmtBranch->error);
                        }
                    }
                    $stmtBranch->close();

                    $branchNames = $data["BranchID"] === "All" ? "All Branches" : getBranchNameById($conn, $data["BranchID"]);
                    $year = $fixedYear ?? (new DateTime())->format('Y');
                    $formattedDate = formatDate($data["MonthDay"], $year);
                    $description = "Holiday '$data[Description]' on '$formattedDate' added for branch '$branchNames'";
                    logUserActivity($conn, $user_id, "ADD_DATA", "Holidays", $holidayId, $description);
                    $conn->commit();
                    echo json_encode(["success" => true, "id" => $holidayId]);
                } else {
                    throw new Exception("Failed to add holiday: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Missing required fields: " . 
                (!empty($data["Description"]) ? "" : "Description, ") . 
                (!empty($data["MonthDay"]) ? "" : "MonthDay, ") . 
                (!empty($data["HolidayType"]) ? "" : "HolidayType, ") . 
                (isset($data["BranchID"]) ? "" : "BranchID, ") . 
                (isset($data["Recurring"]) ? "" : "Recurring"));
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

        if (!empty($data["HolidayID"])) {
            $conn->begin_transaction();
            try {
                // Validate MonthDay format
                try {
                    $date = DateTime::createFromFormat('m-d', $data["MonthDay"]);
                    if (!$date || $date->format('m-d') !== $data["MonthDay"]) {
                        throw new Exception("Invalid MonthDay format in PUT. Expected MM-DD.");
                    }
                } catch (Exception $e) {
                    error_log("Invalid MonthDay format in PUT: " . $data["MonthDay"] . ". Error: " . $e->getMessage());
                    throw new Exception("Invalid MonthDay format. Expected MM-DD.");
                }

                $stmt = $conn->prepare("SELECT Description, MonthDay, HolidayType, Recurring, FixedYear, BranchID FROM holidays h JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID WHERE h.HolidayID = ?");
                $stmt->bind_param("i", $data["HolidayID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentRecords = [];
                while ($row = $result->fetch_assoc()) {
                    $currentRecords[] = $row;
                }
                $stmt->close();

                if (empty($currentRecords)) {
                    throw new Exception("Holiday record with ID {$data['HolidayID']} not found.");
                }

                $currentRecord = $currentRecords[0];
                $changes = [];
                $currentBranchIds = getCurrentBranchIds($conn, $data["HolidayID"]);
                $branchName = count($currentRecords) > 1 ? "Multiple Branches" : getBranchNameById($conn, $currentBranchIds[0] ?? null);
                $year = $currentRecord["FixedYear"] ?? (new DateTime())->format('Y');
                $formattedDate = formatDate($currentRecord["MonthDay"], $year);

                if ($currentRecord["Description"] != $data["Description"]) {
                    $changes[] = "Description from '$currentRecord[Description]' to '$data[Description]'";
                }
                if ($currentRecord["MonthDay"] != $data["MonthDay"]) {
                    $oldDate = formatDate($currentRecord["MonthDay"], $year);
                    $newDate = formatDate($data["MonthDay"], $year);
                    $changes[] = "Date from '$oldDate' to '$newDate'";
                }
                if ($currentRecord["HolidayType"] != $data["HolidayType"]) {
                    $changes[] = "Holiday Type from '$currentRecord[HolidayType]' to '$data[HolidayType]'";
                }

                // Check for branch changes
                $newBranchIds = [];
                if ($data["BranchID"] === "All") {
                    $newBranchIds = getAllBranchIds($conn);
                } else {
                    $newBranchIds[] = $data["BranchID"];
                }
                sort($currentBranchIds);
                sort($newBranchIds);
                if ($currentBranchIds !== $newBranchIds) {
                    $oldBranchDisplay = count($currentBranchIds) > 1 ? "All Branches" : getBranchNameById($conn, $currentBranchIds[0] ?? null);
                    $newBranchDisplay = $data["BranchID"] === "All" ? "All Branches" : getBranchNameById($conn, $data["BranchID"]);
                    $changes[] = "Branch from '$oldBranchDisplay' to '$newBranchDisplay'";
                }

                $fixedYear = isset($data["FixedYear"]) && !$data["Recurring"] ? (int)$data["FixedYear"] : null;
                $stmt = $conn->prepare("UPDATE holidays SET Description = ?, MonthDay = ?, HolidayType = ?, Recurring = ?, FixedYear = ? WHERE HolidayID = ?");
                $stmt->bind_param("sssiii", $data["Description"], $data["MonthDay"], $data["HolidayType"], $data["Recurring"], $fixedYear, $data["HolidayID"]);
                $description = empty($changes)
                    ? "Holiday '$data[Description]' on '$formattedDate' updated for branch '$branchName': No changes made"
                    : "Holiday '$data[Description]' on '$formattedDate' updated for branch '$branchName': " . implode('/ ', $changes);

                if ($stmt->execute()) {
                    $branchIds = [];
                    if ($data["BranchID"] === "All") {
                        $branchIds = getAllBranchIds($conn);
                    } else {
                        if (!recordExists($conn, "branches", $data["BranchID"])) {
                            throw new Exception("Invalid BranchID: Branch does not exist");
                        }
                        $branchIds[] = $data["BranchID"];
                    }

                    $stmtDelete = $conn->prepare("DELETE FROM HolidayBranch WHERE HolidayID = ?");
                    $stmtDelete->bind_param("i", $data["HolidayID"]);
                    if (!$stmtDelete->execute()) {
                        throw new Exception("Failed to delete existing branches: " . $stmtDelete->error);
                    }
                    $stmtDelete->close();

                    $stmtInsert = $conn->prepare("INSERT INTO HolidayBranch (HolidayID, BranchID) VALUES (?, ?)");
                    foreach ($branchIds as $branchId) {
                        $stmtInsert->bind_param("ii", $data["HolidayID"], $branchId);
                        if (!$stmtInsert->execute()) {
                            throw new Exception("Failed to insert new branches: " . $stmtInsert->error);
                        }
                    }
                    $stmtInsert->close();

                    logUserActivity($conn, $user_id, "UPDATE_DATA", "Holidays", $data["HolidayID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to update holiday: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Holiday ID is required");
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

        if (!empty($data["HolidayID"])) {
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare("SELECT h.Description, h.MonthDay, h.FixedYear, hb.BranchID FROM holidays h JOIN HolidayBranch hb ON h.HolidayID = hb.HolidayID WHERE h.HolidayID = ?");
                $stmt->bind_param("i", $data["HolidayID"]);
                $stmt->execute();
                $result = $stmt->get_result();
                $records = [];
                while ($row = $result->fetch_assoc()) {
                    $records[] = $row;
                }
                $stmt->close();

                if (empty($records)) {
                    throw new Exception("Holiday record with ID {$data['HolidayID']} not found.");
                }

                $record = $records[0];
                $stmt = $conn->prepare("DELETE FROM holidays WHERE HolidayID = ?");
                $stmt->bind_param("i", $data["HolidayID"]);

                if ($stmt->execute()) {
                    $branchName = count($records) > 1 ? "Multiple Branches" : getBranchNameById($conn, $record["BranchID"]);
                    $year = $record["FixedYear"] ?? (new DateTime())->format('Y');
                    $formattedDate = formatDate($record["MonthDay"], $year);
                    $description = "Holiday '$record[Description]' on '$formattedDate' deleted for branch '$branchName'";
                    logUserActivity($conn, $user_id, "DELETE_DATA", "Holidays", $data["HolidayID"], $description);
                    $conn->commit();
                    echo json_encode(["success" => true]);
                } else {
                    throw new Exception("Failed to delete holiday: " . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                $conn->rollback();
                throw $e;
            }
        } else {
            throw new Exception("Holiday ID is required");
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