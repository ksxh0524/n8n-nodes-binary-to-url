# 安装和使用 n8n-nodes-binary-to-url

## ⚠️ 重要说明

**此节点用于在工作流执行期间创建临时URL，不适用于长期文件存储或分享。**

- ❌ **不是**文件存储服务
- ❌ **不适用**于长期URL分享
- ✅ **用于**工作流节点间的临时URL传递
- ✅ **用于**短期的外部访问（几分钟到几小时）
- ✅ **用于**工作流内部的二进制数据处理

文件存储在内存中，过期后自动删除。

---

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

**重要：** 安装或更新后必须重启 n8n 才能看到新的节点！

```bash
# 如果使用 npm 安装的 n8n
n8n restart

# 如果使用 Docker
docker-compose restart n8n

# 如果使用 systemd
sudo systemctl restart n8n
```

---

## 使用节点

### 基本用法

此节点为二进制数据创建临时URL，可在工作流内部或外部访问。

**使用场景：在节点间传递二进制数据**

```yaml
工作流：
  1. HTTP Request（下载图片）
  2. Binary to URL（创建临时URL）
  3. HTTP Request（将URL发送给另一个API）
  4. Binary to URL（删除文件 - 可选）
```

### Upload 操作

1. 选择 **Upload** 操作
2. 配置参数：
   - **Binary Property**: 包含文件的二进制属性名（默认：`data`）
   - **URL Expiration Time (seconds)**: URL有效期（默认：600秒 = 10分钟）
3. 连接任何包含二进制数据的节点（如 HTTP Request、Read Binary File）
4. 执行工作流

**输出示例：**

```json
{
  "fileKey": "1704801234567-abc123def456",
  "proxyUrl": "https://your-n8n.com/webhook/123/file/1704801234567-abc123def456",
  "contentType": "image/jpeg",
  "fileSize": 245678
}
```

**使用URL：**

- **工作流内部**：将 `proxyUrl` 传递给需要访问文件的后续节点
- **外部访问**：在浏览器中打开或通过API调用（TTL过期后将失效）

**注意：** URL是临时的，过期后将无法访问。

### Delete 操作

1. 选择 **Delete** 操作
2. 提供要删除的文件键：
   - 在 **File Key** 参数中直接输入
   - 或从上一个节点的 `fileKey` 属性获取

---

## 典型使用场景

### 1. 节点间传递二进制数据

下载图片，用外部API处理，然后删除。

```yaml
工作流：
  1. HTTP Request（从URL A下载图片）
  2. Binary to URL（TTL: 300 = 5分钟）
  3. HTTP Request（将proxyUrl发送给外部API处理）
  4. Binary to URL（操作：Delete，清理）
```

### 2. 邮件附件临时链接

生成PDF，通过邮件发送，然后删除。

```yaml
工作流：
  1. 生成 PDF 报告
  2. Binary to URL（TTL: 600 = 10分钟）
  3. 发送邮件（使用proxyUrl作为附件链接）
  4. Binary to URL（操作：Delete，可选 - 会自动过期）
```

⚠️ **警告：** TTL过期后邮件接收者将无法访问文件。对于邮件附件，建议使用专用的文件存储服务。

### 3. 批量文件处理

用外部服务处理多个文件。

```yaml
工作流：
  1. Read Binary Files（从文件夹读取）
  2. Split In Batches（分批处理）
  3. Binary to URL（TTL: 300 = 5分钟）
  4. HTTP Request（发送到处理API）
  5. Binary to URL（操作：Delete）
```

### 4. 临时预览链接

为webhook响应生成临时预览链接。

```yaml
工作流：
  1. Webhook（触发器）
  2. 生成报告
  3. Binary to URL（TTL: 180 = 3分钟）
  4. 响应Webhook（响应中包含proxyUrl）
```

URL将在3分钟后失效并自动过期。

---

## 存储限制

- **最大文件大小**: 100 MB
- **最大缓存大小**: 100 MB
- **默认 TTL**: 600 秒（10分钟）
- **最小 TTL**: 60 秒（1分钟）

**推荐的TTL值：**

- **60-300秒** (1-5分钟): 工作流内部使用
- **300-600秒** (5-10分钟): 短期处理
- **600-3600秒** (10-60分钟): 较长操作（不推荐）

当缓存满时，最旧的文件会被自动删除以为新上传腾出空间。

## 故障排除

### 看不到 "Binary to URL" 节点

1. 确认已安装包：`npm list n8n-nodes-binary-to-url`
2. **重启 n8n**（这是最常见的错误）
3. 刷新浏览器页面
4. 清除浏览器缓存

### 文件 URL 返回 404

可能的原因：
1. 工作流未激活（webhook 只在激活的工作流中工作）
2. 文件已过期（TTL 已经过）
3. 文件键不正确
4. 内存缓存已满且文件被驱逐

解决方案：
- 确保工作流处于激活状态
- 检查文件是否仍在 TTL 期限内
- 重新上传文件
- 增加缓存大小或 TTL

### 内存使用过高

如果 n8n 进程占用内存过多：

1. 减少 TTL 使文件更快过期
2. 在源代码中减少 `MAX_CACHE_SIZE`（默认 100MB）
3. 使用后手动删除文件而不是依赖自动过期

### 缓存已满

当缓存达到 100MB 限制时：

1. 等待一些文件过期
2. 使用 Delete 操作手动删除旧文件
3. 如果你有更多可用 RAM，可以在源代码中增加 `MAX_CACHE_SIZE`

## 支持的文件类型

**图片：**
- JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, AVIF

**视频：**
- MP4, WebM, MOV, AVI, MKV

**音频：**
- MP3, WAV, OGG, FLAC

**文档：**
- PDF, ZIP, RAR, 7Z, TXT, CSV, JSON, XML, XLSX, DOCX

## 性能优化建议

1. **根据使用场景设置合适的 TTL**
   - 短期分享（几分钟到几小时）：3600-7200 秒
   - 一天内访问：86400 秒
   - 长期存储（不推荐）：604800 秒（7天）

2. **定期清理**
   - 对于敏感文件，使用后立即删除
   - 不要依赖自动过期处理敏感数据

3. **监控内存使用**
   - 在高负载环境中，监控 n8n 进程的内存使用
   - 根据可用 RAM 调整 `MAX_CACHE_SIZE`

## 技术细节

- **存储方式**: n8n 进程内存
- **清理策略**: TTL + LRU（最近最少使用）
- **文件键格式**: `{timestamp}-{random}`
- **依赖**: 无（零外部依赖）

## 安全建议

1. 不要通过此节点存储敏感文件超过必要时间
2. 使用较短的 TTL
3. 使用后立即删除敏感文件
4. 确保 n8n 实例有适当的访问控制
5. 在生产环境中考虑使用 HTTPS
