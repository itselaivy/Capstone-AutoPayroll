<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

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
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == "GET") {
    // Fetch user accounts with their branches and CreatedOn
    $sql = "SELECT 
                ua.UserID AS `key`, 
                ua.Name, 
                ua.Username, 
                ua.Role, 
                ua.Email, 
                ua.CreatedOn,
                GROUP_CONCAT(DISTINCT b.BranchName SEPARATOR '|') AS Branches
            FROM UserAccounts ua
            LEFT JOIN UserBranches ub ON ua.UserID = ub.UserID
            LEFT JOIN Branches b ON ub.BranchID = b.BranchID
            GROUP BY ua.UserID";
    $result = $conn->query($sql);

    if ($result) {
        $users = [];
        while ($row = $result->fetch_assoc()) {
            // Format CreatedOn as a readable date
            $row['CreatedOn'] = date('Y-m-d H:i:s', strtotime($row['CreatedOn']));
            // If no branches are assigned, set Branches to "None"
            $row['Branches'] = $row['Branches'] ? $row['Branches'] : 'None';
            $users[] = $row;
        }
        echo json_encode($users);
    } else {
        echo json_encode(["error" => "Failed to fetch users: " . $conn->error]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!empty($data["username"]) && !empty($data["password"])) {
        $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
        $stmt = $conn->prepare("INSERT INTO UserAccounts (Name, Username, Role, Email, Password) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sssss", $data["name"], $data["username"], $data["role"], $data["email"], $hashedPassword);

        if ($stmt->execute()) {
            $userID = $conn->insert_id; // Get the newly inserted UserID

            // Insert branches into UserBranches (if provided)
            if (!empty($data["branches"]) && is_array($data["branches"])) {
                $stmtBranches = $conn->prepare("INSERT INTO UserBranches (UserID, BranchID) VALUES (?, ?)");
                foreach ($data["branches"] as $branchID) {
                    $stmtBranches->bind_param("ii", $userID, $branchID);
                    $stmtBranches->execute();
                }
                $stmtBranches->close();
            }

            echo json_encode(["success" => "User added"]);
        } else {
            echo json_encode(["error" => "Failed to add user: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(["error" => "Username and password required"]);
    }
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!empty($data["UserID"])) {
        // Update user details
        if (!empty($data["password"])) {
            $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
            $stmt = $conn->prepare("UPDATE UserAccounts SET Name = ?, Username = ?, Role = ?, Email = ?, Password = ? WHERE UserID = ?");
            $stmt->bind_param("sssssi", $data["name"], $data["username"], $data["role"], $data["email"], $hashedPassword, $data["UserID"]);
        } else {
            $stmt = $conn->prepare("UPDATE UserAccounts SET Name = ?, Username = ?, Role = ?, Email = ? WHERE UserID = ?");
            $stmt->bind_param("ssssi", $data["name"], $data["username"], $data["role"], $data["email"], $data["UserID"]);
        }

        if ($stmt->execute()) {
            // Update branches in UserBranches
            // First, delete existing branch assignments
            $stmtDelete = $conn->prepare("DELETE FROM UserBranches WHERE UserID = ?");
            $stmtDelete->bind_param("i", $data["UserID"]);
            $stmtDelete->execute();
            $stmtDelete->close();

            // Insert new branch assignments (if provided)
            if (!empty($data["branches"]) && is_array($data["branches"])) {
                $stmtBranches = $conn->prepare("INSERT INTO UserBranches (UserID, BranchID) VALUES (?, ?)");
                foreach ($data["branches"] as $branchID) {
                    $stmtBranches->bind_param("ii", $data["UserID"], $branchID);
                    $stmtBranches->execute();
                }
                $stmtBranches->close();
            }

            echo json_encode(["success" => "User updated"]);
        } else {
            echo json_encode(["error" => "Failed to update user: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(["error" => "UserID is required"]);
    }
} elseif ($method == "DELETE") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!empty($data["UserID"])) {
        $stmt = $conn->prepare("DELETE FROM UserAccounts WHERE UserID = ?");
        $stmt->bind_param("i", $data["UserID"]);

        if ($stmt->execute()) {
            // Note: UserBranches entries are automatically deleted due to ON DELETE CASCADE
            echo json_encode(["success" => "User deleted"]);
        } else {
            echo json_encode(["error" => "Failed to delete user: " . $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(["error" => "UserID is required"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["error" => "Method not supported"]);
}

$conn->close();
?>