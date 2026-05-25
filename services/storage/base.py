from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class StorageBackend(ABC):
    """抽象存储后端基类"""

    @abstractmethod
    def load_accounts(self) -> list[dict[str, Any]]:
        """加载所有账号数据"""
        pass

    @abstractmethod
    def save_accounts(self, accounts: list[dict[str, Any]]) -> None:
        """保存所有账号数据"""
        pass

    @abstractmethod
    def load_auth_keys(self) -> list[dict[str, Any]]:
        """加载所有鉴权密钥数据"""
        pass

    @abstractmethod
    def save_auth_keys(self, auth_keys: list[dict[str, Any]]) -> None:
        """保存所有鉴权密钥数据"""
        pass

    @abstractmethod
    def load_users(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def save_users(self, users: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def load_sessions(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def save_sessions(self, sessions: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def load_redeem_codes(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def save_redeem_codes(self, redeem_codes: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def load_channels(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def save_channels(self, channels: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def load_image_records(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def save_image_records(self, image_records: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        """健康检查，返回存储后端状态"""
        pass

    @abstractmethod
    def get_backend_info(self) -> dict[str, Any]:
        """获取存储后端信息"""
        pass
