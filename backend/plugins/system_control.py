import json
import os
import platform
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import psutil

from .base import Plugin

APP_MAP = {
    "notepad": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "paint": ["mspaint.exe"],
    "explorer": ["explorer.exe"],
    "file explorer": ["explorer.exe"],
    "task manager": ["taskmgr.exe"],
    "cmd": ["cmd.exe"],
    "terminal": ["wt.exe"],
    "powershell": ["powershell.exe"],
    "chrome": [r"C:\Program Files\Google\Chrome\Application\chrome.exe"],
    "google chrome": [r"C:\Program Files\Google\Chrome\Application\chrome.exe"],
    "firefox": [r"C:\Program Files\Mozilla Firefox\firefox.exe"],
    "edge": ["msedge.exe"],
    "microsoft edge": ["msedge.exe"],
    "vscode": ["code"],
    "visual studio code": ["code"],
    "spotify": [os.path.expandvars(r"%APPDATA%\Spotify\Spotify.exe")],
    "discord": [
        os.path.expandvars(r"%LOCALAPPDATA%\Discord\Update.exe"),
        "--processStart",
        "Discord.exe",
    ],
    "slack": [os.path.expandvars(r"%LOCALAPPDATA%\slack\slack.exe")],
    "word": ["WINWORD.EXE"],
    "excel": ["EXCEL.EXE"],
    "powerpoint": ["POWERPNT.EXE"],
    "outlook": ["OUTLOOK.EXE"],
    "snipping tool": ["SnippingTool.exe"],
}

# URI schemes handled separately via os.startfile
URI_APPS = {
    "settings": "ms-settings:",
}

# Allowed base directories for file search
ALLOWED_SEARCH_ROOTS = [
    os.path.expanduser("~"),
    "C:\\Users",
    "D:\\",
]


