import requests
import os

# 设置环境变量
USERNAME = os.getenv("Y3LT_SIGNIN_USERNAME")
PASSWORD = os.getenv("Y3LT_SIGNIN_PASSWORD")
COOKIE = os.getenv("Y3LT_SIGNIN_COOKIE")

# 登录
def login():
    login_url = "https://www.3ylt.xyz/api/login"  # 假设登录API路径
    payload = {
        "username": USERNAME,
        "password": PASSWORD
    }
    
    if COOKIE:
        headers = {
            "Cookie": COOKIE
        }
        response = requests.get(login_url, headers=headers)
    else:
        response = requests.post(login_url, json=payload)

    if response.status_code == 200 and "token" in response.json():
        return response.json()["token"]
    else:
        print("登录失败:", response.json())
        return None

# 签到
def sign_in(token):
    sign_url = "https://www.3ylt.xyz/api/signin"  # 假设签到API路径
    headers = {
        "Authorization": f"Bearer {token}"
    }
    response = requests.post(sign_url, headers=headers)
    
    if response.status_code == 200:
        return response.json()
    else:
        print("签到失败:", response.json())
        return None

# 消息推送
def push_message(message):
    # 假设使用一个消息推送服务的API
    push_url = "https://api.pushservice.com/send"
    payload = {
        "message": message
    }
    response = requests.post(push_url, json=payload)
    print("消息推送结果:", response.json())

if __name__ == "__main__":
    token = login()
    if token:
        sign_result = sign_in(token)
        if sign_result:
            push_message("签到成功: " + str(sign_result))
        else:
            push_message("签到失败")
