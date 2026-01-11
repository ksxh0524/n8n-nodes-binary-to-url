# Binary to URL 节点测试指南

## 📋 前置条件

1. ✅ 已安装节点到 n8n
2. ✅ 已重启 n8n
3. ⚠️ **重要：工作流必须处于激活（Active）状态**

## 🧪 测试步骤

### 1. 创建测试工作流

#### 步骤 1：添加手动触发器

```
节点：Manual Trigger
```

#### 步骤 2：添加 HTTP Request（下载测试图片）

```
节点：HTTP Request
方法：GET
URL：https://picsum.photos/200/300
Response Format：File
```

#### 步骤 3：添加 Binary to URL（上传）

```
节点：Binary to URL
操作：Upload
Binary Property：data
URL Expiration Time：600 (10分钟)
```

#### 步骤 4：保存并激活工作流

```
1. 保存工作流
2. 记下工作流 ID（在 URL 中可以看到）
3. **激活工作流（Active）** ← 这一步很重要！
```

### 2. 执行测试

#### 步骤 1：执行工作流

1. 点击 "Execute Workflow" 按钮
2. 查看 Binary to URL 节点的输出

**预期输出：**

```json
{
  "fileKey": "1704801234567-abc123def456",
  "proxyUrl": "http://127.0.0.1:5678/webhook/abc-123-def/file/1704801234567-abc123def456",
  "contentType": "image/jpeg",
  "fileSize": 24567
}
```

#### 步骤 2：复制 proxyUrl

从输出中复制 `proxyUrl` 的值。

#### 步骤 3：在浏览器中访问

1. 打开新标签页
2. 粘贴 URL 并访问
3. 应该看到图片显示

### 3. 验证结果

**成功标志：**

- ✅ Binary to URL 节点输出包含 `fileKey` 和 `proxyUrl`
- ✅ 在浏览器中访问 URL 能看到文件正确显示
- ✅ 文件类型正确（图片显示为图片，PDF显示为PDF等）

## ❗ 常见问题排查

### 问题 1：404 Not Found

**可能原因 A：工作流未激活**

- ❌ 错误：工作流处于 Inactive 状态
- ✅ 解决：点击右上角的 "Active" 开关激活工作流

**可能原因 B：URL 路径不匹配**

- 检查 URL 格式是否为：`/webhook/{workflowId}/file/{fileKey}`

**可能原因 C：文件已过期**

- 检查 TTL 设置
- 重新上传文件并立即访问

### 问题 2：File not found or expired

**可能原因：**

- 文件的 TTL 已过期
- 内存缓存已满，文件被驱逐
- n8n 进程重启（内存数据丢失）

**解决方案：**

- 延长 TTL 时间
- 重新上传文件

### 问题 3：工作流激活后仍然 404

**可能原因：Webhook 路径未注册**

**解决方案：**

1. 停用工作流
2. 保存工作流
3. 重新激活工作流
4. 等待几秒让 webhook 注册
5. 再次访问 URL

## 🔍 调试技巧

### 测试 Webhook 是否注册

访问：`http://127.0.0.1:5678/webhook-test/{workflowId}/file/test-filekey`

如果返回任何响应（即使是错误），说明 webhook 已注册。

### 使用 n8n 的执行日志

1. 在工作流编辑页面
2. 点击右上角的 "Executions" 按钮
3. 查看最近的执行记录
4. 点击具体的执行查看详细输出

## ✅ 成功标志

当一切正常时，你应该看到：

1. ✅ 工作流执行成功
2. ✅ Binary to URL 节点输出包含 proxyUrl
3. ✅ 在浏览器中访问 proxyUrl 能看到文件
4. ✅ 文件类型正确显示
5. ✅ URL 格式正确：`/webhook/{workflowId}/file/{fileKey}`

## 📝 测试检查清单

- [ ] 节点已安装
- [ ] n8n 已重启
- [ ] 工作流已保存
- [ ] 工作流已激活
- [ ] 可以执行工作流
- [ ] 能看到 proxyUrl 输出
- [ ] 能在浏览器中访问文件
- [ ] 文件类型正确显示
