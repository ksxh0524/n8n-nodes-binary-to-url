### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.1.0](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/compare/0.0.11...0.1.0)

> 11 January 2026

- **fix**: 修复 fileKey 正则表达式与生成格式不匹配的严重 Bug
- **security**: 重构存储为按工作流隔离，修复多工作流数据共享问题
- **feat**: 添加 TTL 验证（最小 60 秒，最大 7 天）
- **feat**: 添加二进制数据多格式支持（Buffer、Base64 string、$binary object）
- **feat**: 添加日志记录
- **refactor**: 改进错误处理和类型安全

#### [0.0.11](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/compare/0.0.7...0.0.11)

- refactor: 重构项目为纯内存存储实现 [`67b0471`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/67b04712838a1330eb5715d84e18772e53314f9f)
- refactor: 移除S3存储支持并简化内存存储实现 [`e9199c2`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/e9199c20b9b94d8b2ddece1563e9f111959e4e4b)
- feat: 添加内存存储选项及文件过期时间功能 [`cbc5d26`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/cbc5d26889efb73265d47077c36fca9b9d88c357)

#### [0.0.7](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/compare/0.0.6...0.0.7)

> 10 January 2026

- refactor(S3): 重命名并增强S3凭证功能 [`2183922`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/218392274d1d6d2569211df4aae6d0df4c4de96e)

#### 0.0.6

> 10 January 2026

- build: 添加 Jest 相关依赖以支持单元测试 [`4009c4b`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/4009c4bb69c1cdbe062b6b7b2c57bc6ab1ea561b)
- refactor: 按照n8n官方规范重构项目 [`60bc118`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/60bc118e18a60f04dd17cc98dea47790338939e1)
- refactor: 移除Supabase支持并重构S3驱动实现 [`93842de`](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url/commit/93842def1cdf058526a045f1ae0701ef2fdc67ed)
