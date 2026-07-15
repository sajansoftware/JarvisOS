"""Life Dashboard — Markdown file parser with caching.

Reads the user's life OS markdown files and returns structured JSON
for the frontend dashboard tabs (Health, Business, Relationships).
"""

import json
import logging
import os
import random
import time
from datetime import date, datetime
from pathlib import Path

logger = logging.getLogger("jarvis.life_dashboard")

# Base directory for life OS data files
BASE_DIR = Path(__file__).parent.parent.parent  # jarvis-os/

# Cache: parsed data + timestamp
_cache: dict = {}
_cache_time: float = 0
CACHE_TTL = 60  # seconds


def _read_file(path: Path) -> str:
    """Read a file, return empty string if missing."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
    except Exception as e:
        logger.warning("Failed to read %s: %s", path, e)
        return ""


def _ensure_dir(path: Path) -> None:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


def _parse_energy_log(content: str) -> dict:
    """Parse coaching/energy-log.md for mood, energy, focus values.

    Expected format (latest entry at bottom):
    ## 2025-07-15
    - Mood: 7
    - Energy: 6
    - Focus: 8
    """
    result = {"mood": 0, "energy": 0, "focus": 0, "date": ""}
    if not content:
        return result

    lines = content.strip().split("\n")
    current_date = ""

    for line in reversed(lines):
        line = line.strip()
        if line.startswith("## "):
            current_date = line[3:].strip()
            if result["date"] == "":
                result["date"] = current_date
            break
        lower = line.lower()
        if lower.startswith("- mood:"):
            try:
                result["mood"] = int(line.split(":")[1].strip())
            except (ValueError, IndexError):
                pass
        elif lower.startswith("- energy:"):
            try:
                result["energy"] = int(line.split(":")[1].strip())
            except (ValueError, IndexError):
                pass
        elif lower.startswith("- focus:"):
            try:
                result["focus"] = int(line.split(":")[1].strip())
            except (ValueError, IndexError):
                pass

    return result


def _parse_habits(content: str) -> list[dict]:
    """Parse coaching/habits.md for habit streaks.

    Expected format:
    ## Habits
    - Journaling: 5 days
    - Exercise: 3 days
    - Meditation: 12 days
    """
    habits = []
    if not content:
        return habits

    for line in content.strip().split("\n"):
        line = line.strip()
        if line.startswith("- ") and ":" in line:
            parts = line[2:].split(":", 1)
            name = parts[0].strip()
            value = parts[1].strip()
            habits.append({"name": name, "value": value})

    return habits


def _parse_prompts(content: str) -> str:
    """Parse coaching/prompts.md and return a random prompt.

    Expected format — one prompt per line starting with -:
    - What are you grateful for today?
    - What's one thing you can improve?
    """
    if not content:
        return "What's one thing you want to accomplish today?"

    prompts = []
    for line in content.strip().split("\n"):
        line = line.strip()
        if line.startswith("- "):
            prompts.append(line[2:].strip())

    if not prompts:
        return "What's one thing you want to accomplish today?"

    return random.choice(prompts)


def _parse_health(content: str) -> dict:
    """Parse areas/health.md for fitness protocols and data."""
    result = {"protocols": [], "sleep_hours": 0, "exercised_today": False}
    if not content:
        return result

    in_protocols = False
    for line in content.strip().split("\n"):
        line = line.strip()
        lower = line.lower()

        if "protocol" in lower and line.startswith("#"):
            in_protocols = True
            continue
        elif line.startswith("#"):
            in_protocols = False

        if in_protocols and line.startswith("- "):
            result["protocols"].append(line[2:].strip())

        if lower.startswith("- sleep:") or lower.startswith("- sleep last night:"):
            try:
                val = line.split(":")[-1].strip().replace("hrs", "").replace("hours", "").strip()
                result["sleep_hours"] = float(val)
            except (ValueError, IndexError):
                pass

        if lower.startswith("- exercise") and ("yes" in lower or "done" in lower or "true" in lower):
            result["exercised_today"] = True

    return result


def _parse_pipeline(content: str) -> dict:
    """Parse projects/saas/pipeline.md for SaaS pipeline data."""
    result = {"stages": {}, "products": []}
    if not content:
        return result

    current_stage = ""
    for line in content.strip().split("\n"):
        line = line.strip()
        if line.startswith("## "):
            current_stage = line[3:].strip()
            if current_stage not in result["stages"]:
                result["stages"][current_stage] = 0
        elif line.startswith("- ") and current_stage:
            result["stages"][current_stage] = result["stages"].get(current_stage, 0) + 1
            name = line[2:].strip()
            # Parse "Name — status" or "Name (status)"
            status = "active"
            if "—" in name or " - " in name:
                parts = name.replace("—", "-").split(" - ", 1)
                name = parts[0].strip()
                status = parts[1].strip() if len(parts) > 1 else "active"
            result["products"].append({
                "name": name,
                "stage": current_stage,
                "status": status,
            })

    return result


def _parse_ai_clients(directory: Path) -> list[dict]:
    """Parse projects/ai-clients/ directory for client project files."""
    clients = []
    if not directory.exists():
        return clients

    for f in sorted(directory.glob("*.md")):
        content = _read_file(f)
        name = f.stem.replace("-", " ").replace("_", " ").title()
        status = "active"

        for line in content.split("\n"):
            lower = line.strip().lower()
            if lower.startswith("- status:") or lower.startswith("status:"):
                status = line.split(":", 1)[1].strip()
                break

        clients.append({"name": name, "status": status, "file": f.name})

    return clients


def _parse_relationships(content: str) -> dict:
    """Parse areas/relationships.md for key people and suggestions."""
    result = {"key_people": [], "reach_out": [], "learn_from": []}
    if not content:
        return result

    section = ""
    for line in content.strip().split("\n"):
        line = line.strip()
        lower = line.lower()

        if line.startswith("#"):
            if "key" in lower or "people" in lower or "inner" in lower:
                section = "key_people"
            elif "reach" in lower or "reconnect" in lower:
                section = "reach_out"
            elif "learn" in lower or "mentor" in lower:
                section = "learn_from"
            else:
                section = ""
            continue

        if line.startswith("- ") and section:
            result[section].append(line[2:].strip())

    return result


def get_dashboard_data() -> dict:
    """Get all life dashboard data. Uses 60s cache."""
    global _cache, _cache_time

    now = time.time()
    if _cache and (now - _cache_time) < CACHE_TTL:
        return _cache

    coaching_dir = BASE_DIR / "coaching"
    areas_dir = BASE_DIR / "areas"
    projects_dir = BASE_DIR / "projects"

    # Parse all data sources
    energy_log = _parse_energy_log(_read_file(coaching_dir / "energy-log.md"))
    habits = _parse_habits(_read_file(coaching_dir / "habits.md"))
    coaching_prompt = _parse_prompts(_read_file(coaching_dir / "prompts.md"))
    health = _parse_health(_read_file(areas_dir / "health.md"))
    pipeline = _parse_pipeline(_read_file(projects_dir / "saas" / "pipeline.md"))
    ai_clients = _parse_ai_clients(projects_dir / "ai-clients")
    relationships = _parse_relationships(_read_file(areas_dir / "relationships.md"))

    data = {
        "health": {
            "mental": {
                "mood": energy_log["mood"],
                "energy": energy_log["energy"],
                "focus": energy_log["focus"],
                "last_entry_date": energy_log["date"],
                "coaching_prompt": coaching_prompt,
            },
            "fitness": {
                "sleep_hours": health["sleep_hours"],
                "exercised_today": health["exercised_today"],
                "protocols": health["protocols"],
                "habit_streaks": habits,
            },
        },
        "business": {
            "overview": {
                "ai_clients": ai_clients,
                "active_projects": len(ai_clients),
            },
            "saas": {
                "pipeline_summary": pipeline["stages"],
                "products": pipeline["products"],
            },
        },
        "relationships": relationships,
    }

    _cache = data
    _cache_time = now
    return data


def invalidate_cache() -> None:
    """Force cache invalidation after a write."""
    global _cache_time
    _cache_time = 0


def update_energy_log(mood: int = 0, energy: int = 0, focus: int = 0) -> str:
    """Write mood/energy/focus values to coaching/energy-log.md for today."""
    coaching_dir = BASE_DIR / "coaching"
    _ensure_dir(coaching_dir)
    filepath = coaching_dir / "energy-log.md"

    today = date.today().isoformat()
    content = _read_file(filepath)

    # Check if today's entry already exists
    if f"## {today}" in content:
        # Update existing entry
        lines = content.split("\n")
        new_lines = []
        in_today = False
        for line in lines:
            if line.strip() == f"## {today}":
                in_today = True
                new_lines.append(line)
                if mood:
                    new_lines.append(f"- Mood: {mood}")
                if energy:
                    new_lines.append(f"- Energy: {energy}")
                if focus:
                    new_lines.append(f"- Focus: {focus}")
                continue
            if in_today and (line.strip().startswith("- Mood:") or
                             line.strip().startswith("- Energy:") or
                             line.strip().startswith("- Focus:")):
                continue  # Skip old values
            if in_today and (line.strip().startswith("## ") or line.strip() == ""):
                in_today = False
            new_lines.append(line)
        content = "\n".join(new_lines)
    else:
        # Append new entry
        entry = f"\n## {today}\n"
        if mood:
            entry += f"- Mood: {mood}\n"
        if energy:
            entry += f"- Energy: {energy}\n"
        if focus:
            entry += f"- Focus: {focus}\n"
        content += entry

    filepath.write_text(content, encoding="utf-8")
    invalidate_cache()
    return f"Updated energy log for {today}"


def log_habit(habit_name: str, done: bool = True) -> str:
    """Mark a habit as done/not done for today in coaching/habits.md."""
    coaching_dir = BASE_DIR / "coaching"
    _ensure_dir(coaching_dir)
    filepath = coaching_dir / "habits.md"

    content = _read_file(filepath)

    if not content:
        content = "# Habits\n\n"

    # Simple tracking: update or add the habit line
    lines = content.split("\n")
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"- {habit_name}:"):
            # Parse current streak
            try:
                current = line.split(":")[1].strip()
                days = int(current.split()[0])
                if done:
                    days += 1
                else:
                    days = 0
                lines[i] = f"- {habit_name}: {days} days"
            except (ValueError, IndexError):
                lines[i] = f"- {habit_name}: 1 days" if done else f"- {habit_name}: 0 days"
            found = True
            break

    if not found:
        lines.append(f"- {habit_name}: {'1' if done else '0'} days")

    filepath.write_text("\n".join(lines), encoding="utf-8")
    invalidate_cache()
    status = "logged" if done else "reset"
    return f"Habit '{habit_name}' {status} for today"


def get_coaching_prompt() -> str:
    """Return a random coaching prompt from prompts.md."""
    content = _read_file(BASE_DIR / "coaching" / "prompts.md")
    return _parse_prompts(content)
