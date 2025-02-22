<?php
session_start();

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $password = $_POST['password'];

    // Dummy credentials for demonstration
    $valid_username = "admin";
    $valid_password = "password";

    if ($username == $valid_username && $password == $valid_password) {
        $_SESSION['loggedin'] = true;
        $_SESSION['username'] = $username;
        header("Location: /dashboard.php");
        exit;
    } else {
        $error = "Invalid username or password.";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
<link rel="stylesheet" href="styles.css" />
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="keywords" content="HTML, CSS" />
    <meta name="description" content="..." />
    <title>Login</title>
</head>
<body>
    <div class="logo"></div>
    <div class="login-container">
      <div class="login-box">
        <h1>Login</h1>
        <div class="user-icon">
          <img src="assets/images/profile-icon.png" />
        </div>
        <form action="index.php" method="GET">
          <input type="text" name="username" placeholder="Username" required />
          <input
            type="password" name="password" placeholder="Password" required/>
          <button type="submit">Login</button>
        </form>
      </div>
    </div>
    <?php if (isset($error)): ?>
        <p style="color: red;"><?php echo $error; ?></p>
    <?php endif; ?>
    
</body>
</html>