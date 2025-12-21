/**
 * winmoes.com 自动签到脚本（青龙面板专用）
 * 作者：青龙面板助手
 * 说明：优先账号密码登录，支持多账号、结果推送，备用Cookie登录方案
 * 注意：需根据抓包结果修改脚本中的接口URL、参数名等占位符
 */
const axios = require('axios');
const qs = require('qs');

// 配置项（需根据抓包结果修改）
const CONFIG = {
    // 登录接口配置
    login: {
        url: 'https://winmoes.com/api/user/login', // 替换为实际登录接口URL
        method: 'POST', // 替换为实际请求方法（GET/POST）
        // 请求参数名（替换为实际抓包的参数名）
        params: {
            username: 'email', // 账号/邮箱的参数名（如：username/email/mobile）
            password: 'password' // 密码的参数名（如：password/pwd）
        },
        // 登录请求头（根据抓包结果补充，如Content-Type、User-Agent等）
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        }
    },
    // 签到接口配置
    sign: {
        url: 'https://winmoes.com/api/user/sign', // 替换为实际签到接口URL
        method: 'POST', // 替换为实际请求方法（GET/POST）
        // 签到请求头（通常需要携带登录后的Cookie）
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    }
};

/**
 * 读取青龙环境变量
 * @param {string} key 变量名
 * @returns {string} 变量值
 */
const getEnv = (key) => {
    return $.env.get(key) || '';
};

/**
 * 发送青龙通知
 * @param {string} title 标题
 * @param {string} desc 描述
 * @param {string} subDesc 子描述
 */
const sendNotify = (title, desc, subDesc = '') => {
    try {
        $.notify(title, desc, subDesc);
    } catch (e) {
        console.log('通知推送失败：', e.message);
    }
};

/**
 * 账号密码登录函数
 * @param {string} account 账号/邮箱
 * @param {string} password 密码
 * @returns {object} 登录后的请求头（包含Cookie）
 */
const login = async (account, password) => {
    try {
        // 构造登录参数
        const loginData = {};
        loginData[CONFIG.login.params.username] = account;
        loginData[CONFIG.login.params.password] = password;

        // 发送登录请求
        const loginResponse = await axios({
            url: CONFIG.login.url,
            method: CONFIG.login.method,
            headers: CONFIG.login.headers,
            data: CONFIG.login.method === 'POST' ? qs.stringify(loginData) : loginData,
            withCredentials: true, // 保存Cookie（关键）
            maxRedirects: 0 // 禁止重定向，避免丢失Cookie
        });

        // 处理登录响应（根据实际返回结果修改判断逻辑）
        const res = loginResponse.data;
        if (res.code === 200 || res.success) {
            console.log(`[${account}] 登录成功`);
            // 获取登录后的Cookie（axios会自动保存，这里提取到headers中供签到使用）
            const cookies = loginResponse.headers['set-cookie'] || [];
            const cookieHeader = cookies.join('; ');
            return {
                ...CONFIG.sign.headers,
                Cookie: cookieHeader
            };
        } else {
            throw new Error(`登录失败：${res.msg || res.message}`);
        }
    } catch (error) {
        throw new Error(`[${account}] 登录异常：${error.message}`);
    }
};

/**
 * 签到函数
 * @param {string} account 账号/邮箱
 * @param {object} headers 登录后的请求头
 * @returns {string} 签到结果
 */
const signIn = async (account, headers) => {
    try {
        // 发送签到请求
        const signResponse = await axios({
            url: CONFIG.sign.url,
            method: CONFIG.sign.method,
            headers: headers,
            withCredentials: true,
            maxRedirects: 0
        });

        // 处理签到响应（根据实际返回结果修改判断逻辑）
        const res = signResponse.data;
        if (res.code === 200 || res.success) {
            return `[${account}] 签到成功：${res.msg || '获得奖励'}`;
        } else if (res.code === 1001 || res.msg.includes('已签到')) {
            return `[${account}] 今日已签到`;
        } else {
            throw new Error(`签到失败：${res.msg || res.message}`);
        }
    } catch (error) {
        throw new Error(`[${account}] 签到异常：${error.message}`);
    }
};

/**
 * 备用方案：Cookie直接签到
 * @param {string} account 账号标识（自定义，如邮箱）
 * @param {string} cookie Cookie字符串
 * @returns {string} 签到结果
 */
const signInByCookie = async (account, cookie) => {
    try {
        const headers = {
            ...CONFIG.sign.headers,
            Cookie: cookie
        };
        return await signIn(account, headers);
    } catch (error) {
        throw new Error(`[${account}] Cookie签到异常：${error.message}`);
    }
};

/**
 * 主函数：处理多账号签到
 */
const main = async () => {
    console.log('========== winmoes.com 签到脚本开始执行 ==========');
    let notifyContent = ''; // 推送内容汇总

    // 优先处理账号密码登录（环境变量：WINMOES_ACCOUNTS）
    const accountsStr = getEnv('WINMOES_ACCOUNTS');
    if (accountsStr) {
        const accounts = accountsStr.split('\n').filter(item => item.trim());
        for (const accountItem of accounts) {
            // 分割账号和密码（格式：账号|密码，多账号换行）
            const [account, password] = accountItem.split('|').map(item => item.trim());
            if (!account || !password) {
                const errorMsg = `账号密码格式错误：${accountItem}（正确格式：账号|密码）`;
                console.log(errorMsg);
                notifyContent += `${errorMsg}\n`;
                continue;
            }

            try {
                // 登录
                const headers = await login(account, password);
                // 签到
                const signResult = await signIn(account, headers);
                console.log(signResult);
                notifyContent += `${signResult}\n`;
            } catch (error) {
                console.log(error.message);
                notifyContent += `${error.message}\n`;
            }
            // 多账号间隔（避免请求过快被封）
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else {
        // 备用方案：Cookie签到（环境变量：WINMOES_COOKIES）
        const cookiesStr = getEnv('WINMOES_COOKIES');
        if (!cookiesStr) {
            const errorMsg = '未配置环境变量：请配置WINMOES_ACCOUNTS（账号密码）或WINMOES_COOKIES（Cookie）';
            console.log(errorMsg);
            sendNotify('winmoes.com 签到失败', errorMsg);
            return;
        }

        const cookies = cookiesStr.split('\n').filter(item => item.trim());
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const account = `账号${i + 1}`; // 自定义账号标识（也可在Cookie后加|标识，如：cookie|账号）
            try {
                const signResult = await signInByCookie(account, cookie);
                console.log(signResult);
                notifyContent += `${signResult}\n`;
            } catch (error) {
                console.log(error.message);
                notifyContent += `${error.message}\n`;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // 发送签到结果推送
    sendNotify('winmoes.com 签到结果', notifyContent.trim(), new Date().toLocaleString());
    console.log('========== winmoes.com 签到脚本执行结束 ==========');
};

// 执行主函数
main().catch(error => {
    console.log('脚本执行异常：', error.message);
    sendNotify('winmoes.com 签到脚本异常', error.message);
});
