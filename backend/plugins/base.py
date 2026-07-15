from abc import ABC, abstractmethod
from typing import Any


class Plugin(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @abstractmethod
    def get_tools(self) -> list[dict]:
        """Return list of tool definitions for the AI model."""
        ...

    @abstractmethod
    async def execute(self, action: str, params: dict[str, Any]) -> str:
        """Execute a tool action and return the result as a string."""
        ...


class PluginRegistry:
    _instance = None
    _plugins: dict[str, Plugin] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._plugins = {}
        return cls._instance

    def register(self, plugin: Plugin):
        self._plugins[plugin.name] = plugin

    def get(self, name: str) -> Plugin | None:
        return self._plugins.get(name)

    def all_tools(self) -> list[dict]:
        tools = []
        for plugin in self._plugins.values():
            tools.extend(plugin.get_tools())
        return tools

    async def execute(self, tool_name: str, params: dict[str, Any]) -> str:
        for plugin in self._plugins.values():
            for tool in plugin.get_tools():
                if tool["name"] == tool_name:
                    return await plugin.execute(tool_name, params)
        return f"Unknown tool: {tool_name}"

    @property
    def plugins(self) -> dict[str, Plugin]:
        return self._plugins


registry = PluginRegistry()
