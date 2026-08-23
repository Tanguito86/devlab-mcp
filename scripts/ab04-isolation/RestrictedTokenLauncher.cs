using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace DevLab.Ab04
{
    public static class RestrictedTokenLauncher
    {
        private const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
        private const uint TOKEN_DUPLICATE = 0x0002;
        private const uint TOKEN_QUERY = 0x0008;
        private const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
        private const uint TOKEN_ACCESS = TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ADJUST_PRIVILEGES;
        private const uint DISABLE_MAX_PRIVILEGE = 0x00000001;
        private const uint SE_GROUP_ENABLED = 0x00000004;
        private const uint SE_GROUP_USE_FOR_DENY_ONLY = 0x00000010;
        private const uint SE_PRIVILEGE_ENABLED = 0x00000002;
        private const uint SE_PRIVILEGE_REMOVED = 0x00000004;
        private const uint CREATE_SUSPENDED = 0x00000004;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NO_WINDOW = 0x08000000;
        private const uint LOGON_WITH_PROFILE = 0x00000001;
        private const int LOGON32_LOGON_INTERACTIVE = 2;
        private const int LOGON32_PROVIDER_DEFAULT = 0;
        private const int ERROR_NOT_ALL_ASSIGNED = 1300;
        private const uint JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
        private const int JobObjectExtendedLimitInformation = 9;
        private const int TokenUser = 1;
        private const int TokenGroups = 2;
        private const int TokenPrivileges = 3;
        private const int TokenIntegrityLevel = 25;
        private const int BootstrapProtocolVersion = 1;
        private const int ReportTimeoutMilliseconds = 30000;

        private static readonly string[] SidsToDisable = new string[]
        {
            "S-1-5-11",     // Authenticated Users: inherited Modify on H:
            "S-1-5-32-545", // BUILTIN\\Users: inherited ReadAndExecute on H:
            "S-1-5-32-544"  // BUILTIN\\Administrators: must never authorize a builder
        };

        public static string Launch(
            SecureString password,
            string username,
            string domain,
            string expectedUserSid,
            string launcherPath,
            string executablePath,
            string workingDirectory,
            string[] arguments)
        {
            if (password == null) throw new ArgumentNullException("password");
            RequireAbsoluteExistingFile(launcherPath, "launcherPath");
            RequireAbsoluteExistingFile(executablePath, "executablePath");
            RequireAbsoluteExistingDirectory(workingDirectory, "workingDirectory");
            if (String.IsNullOrWhiteSpace(username)) throw new ArgumentException("username is required", "username");
            if (String.IsNullOrWhiteSpace(expectedUserSid)) throw new ArgumentException("expectedUserSid is required", "expectedUserSid");
            if (arguments == null) arguments = new string[0];

            using (AnonymousPipeServerStream configPipe = new AnonymousPipeServerStream(PipeDirection.Out, HandleInheritability.Inheritable))
            using (AnonymousPipeServerStream reportPipe = new AnonymousPipeServerStream(PipeDirection.In, HandleInheritability.Inheritable))
            {
                string configHandle = configPipe.GetClientHandleAsString();
                string reportHandle = reportPipe.GetClientHandleAsString();
                string bootstrapCommand = QuoteArgument(launcherPath) + " --bootstrap " + configHandle + " " + reportHandle;
                STARTUPINFO startup = new STARTUPINFO();
                startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
                PROCESS_INFORMATION process;
                IntPtr passwordPointer = IntPtr.Zero;
                IntPtr validationToken = IntPtr.Zero;
                try
                {
                    passwordPointer = Marshal.SecureStringToGlobalAllocUnicode(password);
                    if (!LogonUserW(username, domain, passwordPointer, LOGON32_LOGON_INTERACTIVE, LOGON32_PROVIDER_DEFAULT, out validationToken))
                    {
                        throw NativeError("LogonUserW");
                    }
                    string authenticatedSid = ReadUserSid(validationToken);
                    if (!String.Equals(authenticatedSid, expectedUserSid, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("AB04_LOGON_SID_MISMATCH");
                    }
                    CloseHandle(validationToken);
                    validationToken = IntPtr.Zero;

                    StringBuilder commandLine = new StringBuilder(bootstrapCommand);
                    if (!CreateProcessWithLogonW(
                        username,
                        domain,
                        passwordPointer,
                        LOGON_WITH_PROFILE,
                        launcherPath,
                        commandLine,
                        CREATE_NO_WINDOW,
                        IntPtr.Zero,
                        workingDirectory,
                        ref startup,
                        out process))
                    {
                        throw NativeError("CreateProcessWithLogonW");
                    }
                }
                finally
                {
                    if (validationToken != IntPtr.Zero) CloseHandle(validationToken);
                    if (passwordPointer != IntPtr.Zero) Marshal.ZeroFreeGlobalAllocUnicode(passwordPointer);
                }

                configPipe.DisposeLocalCopyOfClientHandle();
                reportPipe.DisposeLocalCopyOfClientHandle();
                try
                {
                    using (BinaryWriter writer = new BinaryWriter(configPipe, Encoding.UTF8, true))
                    {
                        writer.Write(BootstrapProtocolVersion);
                        writer.Write(expectedUserSid);
                        writer.Write(executablePath);
                        writer.Write(workingDirectory);
                        writer.Write(arguments.Length);
                        for (int i = 0; i < arguments.Length; i++) writer.Write(arguments[i] ?? String.Empty);
                        writer.Flush();
                    }
                    configPipe.Close();

                    Task<string> readTask = Task.Factory.StartNew(delegate
                    {
                        using (BinaryReader reader = new BinaryReader(reportPipe, Encoding.UTF8, true))
                        {
                            return reader.ReadString();
                        }
                    });
                    if (!readTask.Wait(ReportTimeoutMilliseconds))
                    {
                        TerminateProcess(process.hProcess, 124);
                        throw new TimeoutException("AB04_RESTRICTED_LAUNCH_REPORT_TIMEOUT");
                    }
                    return readTask.Result;
                }
                finally
                {
                    CloseHandle(process.hThread);
                    CloseHandle(process.hProcess);
                }
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "--self-test")
            {
                Console.Out.WriteLine("AB04_RESTRICTED_TOKEN_LAUNCHER_COMPILED");
                return 0;
            }
            if (args.Length != 3 || args[0] != "--bootstrap") return 64;
            return Bootstrap(args[1], args[2]);
        }

        private static int Bootstrap(string configHandle, string reportHandle)
        {
            using (AnonymousPipeClientStream configPipe = new AnonymousPipeClientStream(PipeDirection.In, configHandle))
            using (AnonymousPipeClientStream reportPipe = new AnonymousPipeClientStream(PipeDirection.Out, reportHandle))
            using (BinaryReader reader = new BinaryReader(configPipe, Encoding.UTF8, true))
            using (BinaryWriter writer = new BinaryWriter(reportPipe, Encoding.UTF8, true))
            {
                try
                {
                    int protocol = reader.ReadInt32();
                    if (protocol != BootstrapProtocolVersion) throw new InvalidOperationException("AB04_BOOTSTRAP_PROTOCOL_MISMATCH");
                    string expectedUserSid = reader.ReadString();
                    string executablePath = reader.ReadString();
                    string workingDirectory = reader.ReadString();
                    int argumentCount = reader.ReadInt32();
                    if (argumentCount < 0 || argumentCount > 256) throw new InvalidOperationException("AB04_ARGUMENT_COUNT_INVALID");
                    string[] arguments = new string[argumentCount];
                    for (int i = 0; i < argumentCount; i++) arguments[i] = reader.ReadString();

                    LaunchRestrictedChild(expectedUserSid, executablePath, workingDirectory, arguments, writer);
                    return 0;
                }
                catch (Exception error)
                {
                    string safeError = error is Win32Exception
                        ? error.GetType().Name + ":" + ((Win32Exception)error).NativeErrorCode
                        : error.GetType().Name;
                    writer.Write("{\"schemaVersion\":1,\"compliant\":false,\"error\":\"" + JsonEscape(safeError) + "\"}");
                    writer.Flush();
                    return 1;
                }
            }
        }

        private static void LaunchRestrictedChild(string expectedUserSid, string executablePath, string workingDirectory, string[] arguments, BinaryWriter reportWriter)
        {
            RequireAbsoluteExistingFile(executablePath, "executablePath");
            RequireAbsoluteExistingDirectory(workingDirectory, "workingDirectory");
            IntPtr processToken = IntPtr.Zero;
            IntPtr restrictedToken = IntPtr.Zero;
            IntPtr environment = IntPtr.Zero;
            IntPtr job = IntPtr.Zero;
            PROCESS_INFORMATION child = new PROCESS_INFORMATION();
            bool childCreated = false;
            try
            {
                if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ACCESS, out processToken)) throw NativeError("OpenProcessToken");
                restrictedToken = CreateAb04RestrictedToken(processToken);
                TokenSnapshot parentSnapshot = InspectToken(restrictedToken);
                parentSnapshot.AssertCompliant(expectedUserSid);

                if (!CreateEnvironmentBlock(out environment, restrictedToken, false)) throw NativeError("CreateEnvironmentBlock");
                job = CreateConfiningJob();

                STARTUPINFO startup = new STARTUPINFO();
                startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
                StringBuilder commandLine = new StringBuilder(BuildCommandLine(executablePath, arguments));
                uint flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;
                if (!CreateProcessAsUserW(
                    restrictedToken,
                    executablePath,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    flags,
                    environment,
                    workingDirectory,
                    ref startup,
                    out child))
                {
                    throw NativeError("CreateProcessAsUserW");
                }
                childCreated = true;
                if (!AssignProcessToJobObject(job, child.hProcess)) throw NativeError("AssignProcessToJobObject");

                IntPtr childToken = IntPtr.Zero;
                TokenSnapshot childSnapshot;
                try
                {
                    if (!OpenProcessToken(child.hProcess, TOKEN_QUERY, out childToken)) throw NativeError("OpenProcessToken(child)");
                    childSnapshot = InspectToken(childToken);
                    childSnapshot.AssertCompliant(expectedUserSid);
                }
                finally
                {
                    if (childToken != IntPtr.Zero) CloseHandle(childToken);
                }
                bool sameRestrictions = parentSnapshot.HasSameRestrictions(childSnapshot);
                if (!sameRestrictions) throw new InvalidOperationException("AB04_CHILD_TOKEN_RESTRICTIONS_MISMATCH");
                if (ResumeThread(child.hThread) == UInt32.MaxValue) throw NativeError("ResumeThread");

                string report = BuildReport(
                    parentSnapshot,
                    childSnapshot,
                    expectedUserSid,
                    "CreateProcessAsUserW",
                    (uint)System.Diagnostics.Process.GetCurrentProcess().Id,
                    child.dwProcessId,
                    sameRestrictions);

                reportWriter.Write(report);
                reportWriter.Flush();

                CloseHandle(child.hThread);
                child.hThread = IntPtr.Zero;
                WaitForSingleObject(child.hProcess, UInt32.MaxValue);
                uint exitCode;
                GetExitCodeProcess(child.hProcess, out exitCode);
            }
            catch
            {
                if (childCreated && child.hProcess != IntPtr.Zero) TerminateProcess(child.hProcess, 125);
                throw;
            }
            finally
            {
                if (child.hThread != IntPtr.Zero) CloseHandle(child.hThread);
                if (child.hProcess != IntPtr.Zero) CloseHandle(child.hProcess);
                if (job != IntPtr.Zero) CloseHandle(job);
                if (environment != IntPtr.Zero) DestroyEnvironmentBlock(environment);
                if (restrictedToken != IntPtr.Zero) CloseHandle(restrictedToken);
                if (processToken != IntPtr.Zero) CloseHandle(processToken);
            }
        }

        private static IntPtr CreateAb04RestrictedToken(IntPtr processToken)
        {
            SID_AND_ATTRIBUTES[] disabled = new SID_AND_ATTRIBUTES[SidsToDisable.Length];
            IntPtr[] allocations = new IntPtr[SidsToDisable.Length];
            try
            {
                for (int i = 0; i < SidsToDisable.Length; i++)
                {
                    if (!ConvertStringSidToSidW(SidsToDisable[i], out allocations[i])) throw NativeError("ConvertStringSidToSidW");
                    disabled[i].Sid = allocations[i];
                    disabled[i].Attributes = 0;
                }
                IntPtr restricted;
                if (!CreateRestrictedToken(
                    processToken,
                    DISABLE_MAX_PRIVILEGE,
                    (uint)disabled.Length,
                    disabled,
                    0,
                    null,
                    0,
                    null,
                    out restricted))
                {
                    throw NativeError("CreateRestrictedToken");
                }
                try
                {
                    RemoveAllPrivileges(restricted);
                    return restricted;
                }
                catch
                {
                    CloseHandle(restricted);
                    throw;
                }
            }
            finally
            {
                for (int i = 0; i < allocations.Length; i++) if (allocations[i] != IntPtr.Zero) LocalFree(allocations[i]);
            }
        }

        private static void RemoveAllPrivileges(IntPtr token)
        {
            List<LUID_AND_ATTRIBUTES> held = ReadPrivileges(token);
            for (int i = 0; i < held.Count; i++)
            {
                TOKEN_PRIVILEGES_ONE privileges = new TOKEN_PRIVILEGES_ONE();
                privileges.PrivilegeCount = 1;
                privileges.Privileges = held[i];
                privileges.Privileges.Attributes = SE_PRIVILEGE_REMOVED;
                SetLastError(0);
                if (!AdjustTokenPrivileges(token, false, ref privileges, 0, IntPtr.Zero, IntPtr.Zero)) throw NativeError("AdjustTokenPrivileges");
                int error = Marshal.GetLastWin32Error();
                if (error == ERROR_NOT_ALL_ASSIGNED) throw new Win32Exception(error, "AdjustTokenPrivileges");
            }
            if (ReadPrivileges(token).Count != 0) throw new InvalidOperationException("AB04_TOKEN_PRIVILEGES_REMAIN");
        }

        private static List<LUID_AND_ATTRIBUTES> ReadPrivileges(IntPtr token)
        {
            IntPtr buffer = QueryTokenInformation(token, TokenPrivileges);
            try
            {
                int count = Marshal.ReadInt32(buffer);
                int offset = (int)Marshal.OffsetOf(typeof(TOKEN_PRIVILEGES_ONE), "Privileges");
                int size = Marshal.SizeOf(typeof(LUID_AND_ATTRIBUTES));
                List<LUID_AND_ATTRIBUTES> privileges = new List<LUID_AND_ATTRIBUTES>(count);
                for (int i = 0; i < count; i++)
                {
                    IntPtr entryPointer = new IntPtr(buffer.ToInt64() + offset + (long)i * size);
                    privileges.Add((LUID_AND_ATTRIBUTES)Marshal.PtrToStructure(entryPointer, typeof(LUID_AND_ATTRIBUTES)));
                }
                return privileges;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static TokenSnapshot InspectToken(IntPtr token)
        {
            TokenSnapshot snapshot = new TokenSnapshot();
            snapshot.UserSid = ReadUserSid(token);
            snapshot.AuthenticatedUsers = ReadGroupState(token, "S-1-5-11");
            snapshot.BuiltinUsers = ReadGroupState(token, "S-1-5-32-545");
            snapshot.Administrators = ReadGroupState(token, "S-1-5-32-544");
            snapshot.AdministratorsMember = CheckMembership(token, "S-1-5-32-544");
            snapshot.ChangeNotifyPrivilege = ReadPrivilegeState(token, "SeChangeNotifyPrivilege");
            snapshot.PrivilegeCount = ReadPrivileges(token).Count;
            snapshot.Integrity = ReadIntegrity(token);
            snapshot.IsRestricted = IsTokenRestricted(token);
            return snapshot;
        }

        private static string ReadUserSid(IntPtr token)
        {
            IntPtr buffer = QueryTokenInformation(token, TokenUser);
            try
            {
                TOKEN_USER user = (TOKEN_USER)Marshal.PtrToStructure(buffer, typeof(TOKEN_USER));
                return SidToString(user.User.Sid);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static string ReadGroupState(IntPtr token, string expectedSid)
        {
            IntPtr buffer = QueryTokenInformation(token, TokenGroups);
            try
            {
                int count = Marshal.ReadInt32(buffer);
                int offset = IntPtr.Size == 8 ? 8 : 4;
                int size = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
                for (int i = 0; i < count; i++)
                {
                    IntPtr entryPointer = new IntPtr(buffer.ToInt64() + offset + (long)i * size);
                    SID_AND_ATTRIBUTES entry = (SID_AND_ATTRIBUTES)Marshal.PtrToStructure(entryPointer, typeof(SID_AND_ATTRIBUTES));
                    if (String.Equals(SidToString(entry.Sid), expectedSid, StringComparison.OrdinalIgnoreCase))
                    {
                        if ((entry.Attributes & SE_GROUP_USE_FOR_DENY_ONLY) != 0) return "DENY_ONLY";
                        if ((entry.Attributes & SE_GROUP_ENABLED) == 0) return "DISABLED";
                        return "ENABLED";
                    }
                }
                return "ABSENT";
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static string ReadPrivilegeState(IntPtr token, string privilegeName)
        {
            IntPtr buffer = QueryTokenInformation(token, TokenPrivileges);
            try
            {
                int count = Marshal.ReadInt32(buffer);
                int offset = 4;
                int size = Marshal.SizeOf(typeof(LUID_AND_ATTRIBUTES));
                for (int i = 0; i < count; i++)
                {
                    IntPtr entryPointer = new IntPtr(buffer.ToInt64() + offset + (long)i * size);
                    LUID_AND_ATTRIBUTES entry = (LUID_AND_ATTRIBUTES)Marshal.PtrToStructure(entryPointer, typeof(LUID_AND_ATTRIBUTES));
                    int nameLength = 0;
                    LookupPrivilegeNameW(null, ref entry.Luid, null, ref nameLength);
                    StringBuilder name = new StringBuilder(nameLength + 1);
                    if (!LookupPrivilegeNameW(null, ref entry.Luid, name, ref nameLength)) throw NativeError("LookupPrivilegeNameW");
                    if (String.Equals(name.ToString(), privilegeName, StringComparison.OrdinalIgnoreCase))
                    {
                        if ((entry.Attributes & SE_PRIVILEGE_REMOVED) != 0) return "REMOVED";
                        return (entry.Attributes & SE_PRIVILEGE_ENABLED) != 0 ? "ENABLED" : "DISABLED";
                    }
                }
                return "REMOVED";
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static string ReadIntegrity(IntPtr token)
        {
            IntPtr buffer = QueryTokenInformation(token, TokenIntegrityLevel);
            try
            {
                TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
                IntPtr countPointer = GetSidSubAuthorityCount(label.Label.Sid);
                byte count = Marshal.ReadByte(countPointer);
                uint rid = (uint)Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1)));
                if (rid >= 0x4000) return "SYSTEM";
                if (rid >= 0x3000) return "HIGH";
                if (rid >= 0x2000) return "MEDIUM";
                if (rid >= 0x1000) return "LOW";
                return "UNTRUSTED";
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static bool CheckMembership(IntPtr token, string sidText)
        {
            IntPtr sid = IntPtr.Zero;
            try
            {
                if (!ConvertStringSidToSidW(sidText, out sid)) throw NativeError("ConvertStringSidToSidW");
                bool member;
                if (!CheckTokenMembership(token, sid, out member)) throw NativeError("CheckTokenMembership");
                return member;
            }
            finally { if (sid != IntPtr.Zero) LocalFree(sid); }
        }

        private static IntPtr QueryTokenInformation(IntPtr token, int informationClass)
        {
            int length = 0;
            GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out length);
            if (length <= 0) throw NativeError("GetTokenInformation(size)");
            IntPtr buffer = Marshal.AllocHGlobal(length);
            if (!GetTokenInformation(token, informationClass, buffer, length, out length))
            {
                Marshal.FreeHGlobal(buffer);
                throw NativeError("GetTokenInformation");
            }
            return buffer;
        }

        private static IntPtr CreateConfiningJob()
        {
            IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw NativeError("CreateJobObjectW");
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(limits, buffer, false);
                if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, buffer, (uint)size)) throw NativeError("SetInformationJobObject");
                return job;
            }
            catch
            {
                CloseHandle(job);
                throw;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static string BuildReport(TokenSnapshot parent, TokenSnapshot child, string expectedSid, string creationApi, uint bootstrapPid, uint builderPid, bool sameRestrictions)
        {
            return "{" +
                "\"schemaVersion\":1," +
                "\"compliant\":true," +
                "\"expectedUserSid\":\"" + JsonEscape(expectedSid) + "\"," +
                "\"bootstrapPid\":" + bootstrapPid + "," +
                "\"builderPid\":" + builderPid + "," +
                "\"creationApi\":\"" + creationApi + "\"," +
                "\"userSid\":\"" + JsonEscape(parent.UserSid) + "\"," +
                "\"authenticatedUsers\":\"" + parent.AuthenticatedUsers + "\"," +
                "\"builtinUsers\":\"" + parent.BuiltinUsers + "\"," +
                "\"administrators\":\"" + parent.Administrators + "\"," +
                "\"administratorsMember\":" + JsonBool(parent.AdministratorsMember) + "," +
                "\"seChangeNotifyPrivilege\":\"" + parent.ChangeNotifyPrivilege + "\"," +
                "\"privilegeCount\":" + parent.PrivilegeCount + "," +
                "\"integrity\":\"" + parent.Integrity + "\"," +
                "\"isRestricted\":" + JsonBool(parent.IsRestricted) + "," +
                "\"childProcessTokenSameRestrictions\":" + JsonBool(sameRestrictions) + "," +
                "\"child\":" + child.ToJson() +
                "}";
        }

        private static string BuildCommandLine(string executablePath, string[] arguments)
        {
            StringBuilder command = new StringBuilder(QuoteArgument(executablePath));
            for (int i = 0; i < arguments.Length; i++) command.Append(' ').Append(QuoteArgument(arguments[i] ?? String.Empty));
            return command.ToString();
        }

        private static string QuoteArgument(string value)
        {
            if (value == null) value = String.Empty;
            if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return value;
            StringBuilder result = new StringBuilder("\"");
            int backslashes = 0;
            for (int i = 0; i < value.Length; i++)
            {
                char character = value[i];
                if (character == '\\') { backslashes++; continue; }
                if (character == '"')
                {
                    result.Append('\\', backslashes * 2 + 1).Append('"');
                    backslashes = 0;
                    continue;
                }
                result.Append('\\', backslashes).Append(character);
                backslashes = 0;
            }
            result.Append('\\', backslashes * 2).Append('"');
            return result.ToString();
        }

        private static string SidToString(IntPtr sid)
        {
            IntPtr text = IntPtr.Zero;
            try
            {
                if (!ConvertSidToStringSidW(sid, out text)) throw NativeError("ConvertSidToStringSidW");
                return Marshal.PtrToStringUni(text);
            }
            finally { if (text != IntPtr.Zero) LocalFree(text); }
        }

        private static string JsonEscape(string value)
        {
            if (value == null) return String.Empty;
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
        }

        private static string JsonBool(bool value) { return value ? "true" : "false"; }

        private static void RequireAbsoluteExistingFile(string path, string parameter)
        {
            if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path) || !File.Exists(path)) throw new ArgumentException("absolute existing file required", parameter);
        }

        private static void RequireAbsoluteExistingDirectory(string path, string parameter)
        {
            if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path) || !Directory.Exists(path)) throw new ArgumentException("absolute existing directory required", parameter);
        }

        private static Win32Exception NativeError(string api) { return new Win32Exception(Marshal.GetLastWin32Error(), api); }

        private sealed class TokenSnapshot
        {
            public string UserSid;
            public string AuthenticatedUsers;
            public string BuiltinUsers;
            public string Administrators;
            public bool AdministratorsMember;
            public string ChangeNotifyPrivilege;
            public int PrivilegeCount;
            public string Integrity;
            public bool IsRestricted;

            public void AssertCompliant(string expectedSid)
            {
                if (!String.Equals(UserSid, expectedSid, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("AB04_TOKEN_USER_SID_MISMATCH");
                if (AuthenticatedUsers != "DENY_ONLY" && AuthenticatedUsers != "DISABLED") throw new InvalidOperationException("AB04_AUTHENTICATED_USERS_ENABLED");
                if (BuiltinUsers != "DENY_ONLY" && BuiltinUsers != "DISABLED") throw new InvalidOperationException("AB04_BUILTIN_USERS_ENABLED");
                if (AdministratorsMember) throw new InvalidOperationException("AB04_ADMINISTRATORS_MEMBER");
                if (ChangeNotifyPrivilege != "REMOVED" && ChangeNotifyPrivilege != "DISABLED") throw new InvalidOperationException("AB04_CHANGE_NOTIFY_PRIVILEGE_ENABLED");
                if (PrivilegeCount != 0) throw new InvalidOperationException("AB04_TOKEN_PRIVILEGES_REMAIN");
                if (Integrity != "MEDIUM") throw new InvalidOperationException("AB04_INTEGRITY_NOT_MEDIUM");
                if (!IsRestricted) throw new InvalidOperationException("AB04_TOKEN_NOT_RESTRICTED");
            }

            public bool HasSameRestrictions(TokenSnapshot other)
            {
                return other != null &&
                    String.Equals(UserSid, other.UserSid, StringComparison.OrdinalIgnoreCase) &&
                    AuthenticatedUsers == other.AuthenticatedUsers &&
                    BuiltinUsers == other.BuiltinUsers &&
                    AdministratorsMember == other.AdministratorsMember &&
                    ChangeNotifyPrivilege == other.ChangeNotifyPrivilege &&
                    PrivilegeCount == other.PrivilegeCount &&
                    Integrity == other.Integrity &&
                    IsRestricted == other.IsRestricted;
            }

            public string ToJson()
            {
                return "{" +
                    "\"userSid\":\"" + JsonEscape(UserSid) + "\"," +
                    "\"authenticatedUsers\":\"" + AuthenticatedUsers + "\"," +
                    "\"builtinUsers\":\"" + BuiltinUsers + "\"," +
                    "\"administratorsMember\":" + JsonBool(AdministratorsMember) + "," +
                    "\"seChangeNotifyPrivilege\":\"" + ChangeNotifyPrivilege + "\"," +
                    "\"privilegeCount\":" + PrivilegeCount + "," +
                    "\"integrity\":\"" + Integrity + "\"," +
                    "\"isRestricted\":" + JsonBool(IsRestricted) +
                    "}";
            }
        }

        [StructLayout(LayoutKind.Sequential)] private struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
        [StructLayout(LayoutKind.Sequential)] private struct TOKEN_USER { public SID_AND_ATTRIBUTES User; }
        [StructLayout(LayoutKind.Sequential)] private struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
        [StructLayout(LayoutKind.Sequential)] private struct LUID { public uint LowPart; public int HighPart; }
        [StructLayout(LayoutKind.Sequential)] private struct LUID_AND_ATTRIBUTES { public LUID Luid; public uint Attributes; }
        [StructLayout(LayoutKind.Sequential)] private struct TOKEN_PRIVILEGES_ONE { public uint PrivilegeCount; public LUID_AND_ATTRIBUTES Privileges; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct STARTUPINFO
        {
            public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
            public uint dwX; public uint dwY; public uint dwXSize; public uint dwYSize;
            public uint dwXCountChars; public uint dwYCountChars; public uint dwFillAttribute;
            public uint dwFlags; public ushort wShowWindow; public ushort cbReserved2;
            public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
        }
        [StructLayout(LayoutKind.Sequential)] private struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public uint dwProcessId; public uint dwThreadId; }
        [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
            public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] private struct IO_COUNTERS
        {
            public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
            public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount;
        }
        [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool LogonUserW(string user, string domain, IntPtr password, int logonType, int logonProvider, out IntPtr token);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcessWithLogonW(string user, string domain, IntPtr password, uint logonFlags, string applicationName, StringBuilder commandLine, uint creationFlags, IntPtr environment, string currentDirectory, ref STARTUPINFO startupInfo, out PROCESS_INFORMATION processInformation);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcessAsUserW(IntPtr token, string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref STARTUPINFO startupInfo, out PROCESS_INFORMATION processInformation);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool CreateRestrictedToken(IntPtr existingToken, uint flags, uint disableSidCount, [In] SID_AND_ATTRIBUTES[] sidsToDisable, uint deletePrivilegeCount, [In] LUID_AND_ATTRIBUTES[] privilegesToDelete, uint restrictedSidCount, [In] SID_AND_ATTRIBUTES[] sidsToRestrict, out IntPtr newToken);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TOKEN_PRIVILEGES_ONE newState, int bufferLength, IntPtr previousState, IntPtr returnLength);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool LookupPrivilegeValueW(string systemName, string name, out LUID luid);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool LookupPrivilegeNameW(string systemName, ref LUID luid, StringBuilder name, ref int nameLength);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int informationClass, IntPtr information, int informationLength, out int returnLength);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool CheckTokenMembership(IntPtr token, IntPtr sid, out bool isMember);
        [DllImport("advapi32.dll")] private static extern bool IsTokenRestricted(IntPtr token);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool ConvertStringSidToSidW(string stringSid, out IntPtr sid);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr stringSid);
        [DllImport("advapi32.dll")] private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
        [DllImport("advapi32.dll")] private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);
        [DllImport("userenv.dll", SetLastError = true)] private static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);
        [DllImport("userenv.dll", SetLastError = true)] private static extern bool DestroyEnvironmentBlock(IntPtr environment);
        [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObjectW(IntPtr jobAttributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint informationLength);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
        [DllImport("kernel32.dll")] private static extern void SetLastError(uint errorCode);
    }
}
