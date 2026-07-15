"""Life Dashboard Plugin — Voice-driven tools for updating life OS data."""

import json
from typing import Any

from backend.core.life_dashboard import (
    get_coaching_prompt,
    get_dashboard_data,
    log_habit,
    update_energy_log,
)
from backend.plugins.base import Plugin


class LifeDashboardPlugin(Plugin):
    @property
    def name(self) -> str:
        return "life_dashboard"

    @property
    def description(self) -> str:
        return "Manage the user's life dashboard: mood, energy, habits, and coaching prompts"

    def get_tools(self) -> list[dict]:
        return [
            {
                "name": "update_mood",
                "description": (
                    "Update the user's mood, energy, or focus level for today. "
                    "Values are on a 1-10 scale. Call this when the user reports "
                    "how they're feeling, e.g. 'my mood is 7', 'energy is low (3)', "
                    "'I'm feeling focused (9)'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "mood": {
                            "type": "integer",
                            "description": "Mood level 1-10 (0 to skip)",
                            "minimum": 0,
                            "maximum": 10,
                        },
                        "energy": {
                            "type": "integer",
                            "description": "Energy level 1-10 (0 to skip)",
                            "minimum": 0,
                            "maximum": 10,
                        },
                        "focus": {
                            "type": "integer",
                            "description": "Focus level 1-10 (0 to skip)",
                            "minimum": 0,
                            "maximum": 10,
                        },
                    },
                    "required": [],
                },
            },
            {
                "name": "log_habit",
                "description": (
                    "Log a habit as completed or missed for today. "
                    "Call this when the user says things like 'I exercised today', "
                    "'I meditated', 'I journaled', 'I skipped my workout'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "habit_name": {
                            "type": "string",
                            "description": "Name of the habit (e.g. Exercise, Meditation, Journaling)",
                        },
                        "done": {
                            "type": "boolean",
                            "description": "True if completed, False if missed/skipped",
                            "default": True,
                        },
                    },
                    "required": ["habit_name"],
                },
            },
            {
                "name": "get_coaching_prompt",
                "description": (
                    "Get a random coaching/reflection prompt for the user. "
                    "Call this when the user asks for a prompt, wants inspiration, "
                    "or says 'give me a coaching prompt'."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
            {
                "name": "read_dashboard_data",
                "description": (
                    "Read the current life dashboard state including health metrics, "
                    "business projects, and relationships data. Call this when the "
                    "user asks about their dashboard, stats, or life OS data."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        ]

    async def execute(self, action: str, params: dict[str, Any]) -> str:
        if action == "update_mood":
            mood = params.get("mood", 0)
            energy = params.get("energy", 0)
            focus = params.get("focus", 0)
            return update_energy_log(mood=mood, energy=energy, focus=focus)

        elif action == "log_habit":
            habit_name = params.get("habit_name", "")
            done = params.get("done", True)
            if not habit_name:
                return "Error: habit_name is required"
            return log_habit(habit_name=habit_name, done=done)

        elif action == "get_coaching_prompt":
            prompt = get_coaching_prompt()
            return json.dumps({"prompt": prompt})

        elif action == "read_dashboard_data":
            data = get_dashboard_data()
            return json.dumps(data, default=str)

        return f"Unknown action: {action}"
