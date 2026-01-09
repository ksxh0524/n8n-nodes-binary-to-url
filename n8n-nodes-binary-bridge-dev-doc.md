# 🚀 n8n-nodes-binary-bridge 开发文档

## 1. 项目概述
**项目名称**：`n8n-nodes-binary-bridge`
**核心目标**：为 n8n 提供一个高性能、零配置的“二进制文件转公网 URL”解决方案，特别针对 n8n Cloud 用户解决存储难题。
**核心架构**：**Single-Node Proxy (单节点代理)**。节点不仅处理文件上传，还通过内置 Webhook 充当文件流的转发服务器，实现数据闭环。

---

## 2. 核心功能模块

### 2.1 上传模式 (Upload Mode)
*   **输入**：任意二进制数据（图片、视频、PDF 等）。
*   **动作**：
    1.  检测 MIME 类型（如 `image/png`）。
    2.  流式上传至后端存储（S3 或 Supabase）。
    3.  生成唯一 `fileKey`。
*   **输出**：返回 n8n 内部代理 URL 及 `fileKey`。

### 2.2 代理模式 (Proxy Mode - Webhook)
*   **触发**：外部 HTTP GET 请求节点生成的 URL。
*   **动作**：
    1.  从 URL 路径解析 `fileKey`。
    2.  从后端存储请求文件流。
    3.  **管道转发 (Pipe)**：将存储端的流直接导向 HTTP 响应头。
*   **特性**：支持 `Content-Type` 透传，支持浏览器预览 (`inline`)。

### 2.3 清理模式 (Delete Mode)
*   **输入**：`fileKey`。
*   **动作**：从后端存储物理删除文件，释放空间。

---

## 3. 技术架构与实现细节

### 3.1 节点定义 (`BinaryBridge.node.ts`)
必须利用 `INodeType` 的双重身份。

```typescript
export class BinaryBridge implements INodeType {
    description: INodeTypeDescription = {
        // ... 基础信息
        webhooks: [
            {
                name: 'default',
                httpMethod: 'GET',
                responseMode: 'onReceived',
                path: 'file/:fileKey', 
                isFullPath: true, // 关键：确保 URL 长期有效
            },
        ],
        properties: [
            // 1. 操作选择：Upload / Delete
            // 2. 存储驱动：S3 / Supabase
            // 3. 凭据引用：awsS3Api / supabaseApi
        ],
    };
}
```

### 3.2 存储驱动层 (`drivers/`)
采用策略模式封装不同存储后端，复用 n8n 官方凭据：

*   **S3 驱动**：使用 `@aws-sdk/client-s3`。
    *   复用 `awsS3Api` 凭据。
    *   实现 `uploadStream` 和 `downloadStream`。
*   **Supabase 驱动**：使用 `@supabase/supabase-js`。
    *   复用 `supabaseApi` 凭据。
    *   利用 `storage.from(bucket).upload()` 和 `download()`。

### 3.3 高性能流处理 (Streaming)
这是保证节点在 n8n Cloud 稳定运行的关键。在 `webhook` 方法中：

```typescript
async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const fileKey = this.getWebhookName();
    const { stream, contentType } = await storage.getStream(fileKey);

    return {
        res: {
            status: 200,
            body: stream, // 直接返回流，不占用内存
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // 开启 24 小时缓存
                'Content-Disposition': 'inline',          // 允许浏览器预览
            },
        },
    };
}
```

---

## 4. 关键技术难点与对策

| 难点 | 对策 |
| :--- | :--- |
| **n8n Cloud 内存溢出** | 全程使用 `ReadableStream` 进行数据转发，禁止将大文件读取为 `Buffer`。 |
| **Webhook 地址变动** | 使用 `this.getNodeWebhookUrl('default')` 动态获取，自动适配测试环境与生产环境。 |
| **文件类型丢失** | 在上传阶段利用 `file-type` 库识别并记录 MIME，存储在后端 Metadata 或文件名后缀中。 |
| **安全性** | `fileKey` 采用 UUID v4 或高强度 Hash，防止文件被恶意遍历。 |

---

## 5. 开发路线图 (Roadmap)

1.  **Phase 1 (MVP)**：
    *   支持 S3 驱动。
    *   实现核心上传与 Webhook 代理转发逻辑。
    *   支持图片和视频的基础预览。
2.  **Phase 2 (Optimization)**：
    *   增加 Supabase 存储支持。
    *   添加自动过期清理功能（TTL）。
    *   支持 `302 Redirect` 模式（针对大文件的带宽优化）。
3.  **Phase 3 (Enterprise)**：
    *   增加访问统计（查看文件被调用次数）。
    *   支持自定义 CDN 域名替换。

---

## 6. 环境要求
*   **n8n 版本**：>= 1.0.0
*   **开发语言**：TypeScript
*   **依赖库**：`@aws-sdk/client-s3`, `@supabase/supabase-js`, `file-type`
