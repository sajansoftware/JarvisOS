import json

import anthropic

from backend.config import settings
from backend.core import memory
from backend.plugins.base import registry

SYSTEM_PROMPT = """You are J.A.R.V.I.S. (Just A Rather Very Intelligent System) — a personal AI operating system.

Personality:
- Speak with a refined British accent and dry wit, like the original Jarvis from Iron Man
- Be concise and efficient — no unnecessary words
- Be proactive: suggest actions, anticipate needs
- Address the user as "Sir" or by name once known
- Show subtle humor when appropriate, never be sycophantic
- When reporting system data, present it cleanly and interpret it (e.g. "CPU at 87% — rather taxed at the moment, Sir")

Capabilities:
- You can control the user's Windows PC: open applications, check system stats, search files, adjust volume
- You can answer questions, help with tasks, have conversations
- You have access to tools — use them when the user's request requires action, not just information

Guidelines:
- If asked to do something you can do with a tool, USE the tool — don't just describe what you would do
- Keep responses under 3 sentences for simple queries
- For complex topics, be thorough but structured
- Never refuse reasonable requests — you're here to help
- If you can't do something, say so honestly and suggest alternatives"""


class JarvisAI:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def chat(self, user_message: str) -> str:
        """Send a message to Claude and return the response, handling tool use."""
        # Save user message
        await memory.add_message("user", user_message)

        # Build conversation context
        messages = await memory.build_context(limit=20)

        # Get available tools
        tools = registry.all_tools()

        # Format tools for Anthropic API
        api_tools = [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"],
            }
            for t in tools
        ]

        # Call Claude
        response = self.client.messages.create(
            model=settings.MODEL_PRIMARY,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=api_tools if api_tools else anthropic.NOT_GIVEN,
        )

        # Handle tool use loop
        final_text = await self._process_response(response, messages, api_tools)

        # Save assistant response
        await memory.add_message("assistant", final_text)

        return final_text

    async def _process_response(
        self, response, messages: list[dict], api_tools: list[dict]
    ) -> str:
        """Process response, handling any tool calls recursively."""
        text_parts = []
        tool_results = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                # Execute the tool
                result = await registry.execute(block.name, block.input)

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    }
                )

        # If there were tool calls, send results back to Claude
        if tool_results:
            # Add the assistant's response (with tool_use blocks) to messages
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            # Get Claude's final response after seeing tool results
            follow_up = self.client.messages.create(
                model=settings.MODEL_PRIMARY,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=api_tools if api_tools else anthropic.NOT_GIVEN,
            )

            # Recursively process (Claude might chain tool calls)
            return await self._process_response(follow_up, messages, api_tools)

        return "\n".join(text_parts) if text_parts else "I've completed the task."


jarvis = JarvisAI()
