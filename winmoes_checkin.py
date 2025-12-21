# -*- coding: utf-8 -*-
"""
cron: 30 7 * * *
new Env('云间WinMoes签到');
"""

import requests
import os
import json

# 通知推送功能（集成青龙内部 notify 模块）
def load_send():
    global send
    cur_path = os.path.abspath(os.path.dirname(__file__))
    if os.path.exists(cur_path + "/notify.py"):
        try:
            from notify import send
        except:
            send = None
    else:
        send = None

load_send()

class WinMoes:
    def __init__(self, account, password):
        self.base_url = "https://winmoes.com"
        self.account = account
        self.password = password
        self.session = requests.Session()
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": self.base_url,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest"
        }

    def login(self):
        """登录获取登录状态"""
        login_url = f"{self.base_url}/wp-admin/admin-ajax.php"
        data = {
            "action": "b2_login",
            "username": self.account,
            "password": self.password,
        }
        try:
            res = self.session.post(login_url, data=data, headers=self.headers, timeout=15)
            # 网站通常返回 200，内容包含是否成功
            if "b2_token" in self.session.cookies:
                return True
            return False
        except Exception as e:
            print(f"登录异常: {e}")
            return False

    def check_in(self):
        """执行签到"""
        checkin_url = f"{self.base_url}/wp-admin/admin-ajax.php"
        data = {
            "action": "user_sign",
        }
        try:
            res = self.session.post(checkin_url, data=data, headers=self.headers, timeout=15)
            # 处理返回结果
            if res.status_code == 200:
                try:
                    result = res.json()
                    # 已经签到或签到成功的逻辑处理
                    if isinstance(result, dict):
                        return f"签到成功！{result.get('data', '')}"
                    return f"签到返回: {res.text[:50]}"
                except:
                    if "已经" in res.text:
                        return "今日已签到，请勿重复操作。"
                    return f"签到成功 (原始响应): {res.text[:30]}"
            else:
                return f"签到请求失败，状态码: {res.status_code}"
        except Exception as e:
            return f"签到过程出错: {e}"

    def run(self):
        print(f"--- 账号 {self.account} 开始执行 ---")
        if self.login():
            msg = self.check_in()
            print(msg)
            return f"账号[{self.account}]: {msg}"
        else:
            msg = "登录失败，请检查账号密码或网站是否开启了验证码/防火墙。"
            print(msg)
            return f"账号[{self.account}]: {msg}"

if __name__ == "__main__":
    # 从青龙环境变量读取
    accounts_env = os.getenv("WINMOES_ACCOUNT")
    passwords_env = os.getenv("WINMOES_PASSWORD")

    if not accounts_env or not passwords_env:
        print("未检测到环境变量 WINMOES_ACCOUNT 或 WINMOES_PASSWORD")
        exit(0)

    # 支持多账号，用 & 分隔
    accounts = accounts_env.split('&')
    passwords = passwords_env.split('&')
    
    final_results = []
    
    for acc, pwd in zip(accounts, passwords):
        bot = WinMoes(acc, pwd)
        result = bot.run()
        final_results.append(result)

    # 推送消息
    summary = "\n".join(final_results)
    if send:
        send("云间签到任务报告", summary)
