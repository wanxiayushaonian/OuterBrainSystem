"""Provider registry for runtime factories."""
from typing import Dict, Type, List
from ..runtime.base import ChatRuntime


class ProviderRegistry:
    """Registry for chat runtime providers.

    Providers register themselves using the @register decorator.
    """

    _providers: Dict[str, Type[ChatRuntime]] = {}

    @classmethod
    def register(cls, provider_id: str):
        """Decorator to register a provider.

        Usage:
            @ProviderRegistry.register("anthropic")
            class AnthropicRuntime(ChatRuntime):
                ...
        """
        def decorator(provider_cls: Type[ChatRuntime]):
            cls._providers[provider_id] = provider_cls
            return provider_cls
        return decorator

    @classmethod
    def create_runtime(cls, provider_id: str, **config) -> ChatRuntime:
        """Create a runtime instance for the given provider.

        Args:
            provider_id: Provider identifier (e.g., "anthropic", "openai")
            **config: Provider-specific configuration

        Returns:
            ChatRuntime: Runtime instance

        Raises:
            ValueError: If provider is not registered
        """
        if provider_id not in cls._providers:
            raise ValueError(
                f"Unknown provider: {provider_id}. "
                f"Available: {', '.join(cls.list_providers())}"
            )
        return cls._providers[provider_id](**config)

    @classmethod
    def list_providers(cls) -> List[str]:
        """List all registered provider IDs."""
        return list(cls._providers.keys())

    @classmethod
    def has_provider(cls, provider_id: str) -> bool:
        """Check if a provider is registered."""
        return provider_id in cls._providers
