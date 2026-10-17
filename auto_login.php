<?php
session_start();
require_once '/var/www/html/cloud/config/config.php';  // Adjust path to Nextcloud config

$nextcloudUrl = "https://weekofcanada.com/cloud";  // Your Nextcloud URL
$nextcloudSecret = "a7e56c9f3d91b2a5c4d7e8f0a1b2c3d4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m9n0";

// **Logging function**
function debug_log($message) {
    file_put_contents('/var/www/html/cloud/data/nextcloud.log', date('Y-m-d H:i:s') . " - $message\n", FILE_APPEND);
}

// **Step 1: Validate Request**
if (!isset($_POST['username']) || !isset($_POST['password'])) {
    debug_log("ERROR: Missing username or password.");
    die(json_encode(["status" => "error", "message" => "Missing username or password."]));
}

$username = $_POST['username'];
$password = $_POST['password'];
debug_log("Processing login for: $username");

// **Step 2: Authenticate using Nextcloud WebDAV API**
$cookieFile = "/var/www/html/session_var/nextcloud_cookie_$username.txt";
$ch = curl_init("$nextcloudUrl/remote.php/webdav/");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
curl_setopt($ch, CURLOPT_FAILONERROR, true);
curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile); // Store session cookie
curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

debug_log("cURL request sent to Nextcloud WebDAV. HTTP Code: $httpCode. Error: $curlError");

if ($httpCode == 200) {
    $_SESSION['nextcloud_user'] = $username; // Store session

    // **Extract session cookie and pass it to the browser**
    $cookies = file($cookieFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    debug_log("Cookies stored for $username:");
    $cookieScript = "<script>";

    foreach ($cookies as $cookie) {
        debug_log("Cookie line: " . $cookie);

        // Split the cookie line by tab characters
        $cookieParts = explode("\t", $cookie);
        if (count($cookieParts) >= 7) {
            $cookieName = trim($cookieParts[5]);
            $cookieValue = trim($cookieParts[6]);

            // Ensure we set the correct session cookie (`oc_<instanceid>`)
            if (strpos($cookieName, 'oc_') === 0 || $cookieName === 'oc_sessionPassphrase' || $cookieName === 'nc_sameSiteCookielax') {
                setcookie($cookieName, $cookieValue, time() + 3600, '/', 'weekofcanada.com', true, true);
                debug_log("Setting cookie: $cookieName = $cookieValue");

                // Add JavaScript to ensure the browser sets the cookie before redirection
                $cookieScript .= "document.cookie = '$cookieName=$cookieValue; path=/; domain=weekofcanada.com; secure';";
            }
        }
    }

    $cookieScript .= "window.location.href = '$nextcloudUrl/';</script>";

    debug_log("Login successful for $username. Redirecting to Nextcloud.");
    echo $cookieScript; // Redirect with JavaScript to ensure cookies persist
    exit();
} else {
    debug_log("ERROR: Nextcloud login failed for $username. HTTP Code: $httpCode.");
    echo json_encode(["status" => "error", "message" => "Nextcloud login failed"]);
    exit();
}
?>
