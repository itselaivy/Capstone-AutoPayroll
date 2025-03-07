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
    $sql = "SELECT UserID AS `key`, Name, Username, Role, Email FROM UserAccounts";
    $result = $conn->query($sql);

    if ($result) {
        $users = [];
        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }
        echo json_encode($users);
    } else {
        echo json_encode(["error" => "Failed to fetch users"]);
    }
} elseif ($method == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!empty($data["username"]) && !empty($data["password"])) {
        $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
        $stmt = $conn->prepare("INSERT INTO UserAccounts (Name, Username, Role, Email, Password) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sssss", $data["name"], $data["username"], $data["role"], $data["email"], $hashedPassword);

        if ($stmt->execute()) {
            echo json_encode(["success" => "User added"]);
        } else {
            echo json_encode(["error" => "Failed to add user"]);
        }
        $stmt->close();
    } else {
        echo json_encode(["error" => "Username and password required"]);
    }
} elseif ($method == "PUT") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!empty($data["UserID"])) {
        if (!empty($data["password"])) {
            $hashedPassword = password_hash($data["password"], PASSWORD_DEFAULT);
            $stmt = $conn->prepare("UPDATE UserAccounts SET Name = ?, Username = ?, Role = ?, Email = ?, Password = ? WHERE UserID = ?");
            $stmt->bind_param("sssssi", $data["name"], $data["username"], $data["role"], $data["email"], $hashedPassword, $data["UserID"]);
        } else {
            $stmt = $conn->prepare("UPDATE UserAccounts SET Name = ?, Username = ?, Role = ?, Email = ? WHERE UserID = ?");
            $stmt->bind_param("ssssi", $data["name"], $data["username"], $data["role"], $data["email"], $data["UserID"]);
        }

        if ($stmt->execute()) {
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
