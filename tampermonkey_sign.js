/**
 * Tampermonkey论坛自动签到脚本
 * 适配：青龙面板原生定时任务（推荐）、本地直接运行
 * 功能：失败重试 + 企业微信通知兜底 + sendNotify兼容
 * 仓库用途：上传GitHub，拉取后直接在青龙面板配置定时，无依赖问题
 */
const axios = require('axios');
const { env } = process;

// ========== 引入sendNotify通知模块 ==========
let sendNotify;
try {
  sendNotify = require('./sendNotify').sendNotify;
  console.log('✅ 成功加载sendNotify.js通知模块');
} catch (error) {
  console.log('⚠️ 未找到sendNotify.js或引入失败，将仅输出日志，不推送通知');
  sendNotify = async (title, content) => {
    console.log(`[通知日志] ${title}：${content}`);
  };
}

// 配置项（核心：重试参数 + 业务参数，移除所有定时相关配置）
const config = {
  baseUrl: 'https://bbs.tampermonkey.net.cn',
  signUrl: 'https://bbs.tampermonkey.net.cn/plugin.php?id=dsu_paulsign:sign',
  cookie: env.TAMPERMONKEY_COOKIE || '',
  timeout: 10000,
  // 【重试配置】可自定义
  retry: {
    maxRetryTimes: 8, // 最大重试次数（0表示不重试）
    retryInterval: 180000, // 重试间隔（毫秒，建议≥3000）
  },
  // 企业微信机器人配置（独立通知，兜底undefined）
  qywxBot: {
    key: (env.QYWX_KEY || '').trim(),
    apiUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send',
    timeout: 15000,
    maxContentLength: 2000
  }
};

/**
 * 工具函数：异步等待（实现重试间隔）
 * @param {number} ms 等待毫秒数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 企业微信群机器人通知（独立实现，彻底兜底undefined）
 */
async function qywxBotNotify(title, content) {
  if (!config.qywxBot.key) {
    console.log('⚠️ 企业微信群机器人QYWX_KEY未配置，跳过通知');
    return;
  }

  // 内容处理：避免特殊字符和过长内容
  let message = `【${title}】\n${content}`
    .replace(/<br\/?>/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/[\x00-\x1F\x7F]/g, '');

  if (message.length > config.qywxBot.maxContentLength) {
    message = message.substring(0, config.qywxBot.maxContentLength) + '...（内容已截断）';
  }

  try {
    const response = await axios.post(
      `${config.qywxBot.apiUrl}?key=${config.qywxBot.key}`,
      { msgtype: 'text', text: { content: message } },
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: config.qywxBot.timeout,
        maxRedirects: 0
      }
    );

    // 终极兜底：所有属性访问都用?.和??，避免undefined
    const resData = response.data ?? {};
    if (resData.errcode === 0) {
      console.log('✅ 企业微信群机器人通知发送成功');
    } else {
      console.log(`❌ 企业微信群机器人通知失败：${resData.errmsg ?? '未知错误'}（错误码：${resData.errcode ?? '未知'}）`);
    }
  } catch (error) {
    // 错误信息兜底：避免访问error.response.xxx导致undefined
    let errorMsg = error.message || '未知错误';
    if (error.response) {
      errorMsg = `HTTP ${error.response.status ?? '未知状态码'}错误：${error.response.statusText ?? '接口访问失败'}`;
      if (error.response.status === 404) {
        errorMsg += '（可能是QYWX_KEY错误或机器人已删除）';
      }
    } else if (error.request) {
      errorMsg = '网络错误：无法连接到企业微信服务器';
    }
    console.log(`❌ 企业微信群机器人通知异常：${errorMsg}`);
  }
}

/**
 * 核心签到逻辑（纯业务逻辑，无重试）
 * @returns {object} { success: 布尔值, message: 结果信息, retryable: 是否可重试 }
 */
