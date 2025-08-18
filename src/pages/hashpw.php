<?php
$password = "SysAd.123";
$hashedPassword = password_hash($password, PASSWORD_DEFAULT);
echo $hashedPassword;
