#!/usr/bin/env python3
"""
存储后端测试脚本

用法：
  python scripts/test_storage.py
"""

import os
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

from services.storage.factory import create_storage_backend


def test_storage():
    """测试当前配置的存储后端"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("=" * 60)
    print("ChatGPT2API 存储后端测试")
    print("=" * 60)
    
    # 显示当前配置
    backend_type = os.getenv("STORAGE_BACKEND", "json")
    print(f"\n当前存储后端: {backend_type}")
    
    if backend_type in ("sqlite", "postgres", "postgresql", "mysql", "database"):
        database_url = os.getenv("DATABASE_URL", "")
        if database_url:
            # 隐藏密码
            if "://" in database_url and "@" in database_url:
                protocol, rest = database_url.split("://", 1)
                if "@" in rest:
                    credentials, host = rest.split("@", 1)
                    if ":" in credentials:
                        username, _ = credentials.split(":", 1)
                        database_url = f"{protocol}://{username}:****@{host}"
            print(f"数据库连接: {database_url}")
        else:
            print(f"数据库连接: 本地 SQLite (data/accounts.db)")
    
    elif backend_type == "git":
        repo_url = os.getenv("GIT_REPO_URL", "")
        branch = os.getenv("GIT_BRANCH", "main")
        file_path = os.getenv("GIT_FILE_PATH", "accounts.json")
        print(f"Git 仓库: {repo_url}")
        print(f"Git 分支: {branch}")
        print(f"文件路径: {file_path}")
    
    print("\n" + "=" * 60)
    
    try:
        # 创建存储后端
        print("\n[1/5] 创建存储后端...")
        storage = create_storage_backend(DATA_DIR)
        print("✅ 存储后端创建成功")
        
        # 获取后端信息
        print("\n[2/5] 获取后端信息...")
        info = storage.get_backend_info()
        print(f"✅ 后端类型: {info.get('type')}")
        print(f"   描述: {info.get('description')}")
        for key, value in info.items():
            if key not in ('type', 'description'):
                print(f"   {key}: {value}")
        
        # 健康检查
        print("\n[3/5] 执行健康检查...")
        health = storage.health_check()
        status = health.get("status")
        if status == "healthy":
            print(f"✅ 健康状态: {status}")
        else:
            print(f"❌ 健康状态: {status}")
            print(f"   错误: {health.get('error')}")
            return False
        
        # 读取数据
        print("\n[4/5] 读取账号数据...")
        accounts = storage.load_accounts()
        print(f"✅ 成功读取 {len(accounts)} 个账号")
        
        # 写入测试（可选）
        print("\n[5/5] 测试写入功能...")
        test_account = {
            "access_token": "test_token_" + str(os.getpid()),
            "type": "Free",
            "status": "测试",
            "quota": 0,
            "email": "test@example.com",
        }
        
        # 添加测试账号
        test_accounts = accounts + [test_account]
        storage.save_accounts(test_accounts)
        print("✅ 写入测试账号成功")
        
        # 验证写入
        reloaded = storage.load_accounts()
        if len(reloaded) == len(test_accounts):
            print("✅ 验证写入成功")
        else:
            print(f"❌ 验证失败: 期望 {len(test_accounts)} 个账号，实际 {len(reloaded)} 个")
            return False
        
        # 恢复原始数据
        storage.save_accounts(accounts)
        print("✅ 恢复原始数据")
        
        print("\n" + "=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_storage()
    sys.exit(0 if success else 1)