async function tampermonkeySignCore() {
  try {
    // 校验Cookie（不可重试错误）
    if (!config.cookie) {
      return { success: false, message: '❌ 未配置TAMPERMONKEY_COOKIE，请检查环境变量', retryable: false };
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': config.cookie,
      'Referer': config.baseUrl,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    // 获取formhash
    console.log('🔍 获取签到页面信息...');
    const pageRes = await axios.get(config.signUrl, { headers, timeout: config.timeout, maxRedirects: 0 });
    const formhashMatch = pageRes.data.match(/formhash=(\w+)/i);
    if (!formhashMatch) {
      // 若页面包含“登录”，说明Cookie失效（不可重试），否则可重试
      const retryable = !pageRes.data.includes('登录');
      const message = retryable
        ? '❌ 未提取到formhash，可能是页面临时解析失败'
        : '❌ 未提取到formhash，Cookie已失效（请重新获取）';
      return { success: false, message, retryable };
    }
    const formhash = formhashMatch[1];
    console.log(`✅ 提取到formhash：${formhash}`);

    // 执行签到
    console.log('🚀 执行签到...');
    const signRes = await axios.post(
      config.signUrl,
      `formhash=${formhash}&signsubmit=yes&handlekey=sign&emotid=1&content=`,
      { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: config.timeout }
    );
    const signHtml = signRes.data;

    // 判断结果
    if (signHtml.includes('今日已签到') || signHtml.includes('已签过到')) {
      return { success: true, message: '✅ 今日已完成签到，无需重复操作', retryable: false };
    } else if (signHtml.includes('签到成功')) {
      return { success: true, message: '🎉 签到成功，获得今日奖励', retryable: false };
    } else if (signHtml.includes('登录')) {
      // Cookie失效（不可重试）
      return { success: false, message: '❌ 签到失败，Cookie已失效（请重新获取）', retryable: false };
    } else {
      // 未知结果（可重试）
      return { success: false, message: '❌ 签到失败，返回未知结果', retryable: true };
    }

  } catch (error) {
    let message = `❌ 签到异常：${error.message || '未知错误'}`;
    // 区分可重试错误（网络错误、超时）和不可重试错误
    let retryable = false;
    if (error.message.includes('timeout') || error.message.includes('网络错误') || error.request) {
      retryable = true;
      message = error.message.includes('timeout')
        ? '❌ 签到请求超时（网络波动）'
        : '❌ 签到网络错误（无法连接服务器）';
    }
    return { success: false, message, retryable };
  }
}

/**
 * 带重试逻辑的签到入口函数
 */
async function tampermonkeySignWithRetry() {
  console.log(`\n========== 签到任务开始执行（${new Date().toLocaleString()}）==========`);
  let notifyTitle = 'Tampermonkey论坛签到结果';
  let notifyContent = '';
  let retryCount = 0; // 当前重试次数

  // 循环执行签到，直到成功、达到最大重试次数或遇到不可重试错误
  while (retryCount <= config.retry.maxRetryTimes) {
    const result = await tampermonkeySignCore();

    // 签到成功或遇到不可重试错误，终止循环
    if (result.success || !result.retryable) {
      notifyContent = result.message;
      console.log(notifyContent);
      break;
    }

    // 可重试错误，判断是否还有重试次数
    retryCount++;
    if (retryCount > config.retry.maxRetryTimes) {
      notifyContent = `${result.message}（已重试${config.retry.maxRetryTimes}次，终止任务）`;
      console.log(notifyContent);
      break;
    }

    // 输出重试提示，等待后重试
    console.log(`${result.message}（将在${config.retry.retryInterval / 1000}秒后进行第${retryCount}次重试，剩余重试次数：${config.retry.maxRetryTimes - retryCount}）`);
    await sleep(config.retryInterval);
  }

  // 发送通知（用try/catch包裹，避免通知错误中断任务）
  try {
    await sendNotify(notifyTitle, notifyContent);
  } catch (notifyErr) {
    console.log(`❌ sendNotify通知发送失败：${notifyErr.message || '未知错误'}`);
  }

  try {
    await qywxBotNotify(notifyTitle, notifyContent);
  } catch (qywxErr) {
    console.log(`❌ 企业微信机器人通知发送失败：${qywxErr.message || '未知错误'}`);
  }

  console.log(`========== 签到任务执行结束（${new Date().toLocaleString()}）==========\n`);
}

// 直接执行签到（依赖青龙面板原生定时任务配置）
tampermonkeySignWithRetry();
