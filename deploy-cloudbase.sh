#!/bin/bash
# ==========================================
# 腾讯云 CloudBase 静态托管部署脚本
# ==========================================
# 使用前请先完成以下准备工作：
# 1. 注册腾讯云账号并完成实名认证
# 2. 创建云开发环境（控制台: https://tcb.cloud.tencent.com/dev）
# 3. 安装 CloudBase CLI: npm i -g @cloudbase/cli
# 4. 登录: tcb login
# 5. 将下方 ENV_ID 替换为你的云开发环境ID
# ==========================================

ENV_ID="eamon-2026-d2gzxhqsk854c91e7"

# 部署所有文件到 CloudBase 静态托管
echo "🚀 开始部署到腾讯云 CloudBase..."
echo "环境ID: $ENV_ID"

# 检查是否安装了 tcb
if ! command -v tcb &> /dev/null; then
  echo "❌ 未检测到 CloudBase CLI，正在安装..."
  npm i -g @cloudbase/cli
fi

# 检查是否已登录
echo "📋 检查登录状态..."
tcb env list -e "$ENV_ID" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "❌ 请先运行 tcb login 登录腾讯云"
  exit 1
fi

# 部署 index.html
echo "📤 上传 index.html..."
tcb hosting deploy index.html -e "$ENV_ID"

# 部署 assets 文件夹（图片、视频、音频）
echo "📤 上传 assets 文件夹（可能需要几分钟）..."
tcb hosting deploy assets/ -e "$ENV_ID"

echo ""
echo "✅ 部署完成！"
echo ""
echo "🌐 访问地址: https://$ENV_ID.tcloudbaseapp.com"
echo ""
echo "后续步骤:"
echo "  1. 在浏览器打开上面的地址验证网站"
echo "  2. 如需自定义域名，前往控制台绑定"
echo "  3. 如需 CDN 加速，在控制台开启 CDN 配置"
echo ""
echo "Firebase 数据（文章/留言板）仍通过新加坡节点访问，"
echo "数据量小影响不大。如需迁移数据库到 CloudBase，"
echo "需额外改造前端 SDK 调用。"