class SystemControlPlugin(Plugin):
    @property
    def name(self) -> str:
        return "system_control"

    @property
    def description(self) -> str:
        return "Control the local Windows system: open apps, get stats, search files."

    def get_tools(self) -> list[dict]:
        return [
            {
                "name": "get_system_stats",
                "description": "Get current system statistics including CPU usage, RAM usage, disk usage, and battery status.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
            {
                "name": "open_application",
                "description": f"Open an application on the user's Windows PC. Known apps: {', '.join(sorted(APP_MAP.keys()))}.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "app_name": {
                            "type": "string",
                            "description": "Name of the application to open (e.g. 'chrome', 'notepad', 'vscode'). Must be one of the known app names.",
                        }
                    },
                    "required": ["app_name"],
                },
            },
            {
                "name": "get_system_info",
                "description": "Get general system information: OS, hostname, uptime, IP address, username.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
            {
                "name": "search_files",
                "description": "Search for files by name pattern in the user's home directory or a subdirectory of it.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "directory": {
                            "type": "string",
                            "description": "Directory to search in. Must be within the user's home directory. Defaults to home.",
                        },
                        "pattern": {
                            "type": "string",
                            "description": "Filename pattern to search for (e.g. '*.pdf', 'report*').",
                        },
                    },
                    "required": ["pattern"],
                },
            },
            {
                "name": "set_volume",
                "description": "Set the system volume level (0-100) or mute/unmute.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "level": {
                            "type": "integer",
                            "description": "Volume level from 0 to 100.",
                        },
                        "mute": {
                            "type": "boolean",
                            "description": "Set to true to mute, false to unmute.",
                        },
                    },
                },
            },
        ]

    async def execute(self, action: str, params: dict[str, Any]) -> str:
        match action:
            case "get_system_stats":
                return self._get_stats()
            case "open_application":
                return self._open_app(params.get("app_name", ""))
            case "get_system_info":
                return self._get_info()
            case "search_files":
                return self._search_files(
                    params.get("pattern", "*"),
                    params.get("directory", ""),
                )
            case "set_volume":
                return self._set_volume(
                    params.get("level"), params.get("mute")
                )
            case _:
                return f"Unknown action: {action}"

    def _get_stats(self) -> str:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()

        # Use the OS drive root on Windows, / on Unix
        disk_root = os.path.splitdrive(os.path.expanduser("~"))[0] + os.sep
        disk = psutil.disk_usage(disk_root)

        battery = psutil.sensors_battery()

        stats = {
            "cpu_percent": cpu,
            "ram_percent": mem.percent,
            "ram_used_gb": round(mem.used / (1024**3), 1),
            "ram_total_gb": round(mem.total / (1024**3), 1),
            "disk_percent": round(disk.percent, 1),
            "disk_used_gb": round(disk.used / (1024**3), 1),
            "disk_total_gb": round(disk.total / (1024**3), 1),
        }

        if battery:
            stats["battery_percent"] = round(battery.percent, 1)
            stats["battery_plugged"] = battery.power_plugged
            if battery.secsleft > 0:
                stats["battery_time_left"] = str(
                    time.strftime("%H:%M", time.gmtime(battery.secsleft))
                )

        return json.dumps(stats)

    def _open_app(self, app_name: str) -> str:
        app_lower = app_name.lower().strip()

        # Check URI apps first (ms-settings:, etc.)
        uri = URI_APPS.get(app_lower)
        if uri:
            os.startfile(uri)
            return f"Opening {app_name}."

        # Check the known app map — only allow whitelisted apps
        cmd_list = APP_MAP.get(app_lower)
        if not cmd_list:
            available = ", ".join(sorted(APP_MAP.keys()))
            return f"Unknown application '{app_name}'. Available apps: {available}"

        try:
            # Use shell=False with a list of args for security
            subprocess.Popen(
                cmd_list,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return f"Opening {app_name}."
        except FileNotFoundError:
            # Try finding it on PATH as fallback (e.g. "code" for VS Code)
            resolved = shutil.which(cmd_list[0])
            if resolved:
                try:
                    subprocess.Popen(
                        [resolved] + cmd_list[1:],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    return f"Opening {app_name}."
                except Exception as e:
                    return f"Failed to open {app_name}: {e}"
            return f"Could not find {app_name}. It may not be installed."
        except Exception as e:
            return f"Failed to open {app_name}: {e}"

    def _get_info(self) -> str:
        import socket

        boot_time = psutil.boot_time()
        uptime_seconds = int(time.time() - boot_time)
        hours, remainder = divmod(uptime_seconds, 3600)
        minutes, _ = divmod(remainder, 60)

        info = {
            "os": f"{platform.system()} {platform.release()}",
            "os_version": platform.version(),
            "hostname": platform.node(),
            "username": os.getlogin(),
            "processor": platform.processor(),
            "architecture": platform.machine(),
            "ip_address": socket.gethostbyname(socket.gethostname()),
            "uptime": f"{hours}h {minutes}m",
            "python_version": platform.python_version(),
        }
        return json.dumps(info)

    def _search_files(self, pattern: str, directory: str = "") -> str:
        import glob

        home = os.path.expanduser("~")
        if not directory:
            directory = home

        # Resolve and validate the directory to prevent path traversal
        try:
            resolved = str(Path(directory).resolve())
        except Exception:
            return f"Invalid directory: {directory}"

        is_allowed = any(
            resolved.startswith(str(Path(root).resolve()))
            for root in ALLOWED_SEARCH_ROOTS
        )
        if not is_allowed:
            return f"Access denied: searches are restricted to allowed directories."

        # Sanitize pattern — block path separators to prevent traversal via pattern
        if os.sep in pattern or "/" in pattern or "\\" in pattern:
            return "Invalid pattern: must not contain path separators."

        search_path = os.path.join(resolved, "**", pattern)
        results = []
        try:
            for f in glob.iglob(search_path, recursive=True):
                results.append(f)
                if len(results) >= 20:
                    break
        except Exception as e:
            return f"Search error: {e}"

        if not results:
            return f"No files matching '{pattern}' found in {directory}."
        return json.dumps(results)

    def _set_volume(self, level: int | None, mute: bool | None) -> str:
        try:
            if mute is not None:
                subprocess.run(
                    [
                        "powershell",
                        "-Command",
                        "(New-Object -ComObject WScript.Shell).SendKeys([char]173)",
                    ],
                    capture_output=True,
                    timeout=5,
                )
                return "System muted." if mute else "System unmuted."

            if level is not None:
                level = max(0, min(100, level))
                presses = round(level / 2)
                ps_cmd = (
                    "$wshell = New-Object -ComObject WScript.Shell; "
                    "1..50 | ForEach-Object { $wshell.SendKeys([char]174) }; "
                    f"1..{presses} | ForEach-Object {{ $wshell.SendKeys([char]175) }}"
                )
                subprocess.run(
                    ["powershell", "-Command", ps_cmd],
                    capture_output=True,
                    timeout=15,
                )
                return f"Volume set to approximately {level}%."

            return "No volume action specified."
        except subprocess.TimeoutExpired:
            return "Volume control timed out."
        except Exception as e:
            return f"Volume control error: {e}"
