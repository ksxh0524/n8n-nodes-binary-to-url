# 安装和使用 n8n-nodes-binary-to-url

## 安装步骤

### 方法 1：通过 npm 安装（推荐）

```bash
npm install n8n-nodes-binary-to-url
```

### 方法 2：本地安装

1. 克隆或下载此项目
2. 在项目目录运行：
```bash
npm install
npm run build
npm pack
```
3. 在 n8n 目录安装：
```bash
npm install /path/to/n8n-nodes-binary-to-url-x.x.x.tgz
```

### 重启 n8n

**重要：** 安装或更新后必须重启 n8n 才能看到新的节点和凭证类型！

```bash
# 如果使用 npm 安装的 n8n
n8n restart

# 如果使用 Docker
docker-compose restart n8n

# 如果使用 systemd
sudo systemctl restart n8n
```

## 配置 S3 API 凭证

安装并重启 n8n 后：

1. 打开 n8n 界面
2. 进入 **Credentials** 页面
3. 点击 **Add Credential**
4. 在列表中找到并选择 **S3 API**
5. 填写以下信息：
   - **Access Key ID**: 你的 S3 访问密钥
   - **Secret Access Key**: 你的 S3 秘密密钥
   - **Region**: AWS 区域（如 `us-east-1`）或留空
   - **S3 Endpoint**: S3 服务端点
     - AWS S3: 留空或填 `https://s3.amazonaws.com`
     - MinIO: 填你的 MinIO 地址（如 `https://minio.example.com`）
     - DigitalOcean Spaces: 填你的 Spaces 地址（如 `https://nyc3.digitaloceanspaces.com`）
     - Wasabi: 填你的 Wasabi 地址
6. 点击 **Save**

## 使用节点

1. 在工作流中添加 **Binary to URL** 节点
2. 选择之前创建的 **S3 API** 凭证
3. 配置其他参数（Bucket、Region、Endpoint 等）
   - 注意：如果在凭证中已经配置了 Region 和 Endpoint，这里可以留空
4. 选择操作：
   - **Upload**: 上传二进制文件到 S3 并返回访问 URL
   - **Delete**: 删除 S3 中的文件

## 故障排除

### 看不到 "S3 API" 凭证类型

1. 确认已安装包：`npm list n8n-nodes-binary-to-url`
2. **重启 n8n**（这是最常见的错误）
3. 检查 n8n 日志是否有错误

### 看不到 "Binary to URL" 节点

1. 同上，确认安装和重启
2. 刷新浏览器页面
3. 清除浏览器缓存

### 凭证测试失败

某些 S3 兼容服务可能不支持根路径测试（`/`），这是正常的，不影响实际使用。

### 上传失败

1. 检查 Access Key 和 Secret Key 是否正确
2. 检查 Bucket 名称是否正确
3. 检查 Endpoint 地址是否正确（包括协议 `https://`）
4. 检查网络连接
5. 查看 n8n 执行日志获取详细错误信息

## 支持的服务

- ✅ AWS S3
- ✅ MinIO
- ✅ DigitalOcean Spaces
- ✅ Wasabi
- ✅ Alibaba Cloud OSS
- ✅ Tencent Cloud COS
- ✅ 其他所有 S3 兼容服务
