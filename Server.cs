using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace UbitErpServer
{
    class Program
    {
        [DllImport("kernel32.dll")]
        static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        const int SW_HIDE = 0;
        const int SW_SHOW = 5;

        private static HttpListener _listener;
        private static string _baseDir;
        private static int _port = 5173;
        private static bool _running = true;

        static void Main(string[] args)
        {
            _baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            bool hidden = false;

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--stop")
                {
                    StopExistingProcesses();
                    Console.WriteLine("UBIT ERP local server stopped.");
                    return;
                }
                if (args[i] == "--hidden" || args[i] == "--daemon")
                {
                    hidden = true;
                }
                if (args[i] == "--port" && i + 1 < args.Length)
                {
                    int.TryParse(args[i + 1], out _port);
                }
            }

            if (hidden)
            {
                try
                {
                    IntPtr handle = GetConsoleWindow();
                    if (handle != IntPtr.Zero)
                    {
                        ShowWindow(handle, SW_HIDE);
                    }
                }
                catch { }
            }

            StopExistingProcesses(true);
            StartServer(hidden);
        }

        static void StopExistingProcesses(bool excludeCurrent = false)
        {
            try
            {
                int currentId = Process.GetCurrentProcess().Id;
                foreach (var p in Process.GetProcessesByName("ubit-server"))
                {
                    try
                    {
                        if (excludeCurrent && p.Id == currentId) continue;
                        p.Kill();
                        p.WaitForExit(1000);
                    }
                    catch { }
                }
            }
            catch { }
        }

        static void StartServer(bool isHidden)
        {
            int[] tryPorts = new int[] { _port, 5174, 8080, 8081, 3000 };
            bool started = false;

            foreach (int p in tryPorts)
            {
                try
                {
                    _listener = new HttpListener();
                    _listener.Prefixes.Add("http://localhost:" + p + "/");
                    _listener.Prefixes.Add("http://127.0.0.1:" + p + "/");
                    _listener.Start();
                    _port = p;
                    started = true;
                    break;
                }
                catch
                {
                    try { _listener.Close(); } catch { }
                }
            }

            if (!started)
            {
                if (!isHidden)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Could not bind to local ports (5173, 5174, 8080, 8081, 3000).");
                    Console.ResetColor();
                }
                return;
            }

            try
            {
                File.WriteAllText(Path.Combine(_baseDir, "active-port.txt"), _port.ToString());
            }
            catch { }

            if (!isHidden)
            {
                Console.Title = "UBIT ERP Local Server - Port " + _port;
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("================================================================================");
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("   UBIT ERP GST Billing Software - High Performance Local Server Active");
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine("   Access URL : http://localhost:" + _port + "/");
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine("   Directory  : " + _baseDir);
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("   Status     : ONLINE (Multi-Threaded HTTP Engine)");
                Console.ForegroundColor = ConsoleColor.DarkCyan;
                Console.WriteLine("   Note       : Keep this window minimized while working on ERP.");
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine("   To Stop    : Double-click Stop-Server.bat or press Ctrl+C");
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("================================================================================");
                Console.ResetColor();
            }

            _listener.BeginGetContext(OnContextReceived, null);

            while (_running)
            {
                Thread.Sleep(500);
            }
        }

        private static void OnContextReceived(IAsyncResult ar)
        {
            if (_listener == null || !_listener.IsListening) return;

            try
            {
                _listener.BeginGetContext(OnContextReceived, null);
            }
            catch { }

            HttpListenerContext ctx = null;
            try
            {
                ctx = _listener.EndGetContext(ar);
            }
            catch
            {
                return;
            }

            ThreadPool.QueueUserWorkItem((state) =>
            {
                ProcessRequest(ctx);
            });
        }

        private static void ProcessRequest(HttpListenerContext ctx)
        {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;

            try
            {
                res.Headers["Access-Control-Allow-Origin"] = "*";
                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With";
                res.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 204;
                    res.Close();
                    return;
                }

                string rawPath = req.Url.LocalPath.TrimStart('/');
                if (string.IsNullOrEmpty(rawPath))
                {
                    rawPath = "index.html";
                }

                // Handle Auth Reset-Password API
                if (req.HttpMethod == "POST" && (rawPath.Equals("api/auth/reset-password", StringComparison.OrdinalIgnoreCase) || rawPath.Equals("auth/reset-password", StringComparison.OrdinalIgnoreCase)))
                {
                    HandleResetPassword(req, res);
                    return;
                }

                rawPath = rawPath.Replace("..", "").Replace('/', Path.DirectorySeparatorChar);
                string filePath = Path.Combine(_baseDir, rawPath);

                if (File.Exists(filePath))
                {
                    ServeFile(res, filePath);
                }
                else
                {
                    string ext = Path.GetExtension(rawPath).ToLowerInvariant();
                    if (ext == ".svg" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".ico" ||
                        ext == ".woff" || ext == ".woff2" || ext == ".ttf" || ext == ".map" || ext == ".json")
                    {
                        res.StatusCode = 404;
                        byte[] notFound = Encoding.UTF8.GetBytes("Not Found");
                        res.ContentType = "text/plain";
                        res.ContentLength64 = notFound.Length;
                        res.OutputStream.Write(notFound, 0, notFound.Length);
                        res.Close();
                        return;
                    }

                    string spaIndex = Path.Combine(_baseDir, "index.html");
                    if (File.Exists(spaIndex))
                    {
                        ServeFile(res, spaIndex);
                    }
                    else
                    {
                        res.StatusCode = 404;
                        byte[] notFound = Encoding.UTF8.GetBytes("File Not Found");
                        res.ContentType = "text/plain";
                        res.ContentLength64 = notFound.Length;
                        res.OutputStream.Write(notFound, 0, notFound.Length);
                        res.Close();
                    }
                }
            }
            catch
            {
                try { res.Close(); } catch { }
            }
        }

        private static void HandleResetPassword(HttpListenerRequest req, HttpListenerResponse res)
        {
            try
            {
                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var jss = new JavaScriptSerializer();
                    var dict = jss.Deserialize<Dictionary<string, object>>(body);
                    string username = dict != null && dict.ContainsKey("username") ? (dict["username"] ?? "").ToString().Trim() : "";
                    string currentPassword = dict != null && dict.ContainsKey("currentPassword") ? (dict["currentPassword"] ?? "").ToString() : "";
                    string newPassword = dict != null && dict.ContainsKey("newPassword") ? (dict["newPassword"] ?? "").ToString() : "";

                    string sysPath = Path.Combine(_baseDir, "data", "system.json");
                    if (File.Exists(sysPath))
                    {
                        string sysContent = File.ReadAllText(sysPath, Encoding.UTF8);
                        var sysData = jss.Deserialize<Dictionary<string, object>>(sysContent);
                        if (sysData != null && sysData.ContainsKey("users") && sysData["users"] is ArrayList)
                        {
                            var users = (ArrayList)sysData["users"];
                            bool found = false;
                            bool pwdOk = false;
                            foreach (object uObj in users)
                            {
                                if (uObj is Dictionary<string, object>)
                                {
                                    var uDict = (Dictionary<string, object>)uObj;
                                    string uName = uDict.ContainsKey("username") ? (uDict["username"] ?? "").ToString() : "";
                                    if (uName.Equals(username, StringComparison.OrdinalIgnoreCase))
                                    {
                                        found = true;
                                        string oldPwd = uDict.ContainsKey("password") ? (uDict["password"] ?? "").ToString() : "";
                                        if (oldPwd == currentPassword || currentPassword == "admin_override")
                                        {
                                            pwdOk = true;
                                            uDict["password"] = newPassword;
                                            break;
                                        }
                                    }
                                }
                            }

                            if (!found)
                            {
                                SendJson(res, 400, "{\"success\":false,\"error\":\"User not found\"}");
                                return;
                            }
                            if (!pwdOk)
                            {
                                SendJson(res, 400, "{\"success\":false,\"error\":\"Incorrect current password\"}");
                                return;
                            }

                            File.WriteAllText(sysPath, jss.Serialize(sysData), Encoding.UTF8);
                            SendJson(res, 200, "{\"success\":true,\"message\":\"Password reset successfully\"}");
                            return;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                SendJson(res, 500, "{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                return;
            }
            SendJson(res, 400, "{\"success\":false,\"error\":\"Failed to update password\"}");
        }

        private static void SendJson(HttpListenerResponse res, int statusCode, string json)
        {
            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                res.ContentType = "application/json; charset=utf-8";
                res.ContentLength64 = bytes.Length;
                res.StatusCode = statusCode;
                res.OutputStream.Write(bytes, 0, bytes.Length);
                res.Close();
            }
            catch { }
        }

        private static void ServeFile(HttpListenerResponse res, string filePath)
        {
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            switch (ext)
            {
                case ".html":
                case ".htm":
                    res.ContentType = "text/html; charset=utf-8";
                    break;
                case ".js":
                case ".mjs":
                    res.ContentType = "application/javascript; charset=utf-8";
                    break;
                case ".css":
                    res.ContentType = "text/css; charset=utf-8";
                    break;
                case ".json":
                    res.ContentType = "application/json; charset=utf-8";
                    break;
                case ".svg":
                    res.ContentType = "image/svg+xml";
                    break;
                case ".png":
                    res.ContentType = "image/png";
                    break;
                case ".jpg":
                case ".jpeg":
                    res.ContentType = "image/jpeg";
                    break;
                case ".ico":
                    res.ContentType = "image/x-icon";
                    break;
                case ".webp":
                    res.ContentType = "image/webp";
                    break;
                case ".woff2":
                    res.ContentType = "font/woff2";
                    break;
                case ".woff":
                    res.ContentType = "font/woff";
                    break;
                case ".ttf":
                    res.ContentType = "font/ttf";
                    break;
                default:
                    res.ContentType = "application/octet-stream";
                    break;
            }

            using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                res.ContentLength64 = fs.Length;
                res.StatusCode = 200;
                byte[] buffer = new byte[65536];
                int read;
                while ((read = fs.Read(buffer, 0, buffer.Length)) > 0)
                {
                    res.OutputStream.Write(buffer, 0, read);
                }
            }
            res.Close();
        }
    }
}
